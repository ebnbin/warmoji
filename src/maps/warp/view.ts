import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, Due, Telegraph, Transform } from '../../ecs/components'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { WarpPainter } from './painter'
import { CORE_GLOW, EXIT_GLOW, FOE_GLOW, lift, rgb, SIGNS, TEAM_GLOW, VOID_DEEP } from './palette'
import { encodeTiles, TILES_FRAG, VOID_FRAG } from './shader'
import { textureSize } from './ground'
import { DAYLIGHT, drawDoor, drawSign, EXIT_LIGHT, PLAIN_DOOR } from './doors'
import { flowDir } from './nav'
import { exitOpen, warpPlanFor, zoneMid } from './world'
import type { Hop, WarpState } from './world'
import { inBox } from './layout'
import type { Door, WarpPlan, WarpRoom } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { WarpConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const GROUND_KEY = 'warp-ground'
const TILES_KEY = 'warp-tiles'
const MASK_KEY = 'warp-mask'
const TINT_KEY = 'warp-tint'
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 刚踩上那一脚的方框扩到四边要多久，毫秒 */
const FLASH_MS = 260
/** 送走一个身体时它散成多少个光块，个头每大一格多几个 */
const VOXELS = 16
const VOXELS_PER_U = 14
/** 光块散开、聚拢各占穿行前后多久，毫秒 */
const SCATTER_MS = 220
const GATHER_MS = 320
/** 力场受击的涟漪多久、多大（格） */
const RIPPLE_MS = 420
const RIPPLE_U = 0.7
/** 门有多高、指示牌多宽，格；开在朝屏幕下方那面墙上的门挡着房里，画矮一截、淡一点 */
const DOOR_H_U = 2.5
const SIGN_W_U = 1.7
const LOW_DOOR = 0.55
/** 门开、门关各要多久，毫秒：关得快，是摔上的 */
const OPEN_MS = 260
const SLAM_MS = 110
/** 送到的身体落地以后，身后的门再开着多久才摔上，毫秒 */
const HOLD_MS = 380
/** 摔上的门牌子闪几下才熄，毫秒 */
const DIE_MS = 700
/** 出口开的那一刻，一圈绿从门槛扩满整间房要多久，毫秒 */
const SWEEP_MS = 1300
/** 开着的出口给身边的身体打的补光：多远（格）以内，最浓多少 */
const EXIT_LIGHT_U = 3.2
const EXIT_FILL = 0.5
/** 真正的出口照亮四周的身体：多远（格）以内 */
const CORE_LIGHT_U = 6
/** 门边的记号：一道多长、隔多宽，五道一组，一行几组，格 */
const TALLY_U = 0.55
const TALLY_GAP_U = 0.16
const TALLY_ROW = 3

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (t: number): number => t * t * (3 - 2 * t)

/** 整数打散成 [0, 1)：光块的位置、闪烁这些画面上的随机 */
function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 填一块四边形（按顺序的四个角，像素） */
function fillQuad(g: Phaser.GameObjects.Graphics, p: readonly Point[]): void {
  g.fillTriangle(p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y, p[2]!.x, p[2]!.y)
  g.fillTriangle(p[0]!.x, p[0]!.y, p[2]!.x, p[2]!.y, p[3]!.x, p[3]!.y)
}

function upload(tex: Phaser.Textures.CanvasTexture, filter: Phaser.Textures.FilterMode): void {
  tex.refresh()
  tex.setFilter(filter)
}

/** 每格一个像素的数据图：画布与它的像素 */
interface DataTex {
  readonly tex: Phaser.Textures.CanvasTexture
  readonly img: ImageData
}

function dataTexture(scene: Phaser.Scene, key: string): DataTex {
  const tex = canvasTexture(scene, key, FRAME_U, FRAME_U)
  return { tex, img: tex.getContext().createImageData(FRAME_U, FRAME_U) }
}

function push(d: DataTex): void {
  d.tex.getContext().putImageData(d.img, 0, 0)
  upload(d.tex, Phaser.Textures.FilterMode.NEAREST)
}

/** 第 i 间房的待机律动里，(x, y)（格）这块瓷砖排在哪：脉冲按离中心多远，光波按往出口扫的方向走到哪 */
function phaseOf(room: WarpRoom, pattern: number, x: number, y: number): number {
  const f = room.floor
  if (pattern === 0) return clamp01(Math.hypot(x - room.center.x, y - room.center.y) / 13)
  if (pattern === 1) {
    const to = zoneMid(room.exit)
    const far = { x: to.x < room.center.x ? f.x1 : f.x0, y: to.y < room.center.y ? f.y1 : f.y0 }
    const dx = to.x - far.x
    const dy = to.y - far.y
    const len = Math.hypot(dx, dy)
    return clamp01(((x - far.x) * dx + (y - far.y) * dy) / (len * len))
  }
  return noise(Math.floor(x * 7), Math.floor(y * 13))
}

/**
 * 掩码与着色图：R 是这块瓷砖的律动（加一再乘 50，0 是不会亮的地方），G 是房间（乘 64），B 是它在律动里的相位；着色图是那间房的主色
 */
function maskImages(plan: WarpPlan): { mask: Uint8ClampedArray<ArrayBuffer>; tint: Uint8ClampedArray<ArrayBuffer> } {
  const n = FRAME_U * FRAME_U
  const mask = new Uint8ClampedArray(n * 4)
  const tint = new Uint8ClampedArray(n * 4)
  for (let k = 0; k < n; k++) {
    const o = k * 4
    mask[o + 3] = 255
    tint[o + 3] = 255
    const r = plan.tiles[k]!
    if (r < 0) continue
    const room = plan.rooms[r]!
    const sign = SIGNS[room.sign]!
    const x = (k % FRAME_U) + 0.5
    const y = Math.floor(k / FRAME_U) + 0.5
    mask[o] = (sign.pattern + 1) * 50
    mask[o + 1] = room.index * 64
    mask[o + 2] = phaseOf(room, sign.pattern, x, y) * 255
    tint[o] = (sign.color >> 16) & 0xff
    tint[o + 1] = (sign.color >> 8) & 0xff
    tint[o + 2] = sign.color & 0xff
  }
  return { mask, tint }
}

/** 着色器要的会变的量 */
interface Uniforms {
  time: number
  px: number
  sweep: [number, number, number, number]
  sweepRoom: number
}

/** 一扇门此刻开了几成、门里透着什么光 */
interface DoorLook {
  open: number
  light: number
}

/**
 * 跃迁：底下是望得见底的虚空，网格上流着数据光流，正中那扇真正的出口透着日光一路照进深处；镜头跟着队长走，整块方框在画面上往四周平铺。
 * 四块平台的地面、台沿、门槛与平台的影子是开局在后台线程画好的贴图。地砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，闲着时按各间的律动透出房间的主色；
 * 门、安全出口指示牌、门边的记号、盯着队伍的监控探头、立柱、出怪板上凝成形的敌人、被送过虚空的身体散成的光块都每帧现画
 */
export class WarpView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: WarpPlan
  private cfg?: WarpConfig
  private painter?: WarpPainter
  private state?: WarpState
  private tiles?: DataTex
  private floorFx?: Phaser.GameObjects.Graphics
  private glowFx?: Phaser.GameObjects.Graphics
  private doorFx?: Phaser.GameObjects.Graphics
  private airFx?: Phaser.GameObjects.Graphics
  private readonly u: Uniforms = { time: 0, px: 0.05, sweep: [0, 0, 0, 0], sweepRoom: -1 }
  private jumpsSeen = 0
  private lastMs = 0

  private planOf(v: ViewCtx): WarpPlan {
    if (!this.plan) this.plan = warpPlanFor(v.def.warp!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, VOID_DEEP).setDepth(-2)))
    const u = this.u
    const plan = this.planOf(v)
    const seed = (v.run.decorSeed % 997) + 0.5
    const rect = [0, 0, FRAME_U, FRAME_U]
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'WarpVoid',
            fragmentSource: VOID_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uRect', rect)
              set('uTime', u.time)
              set('uSeed', seed)
              set('uCore', [plan.core.x, plan.core.y])
              set('uPx', u.px)
            },
          },
          rect[0]! * UNIT,
          rect[1]! * UNIT,
          rect[2]! * UNIT,
          rect[3]! * UNIT,
        )
        .setOrigin(0, 0)
        .setDepth(-1.6),
    )
  }

  /** 镜头跟着队长走，方框在画面上往四周平铺：往哪边看都有房间，只是画，不是世界 */
  framing(): Framing {
    return { map: FRAME, edge: 'wrap', tile: true }
  }

  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.warp!
    this.cfg = cfg
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new WarpPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    await painter.paint(rects, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex, Phaser.Textures.FilterMode.LINEAR)
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.floor(v, plan)
    this.floorFx = scene.add.graphics().setDepth(-0.8)
    this.glowFx = scene.add.graphics().setDepth(-0.75).setBlendMode(Phaser.BlendModes.ADD)
    this.doorFx = scene.add.graphics().setDepth(2.5)
    this.airFx = scene.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.floorFx, this.glowFx, this.doorFx, this.airFx)
    this.jumpsSeen = sim.worldState.warp?.jumps ?? 0
    this.lastMs = sim.elapsedMs
    v.lens.screen.vignette(0.9, 0.12, 0x020610)
  }

  /** 会亮的地砖：数据图（谁踩过）、掩码与着色图，着色器盖在地面贴图上 */
  private floor(v: ViewCtx, plan: WarpPlan): void {
    const scene = v.scene
    this.tiles = dataTexture(scene, TILES_KEY)
    const { mask, tint } = maskImages(plan)
    for (const [key, data] of [
      [MASK_KEY, mask],
      [TINT_KEY, tint],
    ] as const) {
      const t = canvasTexture(scene, key, FRAME_U, FRAME_U)
      t.getContext().putImageData(new ImageData(data, FRAME_U, FRAME_U), 0, 0)
      upload(t, Phaser.Textures.FilterMode.NEAREST)
    }
    push(this.tiles)
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'WarpTiles',
            fragmentSource: TILES_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uData', 0)
              set('uMask', 1)
              set('uTint', 2)
              set('uTime', u.time)
              set('uTeam', rgb(TEAM_GLOW))
              set('uFoe', rgb(FOE_GLOW))
              set('uSweep', u.sweep)
              set('uSweepRoom', u.sweepRoom)
              set('uSweepColor', rgb(EXIT_GLOW))
              set('uPx', u.px)
            },
          },
          0,
          0,
          FRAME.w,
          FRAME.h,
          [TILES_KEY, MASK_KEY, TINT_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.9),
    )
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.warp
    const cfg = this.cfg
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.glowFx || !this.doorFx || !this.airFx) return
    this.state = st
    const now = sim.elapsedMs
    const t = sim.fxMs / 1000
    this.u.time = t
    this.u.px = 1 / (v.lens.screen.zoom() * UNIT)
    const tl = st.tiles
    encodeTiles(this.tiles.img.data, tl.team, tl.foe, tl.teamFrom, tl.foeFrom, now, cfg.tiles.teamFadeMs, cfg.tiles.foeFadeMs, FLASH_MS)
    push(this.tiles)
    this.floorFx.clear()
    this.glowFx.clear()
    this.doorFx.clear()
    this.airFx.clear()
    this.sweep(st, now)
    this.sounds(v, st, cfg, now)
    this.trueExit(sim, st, cfg, t)
    for (const room of st.plan.rooms) {
      this.tallies(st, cfg, room)
      this.camera(sim, st, room, t)
    }
    // 靠上的门先画，靠下的盖在上面
    const doors = st.plan.rooms.flatMap((room) => [
      { room, exit: true, d: room.exit },
      { room, exit: false, d: room.entry },
    ])
    doors.sort((a, b) => a.d.y - b.d.y)
    for (const d of doors) this.door(st, cfg, d.room, d.exit, now, t)
    this.route(sim, st, now, t)
    this.pillars(st, cfg, t)
    this.forming(sim, st, cfg, now)
    for (const h of st.hops) this.voxels(h, cfg, now)
    this.ripples(st, now)
    this.lastMs = now
  }

  /** 着色器里出口开的那一刻扩满整间房的那圈绿：半径从门槛扩到房间最远的角 */
  private sweep(st: WarpState, now: number): void {
    const i = st.teamRoom
    const e = st.exits[i]!
    const k = (now - e.opensAt) / SWEEP_MS
    if (!exitOpen(st, i, now) || k >= 1) {
      this.u.sweep = [0, 0, 0, 0]
      this.u.sweepRoom = -1
      return
    }
    const room = st.plan.rooms[i]!
    const m = zoneMid(room.exit)
    const f = room.floor
    const reach = Math.max(...[f.x0, f.x1].flatMap((x) => [f.y0, f.y1].map((y) => Math.hypot(x - m.x, y - m.y))))
    this.u.sweep = [m.x, m.y, (reach + 1) * ease(k), 1 - 0.7 * k]
    this.u.sweepRoom = i
  }

  /** 倒数的最后三秒、出口开、没赶上它关上、整队出发、身后的门摔上、送来一批敌人：在镜头里才响 */
  private sounds(v: ViewCtx, st: WarpState, cfg: WarpConfig, now: number): void {
    const was = this.lastMs
    const crossed = (at: number): boolean => at > was && at <= now
    const e = st.exits[st.teamRoom]!
    if (crossed(e.opensAt)) playSfx('chime')
    for (const k of [1, 2, 3]) if (crossed(e.opensAt - k * 1000)) playSfx('tink')
    if (crossed(e.missedAt)) playSfx('thud')
    if (crossed(e.arrivedAt + cfg.exit.transitMs + HOLD_MS)) playSfx('thud')
    if (st.jumps !== this.jumpsSeen) {
      this.jumpsSeen = st.jumps
      playSfx('jump')
    }
    st.exits.forEach((x, i) => {
      const to = st.plan.rooms[(i + 1) % st.plan.rooms.length]!
      if (x.shuttled > 0 && crossed(x.shuttledAt) && v.lens.screen.sees(to.entry.land.x * UNIT, to.entry.land.y * UNIT, 2 * UNIT)) playSfx('warp')
    })
  }

  /**
   * 一扇门此刻开了几成、透着什么光。出口：队伍那间倒数到点开、到点关，队伍走的时候开着、走完摔上，没赶上的那一下摔上；
   * 别的间给敌人开一下。入口：队伍或敌人从这里出来的那一阵开着，落地后摔上
   */
  private look(st: WarpState, cfg: WarpConfig, room: WarpRoom, exit: boolean, now: number): DoorLook {
    const T = cfg.exit.transitMs
    let best: DoorLook = { open: 0, light: EXIT_LIGHT }
    const span = (from: number, to: number, light: number): void => {
      if (now < from || now > to + SLAM_MS) return
      const k = Math.min(ease(clamp01((now - from) / OPEN_MS)), now > to ? 1 - (now - to) / SLAM_MS : 1)
      if (k > best.open) best = { open: k, light }
    }
    const i = room.index
    if (exit) {
      const e = st.exits[i]!
      if (i === st.teamRoom) span(e.opensAt, e.closesAt, EXIT_LIGHT)
      span(e.jumpedAt - OPEN_MS, e.jumpedAt + T, EXIT_LIGHT)
      span(e.missedAt - OPEN_MS, e.missedAt, EXIT_LIGHT)
      if (e.shuttled > 0) span(e.shuttledAt, e.shuttledAt + T, FOE_GLOW)
      return best
    }
    const e = st.exits[i]!
    const prev = st.exits[(i + st.exits.length - 1) % st.exits.length]!
    span(e.arrivedAt, e.arrivedAt + T + HOLD_MS, EXIT_LIGHT)
    if (prev.shuttled > 0) span(prev.shuttledAt, prev.shuttledAt + T + HOLD_MS, FOE_GLOW)
    return best
  }

  /** 门立在门洞那截台沿上，门脚的位置（像素）与是不是开在朝屏幕下方那面墙上：开在左右两面墙上的，门脚落在门洞靠下的那头 */
  private doorBase(cfg: WarpConfig, d: Door): { x: number; y: number; low: boolean } {
    const lip = cfg.room.lipU / 2
    const drop = d.in.x !== 0 ? cfg.exit.widthU / 2 : 0
    return { x: (d.x - d.in.x * lip) * UNIT, y: (d.y - d.in.y * lip + drop) * UNIT, low: d.in.y < 0 }
  }

  /**
   * 一扇门和它顶上的安全出口指示牌。出口的牌子亮着：队伍那间屏上倒数秒数，最后三秒闪，开了以后小人跑起来、屏上箭头往门里走；
   * 别的间屏上是两道杠。入口的牌子是熄的，只在有人从这里出来时亮一下，门摔上以后闪几下又熄了。门开着时门里的光洒到门前的地上
   */
  private door(st: WarpState, cfg: WarpConfig, room: WarpRoom, exit: boolean, now: number, t: number): void {
    const d = exit ? room.exit : room.entry
    const look = this.look(st, cfg, room, exit, now)
    const base = this.doorBase(cfg, d)
    const w = cfg.exit.widthU * UNIT
    const h = DOOR_H_U * UNIT * (base.low ? LOW_DOOR : 1)
    const alpha = base.low ? 0.88 : 1
    drawDoor(this.doorFx!, d.style, { x: base.x, y: base.y, w, h, open: look.open, light: look.light, lightK: look.open > 0 ? 1 : 0, alpha }, t)
    // 门里的光洒到门前
    if (look.open > 0) {
      const g = this.glowFx!
      const nx = -d.in.y
      const ny = d.in.x
      const half = w * 0.36
      const far = 2.6 * UNIT * look.open
      const x0 = d.x * UNIT
      const y0 = d.y * UNIT
      g.fillStyle(look.light, 0.28 * look.open)
      fillQuad(g, [{ x: x0 + nx * half, y: y0 + ny * half },
          { x: x0 - nx * half, y: y0 - ny * half },
          { x: x0 - nx * half * 1.8 + d.in.x * far, y: y0 - ny * half * 1.8 + d.in.y * far },
          { x: x0 + nx * half * 1.8 + d.in.x * far, y: y0 + ny * half * 1.8 + d.in.y * far }])
      this.airFx!.fillStyle(look.light, 0.18 * look.open)
      this.airFx!.fillRect(base.x - w * 0.36, base.y - h * 0.86, w * 0.72, h * 0.86)
    }
    // 指示牌
    const sw = SIGN_W_U * UNIT
    const sy = base.y - h - sw * 0.24
    let text = '--'
    let lit = 0.55
    let run = false
    if (exit && room.index === st.teamRoom) {
      const e = st.exits[room.index]!
      if (now < e.opensAt) {
        const left = Math.ceil((e.opensAt - now) / 1000)
        text = String(Math.min(99, left)).padStart(2, '0')
        lit = left <= 3 && Math.floor((e.opensAt - now) / 250) % 2 === 0 ? 0.55 : 1
      } else if (now < e.closesAt) {
        text = ''
        run = true
        lit = 0.8 + 0.2 * Math.sin(t * 12)
      }
    } else if (!exit) {
      const e = st.exits[room.index]!
      const dead = now - (e.arrivedAt + cfg.exit.transitMs + HOLD_MS + SLAM_MS)
      text = ''
      lit = look.open > 0 ? 1 : dead >= 0 && dead < DIE_MS && noise(Math.floor(dead / 60), room.index) > 0.45 ? 0.8 : 0
    }
    drawSign(this.doorFx!, base.x, sy, sw, text, lit, run, t, alpha)
    if (lit > 0) {
      this.airFx!.fillStyle(0x30ff80, 0.07 * lit)
      this.airFx!.fillRect(base.x - sw * 0.62, sy - sw * 0.3, sw * 1.24, sw * 0.6)
    }
  }

  /** 出口开着时：队长脚下一串绿箭头顺着步数场一路指到门槛，一节节往门里闪过去 */
  private route(sim: Sim, st: WarpState, now: number, t: number): void {
    const i = st.teamRoom
    if (!exitOpen(st, i, now)) return
    if (Alive.v[sim.leader] !== 1) return
    const room = st.plan.rooms[i]!
    const g = this.glowFx!
    let x = Transform.x[sim.leader]!
    let y = Transform.y[sim.leader]!
    const step = 0.5 * UNIT
    for (let k = 0; k < 90; k++) {
      if (inBox(room.exit.zone, x / UNIT, y / UNIT)) return
      const dir = flowDir(st.grids[i]!, st.toExit[i]!, x, y)
      if (!dir) return
      x += dir.x * step
      y += dir.y * step
      if (k < 2 || k % 2 === 1) continue
      const al = 0.25 + 0.65 * Math.max(0, Math.cos(k * 0.35 - t * 6)) ** 4
      const w = 0.22 * UNIT
      const back = 0.2 * UNIT
      g.lineStyle(0.08 * UNIT, EXIT_GLOW, al)
      g.lineBetween(x - dir.x * back - dir.y * w, y - dir.y * back + dir.x * w, x, y)
      g.lineBetween(x - dir.x * back + dir.y * w, y - dir.y * back - dir.x * w, x, y)
    }
  }

  /** 门边地上记号笔画的道：队伍每从这扇出口走一次就多画一道，五道一组 */
  private tallies(st: WarpState, cfg: WarpConfig, room: WarpRoom): void {
    const n = Math.min(st.exits[room.index]!.passes, TALLY_ROW * 5 * 4)
    if (n === 0) return
    const d = room.exit
    let px = d.in.y
    let py = -d.in.x
    if ((room.center.x - d.x) * px + (room.center.y - d.y) * py < 0) {
      px = -px
      py = -py
    }
    const ox = d.x + d.in.x * 0.35 + px * (cfg.exit.widthU / 2 + 0.5)
    const oy = d.y + d.in.y * 0.35 + py * (cfg.exit.widthU / 2 + 0.5)
    const at = (a: number, b: number): { x: number; y: number } => ({ x: (ox + px * a + d.in.x * b) * UNIT, y: (oy + py * a + d.in.y * b) * UNIT })
    const g = this.floorFx!
    g.lineStyle(0.07 * UNIT, 0x1a2430, 0.8)
    for (let k = 0; k < n; k++) {
      const group = Math.floor(k / 5)
      const r = k % 5
      const col = group % TALLY_ROW
      const row = Math.floor(group / TALLY_ROW)
      const a0 = col * (4 * TALLY_GAP_U + 0.4)
      const b0 = row * (TALLY_U + 0.22)
      const wob = (noise(room.index * 97 + k, 3) - 0.5) * 0.06
      if (r < 4) {
        const p = at(a0 + r * TALLY_GAP_U + wob, b0)
        const q = at(a0 + r * TALLY_GAP_U - wob, b0 + TALLY_U)
        g.lineBetween(p.x, p.y, q.x, q.y)
      } else {
        const p = at(a0 - 0.06, b0 + TALLY_U * 0.15)
        const q = at(a0 + 3 * TALLY_GAP_U + 0.06, b0 + TALLY_U * 0.85)
        g.lineBetween(p.x, p.y, q.x, q.y)
      }
    }
  }

  /**
   * 监控探头：每间房离正中最远的那个角上架着一只，队伍在这间时一直转着对准队长，脚下框着一个取景框；队伍不在时来回扫。红灯一闪一闪
   */
  private camera(sim: Sim, st: WarpState, room: WarpRoom, t: number): void {
    const s = room.slab
    const c = st.plan.core
    const cx = (Math.abs(s.x0 - c.x) > Math.abs(s.x1 - c.x) ? s.x0 + 0.5 : s.x1 - 0.5) * UNIT
    const cy = (Math.abs(s.y0 - c.y) > Math.abs(s.y1 - c.y) ? s.y0 + 0.5 : s.y1 - 0.5) * UNIT
    const watching = room.index === st.teamRoom && Alive.v[sim.leader] === 1
    const lx = Transform.x[sim.leader]!
    const ly = Transform.y[sim.leader]!
    const home = Math.atan2(room.center.y * UNIT - cy, room.center.x * UNIT - cx)
    const ang = watching ? Math.atan2(ly - cy, lx - cx) : home + 0.55 * Math.sin(t * 0.5 + room.index * 1.7)
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    const lift = 0.7 * UNIT
    // 地上的视野：一道淡淡的扇面
    const reach = watching ? Math.min(Math.hypot(lx - cx, ly - cy), 30 * UNIT) : 7 * UNIT
    const spread = 0.2
    const gl = this.glowFx!
    gl.fillStyle(0x9fe8ff, watching ? 0.045 : 0.03)
    gl.fillTriangle(cx, cy, cx + Math.cos(ang - spread) * reach, cy + Math.sin(ang - spread) * reach, cx + Math.cos(ang + spread) * reach, cy + Math.sin(ang + spread) * reach)
    if (watching) {
      const b = 0.55 * UNIT
      const k = 0.18 * UNIT
      gl.lineStyle(0.04 * UNIT, 0x9fe8ff, 0.4)
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        gl.lineBetween(lx + sx * b, ly + sy * b, lx + sx * (b - k), ly + sy * b)
        gl.lineBetween(lx + sx * b, ly + sy * b, lx + sx * b, ly + sy * (b - k))
      }
    }
    // 支架与机身
    const g = this.doorFx!
    g.lineStyle(0.06 * UNIT, 0x3a4652, 1)
    g.lineBetween(cx, cy, cx, cy - lift)
    const body = (a: number, b: number): { x: number; y: number } => ({ x: cx + ux * a - uy * b, y: cy - lift + uy * a * 0.6 + ux * b })
    g.fillStyle(0xd8e0e6, 1)
    fillQuad(g, [body(-0.1 * UNIT, -0.12 * UNIT), body(0.42 * UNIT, -0.1 * UNIT), body(0.42 * UNIT, 0.1 * UNIT), body(-0.1 * UNIT, 0.12 * UNIT)])
    const lens = body(0.44 * UNIT, 0)
    g.fillStyle(0x10161c, 1)
    g.fillCircle(lens.x, lens.y, 0.08 * UNIT)
    g.fillStyle(0x7fdcff, 0.8)
    g.fillCircle(lens.x - 0.02 * UNIT, lens.y - 0.02 * UNIT, 0.025 * UNIT)
    if (Math.floor(t * 1.2) % 2 === 0) {
      const led = body(0.05 * UNIT, 0)
      this.airFx!.fillStyle(0xff3040, 0.9)
      this.airFx!.fillCircle(led.x, led.y - 0.1 * UNIT, 0.04 * UNIT)
      this.airFx!.fillStyle(0xff3040, 0.2)
      this.airFx!.fillCircle(led.x, led.y - 0.1 * UNIT, 0.12 * UNIT)
    }
  }

  /**
   * 真正的出口：正中虚空里一小块浮着的台子，上面立着一扇普普通通的白门，开着一道缝，门里是日光，牌子一直亮着、箭头一直往门里指；
   * 日光从门缝洒到台上、洒进虚空里，门顶上一道光往上冲。四面都是虚空，哪间都走不到。头目要从门里出来时，门里的光烧成红色、门跟着抖
   */
  private trueExit(sim: Sim, st: WarpState, cfg: WarpConfig, t: number): void {
    let boss = 0
    for (const e of query(sim.world, [Telegraph, Due])) {
      if (!Telegraph.boss[e]) continue
      const span = Math.max(1, Due.at[e]! - Telegraph.bornMs[e]!)
      boss = Math.max(boss, clamp01((sim.elapsedMs - Telegraph.bornMs[e]!) / span))
    }
    const light = boss > 0 ? 0xff5a6a : DAYLIGHT
    const shake = boss > 0 ? Math.sin(t * (30 + 40 * boss)) * 0.04 * UNIT * boss : 0
    const cx = st.plan.core.x * UNIT + shake
    const cy = st.plan.core.y * UNIT
    const r = cfg.core.radiusU * UNIT
    const g = this.doorFx!
    const gl = this.glowFx!
    // 浮着的台子：顶面、朝下的一截侧面、一圈青色的边
    const iw = r * 1.8
    const ih = r * 0.9
    const top = cy - ih * 0.2
    g.fillStyle(0x0c141c, 1)
    g.fillRect(cx - iw / 2, top + ih, iw, 0.3 * UNIT)
    g.fillStyle(0x1c2a36, 1)
    g.fillRect(cx - iw / 2, top, iw, ih)
    g.lineStyle(0.04 * UNIT, 0x40ffff, 0.8)
    g.strokeRect(cx - iw / 2, top, iw, ih)
    // 日光洒到台上、洒进虚空
    const baseY = top + ih * 0.35
    const dw = r * 1.05
    gl.fillStyle(light, 0.22)
    fillQuad(gl, [{ x: cx - dw * 0.25, y: baseY },
        { x: cx + dw * 0.1, y: baseY },
        { x: cx + dw * 0.9, y: baseY + 3.5 * UNIT },
        { x: cx - dw * 0.6, y: baseY + 3.5 * UNIT }])
    const dh = r * 1.9
    drawDoor(g, PLAIN_DOOR, { x: cx, y: baseY, w: dw, h: dh, open: 0.3 + 0.04 * Math.sin(t * 0.7), light, lightK: 1, alpha: 1 }, t)
    const a = this.airFx!
    // 门顶上一道往上冲的光，隔着几间房也望得见
    const rise = 7 * UNIT
    for (let j = 0; j < 12; j++) {
      const s0 = j / 12
      const fade = (1 - s0) ** 1.5
      for (const [k, al] of [
        [0.6, 0.06],
        [0.3, 0.12],
        [0.1, 0.3],
      ] as const) {
        const ww = dw * k * (1 - 0.4 * s0)
        a.fillStyle(light, al * fade)
        a.fillRect(cx - ww, baseY - dh - rise * (s0 + 1 / 12), ww * 2, rise / 12)
      }
    }
    for (const [k, al] of [
      [2.4, 0.05],
      [1.5, 0.08],
      [0.9, 0.14],
    ] as const) {
      a.fillStyle(light, al * (1 + 0.15 * Math.sin(t * 1.3)))
      a.fillCircle(cx - dw * 0.1, baseY - dh * 0.45, r * k * 0.6)
    }
    // 光里飘着的尘
    for (let k = 0; k < 8; k++) {
      const s = (t * 0.08 + noise(k, 5)) % 1
      a.fillStyle(light, 0.5 * Math.sin(s * Math.PI))
      a.fillRect(cx - dw * 0.4 + noise(k, 9) * dw * 1.1 + s * dw * 0.4, baseY + s * 3 * UNIT - 0.6 * UNIT, 0.05 * UNIT, 0.05 * UNIT)
    }
    drawSign(g, cx, baseY - dh - SIGN_W_U * UNIT * 0.24, SIGN_W_U * UNIT * 0.85, '', 1, false, t, 1)
    a.fillStyle(0x30ff80, 0.1)
    a.fillRect(cx - SIGN_W_U * UNIT * 0.55, baseY - dh - SIGN_W_U * UNIT * 0.5, SIGN_W_U * UNIT * 1.1, SIGN_W_U * UNIT * 0.52)
  }

  /** 立柱：墩子上立着一根半透明的光柱，一圈圈光往上走 */
  private pillars(st: WarpState, cfg: WarpConfig, t: number): void {
    const g = this.airFx!
    const h = cfg.pillars.heightM * LIFT_PER_M
    for (const room of st.plan.rooms) {
      if (room.pillars.length === 0) continue
      const color = SIGNS[room.sign]!.color
      room.pillars.forEach((b, k) => {
        const x0 = b.x0 * UNIT + 0.12 * UNIT
        const w = (b.x1 - b.x0) * UNIT - 0.24 * UNIT
        const base = b.y1 * UNIT - 0.25 * UNIT
        g.fillStyle(color, 0.1)
        g.fillRect(x0, base - h, w, h)
        g.fillStyle(lift(color, 0.5), 0.16)
        g.fillRect(x0 + w * 0.35, base - h, w * 0.3, h)
        for (let j = 0; j < 3; j++) {
          const s = (t * 0.45 + j / 3 + k * 0.17) % 1
          g.fillStyle(lift(color, 0.6), 0.45 * Math.sin(Math.PI * s))
          g.fillRect(x0, base - h * s - 0.03 * UNIT, w, 0.06 * UNIT)
        }
        g.fillStyle(0xffffff, 0.3)
        g.fillRect(x0, base - h - 0.04 * UNIT, w, 0.08 * UNIT)
      })
    }
  }

  /**
   * 出怪板上凝成形的敌人：预兆打下去的那一刻起，四面八方的红色光块往落点收拢、越聚越密，脚下的出怪板跟着亮起来；
   * 到点就是一只敌人
   */
  private forming(sim: Sim, st: WarpState, cfg: WarpConfig, now: number): void {
    const g = this.airFx!
    const f = this.glowFx!
    for (const e of query(sim.world, [Telegraph, Due, Transform])) {
      const born = Telegraph.bornMs[e]!
      const span = Math.max(1, Due.at[e]! - born)
      const k = clamp01((now - born) / span)
      const x = Transform.x[e]!
      const y = Transform.y[e]!
      const boss = Telegraph.boss[e] === 1
      for (const room of st.plan.rooms) {
        for (const p of room.plates) {
          if (Math.hypot(x / UNIT - p.x, y / UNIT - p.y) > cfg.emitters.markU + 0.8) continue
          f.fillStyle(FOE_GLOW, 0.2 + 0.5 * k)
          f.fillRect(p.box.x0 * UNIT, p.box.y0 * UNIT, (p.box.x1 - p.box.x0) * UNIT, (p.box.y1 - p.box.y0) * UNIT)
        }
      }
      const n = boss ? 26 : 12
      const spread = (boss ? 2.4 : 1.1) * UNIT
      for (let j = 0; j < n; j++) {
        const h1 = noise(e * 31 + j, Math.floor(born))
        const h2 = noise(j * 17 + 5, e + Math.floor(born))
        const ang = h1 * Math.PI * 2
        const lag = h2 * 0.35
        const s = clamp01((k - lag) / (1 - lag))
        if (s <= 0) continue
        const r = spread * (1 - ease(s)) + 0.1 * UNIT
        const lifted = (1 - s) * 0.9 * UNIT
        const size = (0.12 + 0.08 * h2) * UNIT * (boss ? 1.5 : 1)
        g.fillStyle(j % 3 === 0 ? 0xffffff : FOE_GLOW, 0.35 + 0.55 * s)
        g.fillRect(x + Math.cos(ang) * r - size / 2, y + Math.sin(ang) * r * 0.7 - lifted - size / 2, size, size)
      }
      f.lineStyle(0.05 * UNIT, FOE_GLOW, 0.6 * k)
      f.strokeRect(x - spread * 0.4 * (1 - k) - 0.3 * UNIT, y - spread * 0.4 * (1 - k) - 0.3 * UNIT, (spread * 0.8 * (1 - k)) + 0.6 * UNIT, (spread * 0.8 * (1 - k)) + 0.6 * UNIT)
    }
  }

  /**
   * 一个被送过虚空的身体：出发时散成一格格光块往上飘开，沿着桥飞过去，在对面的落点聚拢；队伍是信号蓝，敌人是信号红，夹着几块白
   */
  private voxels(h: Hop, cfg: WarpConfig, now: number): void {
    const ms = cfg.exit.transitMs
    const d = now - h.at
    if (d < 0 || d > ms + GATHER_MS) return
    const g = this.airFx!
    const color = h.foe ? FOE_GLOW : TEAM_GLOW
    const n = VOXELS + Math.round((h.r / UNIT) * VOXELS_PER_U)
    const seed = Math.floor(h.at) ^ Math.floor(h.fx * 7) ^ Math.floor(h.ty * 3)
    const dx = h.tx - h.fx
    const dy = h.ty - h.fy
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    for (let k = 0; k < n; k++) {
      const a = noise(seed + k * 13, 7)
      const b = noise(seed + k * 29, 11)
      const c = noise(seed + k * 43, 19)
      const ang = a * Math.PI * 2
      const off = h.r * (0.4 + 0.8 * b)
      const lag = c * 0.25
      const size = (0.14 + 0.14 * b) * UNIT
      let x: number
      let y: number
      let al: number
      if (d < SCATTER_MS * (1 - lag)) {
        // 散开：从身体上剥下来往上飘
        const s = ease(d / SCATTER_MS)
        x = h.fx + Math.cos(ang) * off * s
        y = h.fy + Math.sin(ang) * off * s * 0.6 - (0.3 + 0.6 * c) * UNIT * s - 0.4 * UNIT
        al = 0.9
      } else if (d < ms) {
        // 沿桥飞过去：前后拉开，左右微微摆
        const s = clamp01((d - SCATTER_MS * (1 - lag)) / (ms - SCATTER_MS * (1 - lag)))
        const e = ease(clamp01(s * (1 + lag) - lag * 0.5))
        const wob = Math.sin(e * Math.PI) * (b - 0.5) * 0.8 * UNIT
        x = h.fx + dx * e + Math.cos(ang) * off * (1 - e) + nx * wob
        y = h.fy + dy * e + Math.sin(ang) * off * 0.6 * (1 - e) + ny * wob - 0.4 * UNIT * (1 - e) - Math.sin(e * Math.PI) * 0.8 * UNIT
        al = 0.95
      } else {
        // 聚拢：落点四周的光块收进身体里
        const s = clamp01((d - ms) / GATHER_MS)
        const r = off * 0.9 * (1 - ease(s))
        x = h.tx + Math.cos(ang + 1.3) * r
        y = h.ty + Math.sin(ang + 1.3) * r * 0.6 - 0.4 * UNIT * (1 - s)
        al = 1 - s
      }
      g.fillStyle(k % 4 === 0 ? 0xffffff : color, al)
      g.fillRect(x - size / 2, y - size / 2, size, size)
    }
  }

  /** 子弹打在力场上：那里泛起一圈六角形的涟漪 */
  private ripples(st: WarpState, now: number): void {
    const g = this.glowFx!
    for (const r of st.impacts) {
      const d = now - r.at
      if (d < 0 || d > RIPPLE_MS) continue
      const k = d / RIPPLE_MS
      const rad = RIPPLE_U * UNIT * (0.3 + 0.7 * ease(k))
      g.lineStyle(0.05 * UNIT, 0x9fe8ff, 0.8 * (1 - k))
      g.beginPath()
      for (let j = 0; j <= 6; j++) {
        const a = (j / 6) * Math.PI * 2 + Math.PI / 6
        const px = r.x + Math.cos(a) * rad
        const py = r.y + Math.sin(a) * rad
        if (j === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
    }
  }

  /** 开着的出口给身边的身体打一层绿；正中那扇真正的出口四周的身体迎着它那一面泛着日光 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    if (!st) return
    const px = x / UNIT
    const py = y / UNIT
    const i = st.teamRoom
    if (exitOpen(st, i, this.lastMs)) {
      const m = zoneMid(st.plan.rooms[i]!.exit)
      const d = Math.hypot(px - m.x, py - m.y)
      if (d < EXIT_LIGHT_U) {
        const l = d || 1
        out.fx = (m.x - px) / l
        out.fy = (m.y - py) / l
        out.color = EXIT_GLOW
        out.fill = EXIT_FILL * (1 - d / EXIT_LIGHT_U)
        return
      }
    }
    const d = Math.hypot(px - st.plan.core.x, py - st.plan.core.y)
    if (d >= CORE_LIGHT_U) return
    out.fx = (st.plan.core.x - px) / d
    out.fy = (st.plan.core.y - py) / d
    out.color = CORE_GLOW
    out.fill = 0.35 * (1 - d / CORE_LIGHT_U)
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.tiles = undefined
    this.floorFx = undefined
    this.glowFx = undefined
    this.doorFx = undefined
    this.airFx = undefined
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY, TINT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
