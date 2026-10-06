import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, Due, ENEMY_SET, Telegraph, Transform } from '../../ecs/components'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { FEEDER_U, nextRoom } from './layout'
import { WarpPainter } from './painter'
import { CORE_GLOW, CUE_OFF, CUE_ON, FOE_GLOW, lift, PELLET, rgb, SIGNS, TEAM_GLOW, VOID_DEEP } from './palette'
import { encodeTiles, TILES_FRAG, VOID_FRAG } from './shader'
import { FACE_U, textureSize } from './ground'
import { warpPlanFor } from './world'
import type { Hop, WarpState } from './world'
import type { Tube, WarpPlan, WarpRoom } from './layout'
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
/** 管子：多粗（格） */
const TUBE_U = 0.62
/** 身体被吸进出口、从进口里吐出来各占滑行的几成 */
const SUCK = 0.22
const SPIT = 0.15
/** 出口抽吸、进口吐出时亮的那一下多久，毫秒 */
const BURST_MS = 520
/** 饲料从给料塔顺着喂料管滚到投料碗要多久，毫秒；一次画几粒 */
const FEED_MS = 900
const PELLETS = 7
/** 饲料在喂料管里滚的那几成时间，余下的从上面落进碗里 */
const DROP = 0.55
/** 投喂以后碗边亮多久，毫秒；新划的那一笔标签上亮多久 */
const FED_MS = 1400
const INK_MS = 2400
/** 玻璃受击的那一下多久、多大（格） */
const RIPPLE_MS = 420
const RIPPLE_U = 0.7
/** 扫描线隔多久扫过队伍所在那只缸一次、扫一遍多久，毫秒 */
const SCAN_EVERY_MS = 7000
const SCAN_MS = 1600
/** 标签：一组正字多宽、离缸角多远、多高，格；最多画几组 */
const TALLY_U = 0.62
const LABEL_INSET_U = 1.2
const LABEL_H_U = 0.62
const TALLY_GROUPS = 10
/** 管口给身边的身体打的补光：多远（格）以内，最浓多少 */
const PAD_LIGHT_U = 2.6
const PAD_FILL = 0.45
/** 给料塔照亮四周的身体：多远（格）以内 */
const CORE_LIGHT_U = 6

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (t: number): number => t * t * (3 - 2 * t)

/** 整数打散成 [0, 1)：光块的位置、闪烁这些画面上的随机 */
function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
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

/** 第 i 只缸的待机律动里，(x, y)（格）这块瓷砖排在哪：脉冲按离中心多远，光波按从进口往出口走到哪 */
function phaseOf(room: WarpRoom, pattern: number, x: number, y: number): number {
  if (pattern === 0) return clamp01(Math.hypot(x - room.center.x, y - room.center.y) / 13)
  if (pattern === 1) {
    const dx = room.exit.x - room.entry.x
    const dy = room.exit.y - room.entry.y
    const len = Math.hypot(dx, dy)
    return clamp01(((x - room.entry.x) * dx + (y - room.entry.y) * dy) / (len * len))
  }
  return noise(Math.floor(x * 7), Math.floor(y * 13))
}

/**
 * 掩码与着色图：R 是这块瓷砖的律动（加一再乘 50，0 是不会亮的地方），G 是缸（乘 64），B 是它在律动里的相位；着色图是那只缸的灯色
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
  charge: [number, number, number, number]
  chargeRoom: number
}

/** 投料碗的圆心，格 */
function bowlOf(room: WarpRoom): Point {
  return { x: room.entry.x - room.entryDir.x * FEEDER_U, y: room.entry.y - room.entryDir.y * FEEDER_U }
}

/** 一根管子在方框里画几份：本身一份，接到方框外的再往回挪一整圈画一份，方框边上接得上 */
function copies(t: Tube): readonly Point[] {
  return t.shift.x === 0 && t.shift.y === 0 ? [{ x: 0, y: 0 }] : [{ x: 0, y: 0 }, { x: -t.shift.x, y: -t.shift.y }]
}

/**
 * 跃迁·标本：实验台的台面是底下的着色器，印着刻度网格、流着数据光流；镜头跟着队长走，整张台在画面上往四周平铺，望出去是一排排一模一样的缸。
 * 四只缸的缸底、玻璃缸壁与缸的影子是开局在后台线程画好的贴图；感应地板按谁踩过亮起信号蓝或信号红、慢慢暗下去，闲着时按各只的律动透出灯色。
 * 管子、管口、喂料管、缸上的标签、给料塔、出怪板上凝成形的敌人、顺着管子滑过去的身体都每帧现画
 */
export class WarpView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: WarpPlan
  private cfg?: WarpConfig
  private painter?: WarpPainter
  private state?: WarpState
  private tiles?: DataTex
  private floorFx?: Phaser.GameObjects.Graphics
  private tubeFx?: Phaser.GameObjects.Graphics
  private glowFx?: Phaser.GameObjects.Graphics
  private airFx?: Phaser.GameObjects.Graphics
  private readonly u: Uniforms = { time: 0, px: 0.05, charge: [0, 0, 0, 0], chargeRoom: -1 }
  private jumpsSeen = 0
  private shuttleSeen: number[] = []
  private charging = false
  private now = 0

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

  /** 镜头跟着队长走，实验台在画面上往四周平铺：往哪边看都是缸，管子接出方框就接进平铺出去的那一份 */
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
    this.tubeFx = scene.add.graphics().setDepth(-0.7)
    this.airFx = scene.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.floorFx, this.glowFx, this.tubeFx, this.airFx)
    const st = sim.worldState.warp
    this.jumpsSeen = st?.jumps ?? 0
    this.shuttleSeen = st ? st.pads.map((p) => p.shuttledAt) : []
    v.lens.screen.vignette(0.9, 0.12, 0x020a0e)
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
              set('uCharge', u.charge)
              set('uChargeRoom', u.chargeRoom)
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
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.glowFx || !this.tubeFx || !this.airFx) return
    this.state = st
    const now = sim.elapsedMs
    this.now = now
    const t = sim.fxMs / 1000
    this.u.time = t
    this.u.px = 1 / (v.lens.screen.zoom() * UNIT)
    const tl = st.tiles
    encodeTiles(this.tiles.img.data, tl.team, tl.foe, tl.teamFrom, tl.foeFrom, now, cfg.tiles.teamFadeMs, cfg.tiles.foeFadeMs, FLASH_MS)
    push(this.tiles)
    this.floorFx.clear()
    this.glowFx.clear()
    this.tubeFx.clear()
    this.airFx.clear()
    this.chargeRing(st, cfg)
    this.sounds(v, st, cfg)
    this.scan(st, now)
    this.core(sim, st, t)
    st.plan.rooms.forEach((room) => {
      this.label(st, room, now)
      this.feeder(st, room, now)
      this.ornaments(room, t)
    })
    st.plan.tubes.forEach((tube, i) => this.tube(st, cfg, tube, i, now, t))
    st.plan.rooms.forEach((room) => this.mouths(sim, st, cfg, room, now, t))
    this.forming(sim, st, cfg, now)
    for (const h of st.hops) this.capsule(st, h, cfg, now)
    this.ripples(st, now)
  }

  /** 着色器里那圈扩满整只缸的充能光：半径随充能从出口扩到缸里最远的角 */
  private chargeRing(st: WarpState, cfg: WarpConfig): void {
    const i = st.teamRoom
    const p = st.pads[i]
    const room = st.plan.rooms[i]!
    const k = p ? p.charge / cfg.pad.chargeMs : 0
    if (k <= 0) {
      this.u.charge = [0, 0, 0, 0]
      this.u.chargeRoom = -1
      return
    }
    const f = room.floor
    const reach = Math.max(...[f.x0, f.x1].flatMap((x) => [f.y0, f.y1].map((y) => Math.hypot(x - room.exit.x, y - room.exit.y))))
    const r = cfg.pad.radiusU + (reach + 1 - cfg.pad.radiusU) * ease(k)
    this.u.charge = [room.exit.x, room.exit.y, r, 0.4 + 0.6 * k]
    this.u.chargeRoom = i
  }

  /** 开始充能、整队出发、送来一批敌人：在镜头里才响 */
  private sounds(v: ViewCtx, st: WarpState, cfg: WarpConfig): void {
    const p = st.pads[st.teamRoom]
    const charging = !!p && p.charge > 0 && p.charge < cfg.pad.chargeMs
    if (charging && !this.charging && p.charge < 200) playSfx('charge')
    this.charging = charging
    if (st.jumps !== this.jumpsSeen) {
      this.jumpsSeen = st.jumps
      playSfx('jump')
    }
    st.pads.forEach((pad, i) => {
      if (pad.shuttledAt === this.shuttleSeen[i]) return
      this.shuttleSeen[i] = pad.shuttledAt
      const to = nextRoom(st.plan, i)
      if (pad.shuttled > 0 && v.lens.screen.sees(to.entry.x * UNIT, to.entry.y * UNIT, 2 * UNIT)) playSfx('warp')
    })
  }

  /** 感应地板隔一阵从一头扫到另一头：一道细光扫过队伍所在那只缸，缸底在量你 */
  private scan(st: WarpState, now: number): void {
    const d = now % SCAN_EVERY_MS
    if (d > SCAN_MS) return
    const f = st.plan.rooms[st.teamRoom]!.floor
    const k = ease(d / SCAN_MS)
    const y = (f.y0 + (f.y1 - f.y0) * k) * UNIT
    const al = Math.sin(Math.PI * (d / SCAN_MS))
    const g = this.glowFx!
    for (const [w, a] of [
      [0.5, 0.06],
      [0.18, 0.18],
      [0.05, 0.6],
    ] as const) {
      g.fillStyle(CORE_GLOW, a * al)
      g.fillRect(f.x0 * UNIT, y - w * UNIT * 0.5, (f.x1 - f.x0) * UNIT, w * UNIT)
    }
  }

  /**
   * 缸上的标签：贴在玻璃正面的一条白胶带，左边一道这只缸的灯色，上面按队伍住进来过几回划正字。
   * 新划的那一笔先是红的、慢慢干成黑的
   */
  private label(st: WarpState, room: WarpRoom, now: number): void {
    const g = this.floorFx!
    const n = st.visits[room.index]!
    const groups = Math.max(1, Math.min(TALLY_GROUPS, Math.ceil(n / 5)))
    const x0 = (room.slab.x0 + LABEL_INSET_U) * UNIT
    const y0 = (room.slab.y1 + (FACE_U - LABEL_H_U) / 2) * UNIT
    const w = (0.34 + groups * TALLY_U) * UNIT
    const h = LABEL_H_U * UNIT
    g.fillStyle(0x000000, 0.25)
    g.fillRect(x0 + 0.05 * UNIT, y0 + 0.06 * UNIT, w, h)
    g.fillStyle(0xf2eee0, 0.95)
    g.fillRect(x0, y0, w, h)
    g.fillStyle(SIGNS[room.sign]!.color, 0.9)
    g.fillRect(x0, y0, 0.14 * UNIT, h)
    let last = -Infinity
    for (const f of st.feeds) if (f.room === room.index) last = f.at
    const fresh = clamp01(1 - (now - last) / INK_MS)
    const shown = Math.min(n, TALLY_GROUPS * 5)
    for (let k = 0; k < shown; k++) {
      const gx = x0 + (0.26 + Math.floor(k / 5) * TALLY_U) * UNIT
      const m = k % 5
      const newest = k === n - 1 && fresh > 0
      g.lineStyle(0.05 * UNIT, newest ? lerpColor(0x1c2a36, 0xd02838, fresh) : 0x1c2a36, 0.92)
      const wob = (noise(room.index * 97 + k, 3) - 0.5) * 0.04 * UNIT
      if (m < 4) g.lineBetween(gx + m * 0.11 * UNIT + wob, y0 + 0.12 * UNIT, gx + m * 0.11 * UNIT - wob, y0 + h - 0.12 * UNIT)
      else g.lineBetween(gx - 0.05 * UNIT, y0 + h - 0.16 * UNIT, gx + 0.43 * UNIT, y0 + 0.16 * UNIT)
    }
  }

  /**
   * 投喂：给料塔顺着一根喂料管连到每只缸靠里的那个角。队伍滑过管子时，一串饲料顺着喂料管滚到缸角，再从上面落进投料碗，
   * 落进碗里就是那把金币；碗边亮一圈，绕完一圈的那一次整只缸亮一层金光
   */
  private feeder(st: WarpState, room: WarpRoom, now: number): void {
    const f = this.floorFx!
    const g = this.glowFx!
    const air = this.airFx!
    const bowl = bowlOf(room)
    const core = st.plan.core
    const hub = { x: core.x * UNIT, y: core.y * UNIT }
    const corner = { x: (room.center.x < core.x ? room.slab.x1 : room.slab.x0) * UNIT, y: (room.center.y < core.y ? room.slab.y1 : room.slab.y0) * UNIT }
    f.lineStyle(0.16 * UNIT, 0x2a3c46, 0.9)
    f.lineBetween(hub.x, hub.y, corner.x, corner.y)
    g.lineStyle(0.05 * UNIT, CORE_GLOW, 0.22)
    g.lineBetween(hub.x, hub.y, corner.x, corner.y)
    for (const due of st.due) {
      if (due.room !== room.index) continue
      const k = 1 - (due.at - now) / FEED_MS
      for (let j = 0; j < PELLETS; j++) {
        const s = clamp01(k - j * 0.05)
        if (s <= 0) continue
        const r = (due.lap ? 0.13 : 0.09) * UNIT
        if (s < DROP) {
          const e = ease(s / DROP)
          g.fillStyle(PELLET, 0.9)
          g.fillCircle(hub.x + (corner.x - hub.x) * e, hub.y + (corner.y - hub.y) * e, r)
          continue
        }
        const e = (s - DROP) / (1 - DROP)
        const jx = (noise(j, 5) - 0.5) * 0.5 * UNIT
        air.fillStyle(PELLET, 0.95)
        air.fillCircle(bowl.x * UNIT + jx * (1 - e), bowl.y * UNIT - (1 - e * e) * 3 * UNIT, r * (1.6 - 0.6 * e))
      }
    }
    for (const fed of st.feeds) {
      if (fed.room !== room.index) continue
      const d = now - fed.at
      if (d < 0 || d > FED_MS) continue
      const k = d / FED_MS
      g.lineStyle(0.08 * UNIT, PELLET, 0.9 * (1 - k))
      g.strokeCircle(bowl.x * UNIT, bowl.y * UNIT, (0.6 + 1.2 * ease(k)) * UNIT)
      if (!fed.lap) continue
      const fl = room.floor
      g.fillStyle(PELLET, 0.16 * (1 - k))
      g.fillRect(fl.x0 * UNIT, fl.y0 * UNIT, (fl.x1 - fl.x0) * UNIT, (fl.y1 - fl.y0) * UNIT)
      g.lineStyle(0.1 * UNIT, PELLET, 0.8 * (1 - k))
      g.strokeCircle(bowl.x * UNIT, bowl.y * UNIT, (1 + 9 * ease(k)) * UNIT)
    }
  }

  /** 摆件上会动的：小火山冒着一串气泡 */
  private ornaments(room: WarpRoom, t: number): void {
    const g = this.airFx!
    for (const o of room.ornaments) {
      if (o.kind !== 'volcano') continue
      for (let j = 0; j < 6; j++) {
        const s = (t * 0.55 + j / 6 + noise(j, Math.floor(o.x * 10))) % 1
        const wob = Math.sin(t * 3 + j * 2) * 0.12 * UNIT
        const x = o.x * UNIT + wob
        const y = o.y * UNIT - s * 2.6 * UNIT
        g.lineStyle(0.035 * UNIT, 0xd8ffff, 0.7 * (1 - s))
        g.strokeCircle(x, y, (0.07 + 0.1 * s) * UNIT)
      }
    }
  }

  /**
   * 一根管子：透明的玻璃管从出口穿出缸壁、跨过实验台、穿进下一只缸接到进口，两头一道钢箍；管里一串人字纹往前流，颜色是下一只缸的灯色。
   * 队长充能时越流越快、越来越亮；整队、一批敌人滑过去的那一阵整根管子亮起来，队伍是信号蓝、敌人是信号红
   */
  private tube(st: WarpState, cfg: WarpConfig, tube: Tube, i: number, now: number, t: number): void {
    const room = st.plan.rooms[i]!
    const to = nextRoom(st.plan, i)
    const color = SIGNS[to.sign]!.color
    const R = cfg.pad.radiusU
    const ux = room.exitDir.x
    const uy = room.exitDir.y
    const nx = -uy
    const ny = ux
    const pad = st.pads[i]!
    const charge = pad.charge / cfg.pad.chargeMs
    const live = cfg.pad.transitMs + 250
    const sinceJump = now - pad.jumpedAt
    const sinceShuttle = now - pad.shuttledAt
    const teamHot = sinceJump >= 0 && sinceJump < live ? 1 - sinceJump / live : 0
    const foeHot = pad.shuttled > 0 && sinceShuttle >= 0 && sinceShuttle < live ? 1 - sinceShuttle / live : 0
    const tf = this.tubeFx!
    const g = this.glowFx!
    const w = TUBE_U * UNIT
    for (const o of copies(tube)) {
      const a = { x: (tube.from.x + ux * R * 0.7 + o.x) * UNIT, y: (tube.from.y + uy * R * 0.7 + o.y) * UNIT }
      const b = { x: (tube.ahead.x - ux * R * 0.7 + o.x) * UNIT, y: (tube.ahead.y - uy * R * 0.7 + o.y) * UNIT }
      const span = Math.hypot(b.x - a.x, b.y - a.y)
      tf.lineStyle(w * 1.1, 0x000000, 0.28)
      tf.lineBetween(a.x + 0.18 * UNIT, a.y + 0.28 * UNIT, b.x + 0.18 * UNIT, b.y + 0.28 * UNIT)
      tf.lineStyle(w, 0x8fe8f4, 0.16)
      tf.lineBetween(a.x, a.y, b.x, b.y)
      for (const side of [-1, 1]) {
        tf.lineStyle(0.05 * UNIT, 0xd8ffff, 0.75)
        tf.lineBetween(a.x + nx * side * w * 0.45, a.y + ny * side * w * 0.45, b.x + nx * side * w * 0.45, b.y + ny * side * w * 0.45)
      }
      const hl = (nx * -0.6 + ny * -0.8 > 0 ? 1 : -1) * w * 0.22
      tf.lineStyle(0.07 * UNIT, 0xffffff, 0.35)
      tf.lineBetween(a.x + nx * hl, a.y + ny * hl, b.x + nx * hl, b.y + ny * hl)
      for (const c of [a, b]) {
        tf.lineStyle(0.16 * UNIT, 0x6f8a99, 1)
        tf.lineBetween(c.x - nx * w * 0.62, c.y - ny * w * 0.62, c.x + nx * w * 0.62, c.y + ny * w * 0.62)
      }
      const step = 0.8 * UNIT
      const speed = (0.6 + 3.5 * charge) * UNIT
      for (let s = ((t * speed) % step) - step; s < span; s += step) {
        if (s < 0) continue
        const fade = Math.sin((Math.PI * s) / span)
        const c = { x: a.x + ux * s, y: a.y + uy * s }
        const cw = w * 0.3
        const back = w * 0.26
        g.lineStyle(0.07 * UNIT, color, (0.35 + 0.6 * charge) * fade)
        g.lineBetween(c.x - ux * back + nx * cw, c.y - uy * back + ny * cw, c.x, c.y)
        g.lineBetween(c.x - ux * back - nx * cw, c.y - uy * back - ny * cw, c.x, c.y)
      }
      for (const [hot, glow] of [
        [teamHot, TEAM_GLOW],
        [foeHot, FOE_GLOW],
      ] as const) {
        if (hot <= 0) continue
        for (const [k, al] of [
          [1, 0.18],
          [0.55, 0.4],
          [0.2, 0.9],
        ] as const) {
          g.lineStyle(w * k, glow, al * hot)
          g.lineBetween(a.x, a.y, b.x, b.y)
        }
      }
    }
  }

  /**
   * 两个管口。出口：缸壁上一盏提示灯，能走时亮绿、管口一圈绿光往里收，像在招手；刚滑进来、还关着时灯是灰的，一段弧随冷却走满；
   * 队长站上来充能，管口一层层亮成信号蓝，整队头上一道光柱；抽敌人之前管口亮起一圈圈往里收的红；出发时亮一下。
   * 进口：身体从管子里吐出来时亮一下
   */
  private mouths(sim: Sim, st: WarpState, cfg: WarpConfig, room: WarpRoom, now: number, t: number): void {
    const p = st.pads[room.index]!
    const R = cfg.pad.radiusU * UNIT
    const x = room.exit.x * UNIT
    const y = room.exit.y * UNIT
    const f = this.floorFx!
    const g = this.glowFx!
    const air = this.airFx!
    const cooling = now < p.coolUntil
    const charge = p.charge / cfg.pad.chargeMs
    const lamp = { x: (room.exit.x + room.exitDir.x * (cfg.pad.insetU + cfg.room.lipU * 0.5)) * UNIT, y: (room.exit.y + room.exitDir.y * (cfg.pad.insetU + cfg.room.lipU * 0.5)) * UNIT }
    const cue = cooling ? CUE_OFF : CUE_ON
    f.fillStyle(0x1a242c, 1)
    f.fillCircle(lamp.x, lamp.y, 0.3 * UNIT)
    g.fillStyle(cue, cooling ? 0.5 : 0.75 + 0.25 * Math.sin(t * 5))
    g.fillCircle(lamp.x, lamp.y, 0.2 * UNIT)
    if (!cooling) {
      g.fillStyle(cue, 0.12 + 0.08 * Math.sin(t * 5))
      g.fillCircle(lamp.x, lamp.y, 0.7 * UNIT)
    }
    g.lineStyle(0.07 * UNIT, cue, cooling ? 0.4 : 0.75 + 0.2 * Math.sin(t * 3))
    g.strokeCircle(x, y, R * 0.92)
    if (cooling) {
      const k = clamp01(1 - (p.coolUntil - now) / cfg.pad.cooldownMs)
      const a0 = -Math.PI / 2
      g.lineStyle(0.1 * UNIT, CUE_ON, 0.8)
      g.beginPath()
      g.arc(x, y, R * 0.92, a0, a0 + k * Math.PI * 2, false)
      g.strokePath()
    } else {
      for (let k = 0; k < 2; k++) {
        const s = 1 - ((t * (0.7 + 2.5 * charge) + k / 2) % 1)
        g.lineStyle(0.06 * UNIT, CUE_ON, 0.55 * (1 - s * 0.6))
        g.strokeCircle(x, y, R * (0.2 + 0.7 * s))
      }
    }
    if (charge > 0) {
      g.fillStyle(TEAM_GLOW, 0.18 + 0.4 * charge)
      g.fillCircle(x, y, R * 0.86)
      for (let k = 0; k < 3; k++) {
        const s = 1 - ((t * (1 + 3 * charge) + k / 3) % 1)
        g.lineStyle(0.07 * UNIT, lift(TEAM_GLOW, 0.4), 0.8 * charge * (1 - s * 0.5))
        g.strokeCircle(x, y, R * (0.15 + 0.75 * s))
      }
      // 队伍里每个人头上一道光柱：整队都被锁上了
      for (const m of sim.characters) {
        if (!Alive.v[m]) continue
        const mx = Transform.x[m]!
        const my = Transform.y[m]!
        const h = (0.6 + 1.6 * charge) * UNIT
        air.fillStyle(TEAM_GLOW, 0.1 + 0.25 * charge)
        air.fillRect(mx - 0.12 * UNIT, my - h, 0.24 * UNIT, h)
        air.fillStyle(0xffffff, 0.25 * charge)
        air.fillRect(mx - 0.035 * UNIT, my - h, 0.07 * UNIT, h)
      }
    }
    const warn = p.shuttleAt - now
    if (warn > 0 && warn < cfg.pad.warnMs) {
      const k = 1 - warn / cfg.pad.warnMs
      const al = this.crowd(sim, cfg, room) ? 0.7 : 0.18
      for (let j = 0; j < 2; j++) {
        const s = 1 - ((k * 2 + j / 2) % 1)
        g.lineStyle(0.06 * UNIT, FOE_GLOW, al * k)
        g.strokeCircle(x, y, R * (0.2 + 0.7 * s))
      }
    }
    const flash = (at: number, c: number, strength: number, px: number, py: number): void => {
      const d = now - at
      if (d < 0 || d > BURST_MS || strength <= 0) return
      const k = d / BURST_MS
      g.fillStyle(c, 0.5 * (1 - k) * strength)
      g.fillCircle(px, py, R * (0.7 + 0.5 * k))
      g.lineStyle(0.08 * UNIT, lift(c, 0.5), (1 - k) * strength)
      g.strokeCircle(px, py, R * (0.9 + 1.4 * k))
    }
    flash(p.jumpedAt, TEAM_GLOW, 1, x, y)
    flash(p.shuttledAt, FOE_GLOW, p.shuttled > 0 ? 1 : 0.25, x, y)
    const to = nextRoom(st.plan, room.index)
    flash(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, to.entry.x * UNIT, to.entry.y * UNIT)
    flash(p.shuttledAt + cfg.pad.transitMs, FOE_GLOW, p.shuttled > 0 ? 1 : 0, to.entry.x * UNIT, to.entry.y * UNIT)
  }

  /** 此刻有没有敌人站在这只缸的出口上 */
  private crowd(sim: Sim, cfg: WarpConfig, room: WarpRoom): boolean {
    const r = cfg.pad.radiusU * UNIT
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] && Math.hypot(Transform.x[e]! - room.exit.x * UNIT, Transform.y[e]! - room.exit.y * UNIT) <= r) return true
    return false
  }

  /**
   * 给料塔：四只缸当中一座圆的钢塔，顶上一圈转着的灯，四根喂料管从这里接出去；
   * 头目要从塔里投出来时，灯先烧成红白色
   */
  private core(sim: Sim, st: WarpState, t: number): void {
    const f = this.floorFx!
    const g = this.glowFx!
    const cx = st.plan.core.x * UNIT
    const cy = st.plan.core.y * UNIT
    let boss = 0
    for (const e of query(sim.world, [Telegraph, Due])) {
      if (!Telegraph.boss[e]) continue
      const span = Math.max(1, Due.at[e]! - Telegraph.bornMs[e]!)
      boss = Math.max(boss, clamp01((sim.elapsedMs - Telegraph.bornMs[e]!) / span))
    }
    const hot = boss > 0 ? 0.5 + 0.5 * Math.sin(t * (8 + 20 * boss)) : 0
    const tint = boss > 0 ? 0xff7a8a : CORE_GLOW
    const r = (this.cfg?.core.radiusU ?? 1.5) * UNIT
    f.fillStyle(0x000000, 0.3)
    f.fillCircle(cx + 0.25 * UNIT, cy + 0.35 * UNIT, r * 1.05)
    f.fillStyle(0x4c6472, 1)
    f.fillCircle(cx, cy, r)
    f.fillStyle(0x2a3a44, 1)
    f.fillCircle(cx, cy, r * 0.72)
    f.fillStyle(0x8fb0c0, 1)
    f.fillCircle(cx - r * 0.25, cy - r * 0.3, r * 0.12)
    for (const [k, al] of [
      [1.6, 0.06],
      [1.1, 0.12],
      [0.5, 0.5],
    ] as const) {
      g.fillStyle(k < 0.6 ? 0xffffff : tint, al * (1 + 0.8 * hot))
      g.fillCircle(cx, cy, r * k)
    }
    const a0 = t * 0.9
    g.lineStyle(0.07 * UNIT, tint, 0.8 * (1 + hot))
    for (let s = 0; s < 4; s++) {
      g.beginPath()
      g.arc(cx, cy, r * 0.86, a0 + (s * Math.PI) / 2, a0 + (s * Math.PI) / 2 + 0.9, false)
      g.strokePath()
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
   * 一个顺着管子滑过去的身体：先缩成一团被吸进出口，一团光顺着管子滑过去，在进口吐出来、落到它的位置；
   * 队伍是信号蓝，敌人是信号红。管子接出方框时，往回挪一整圈再画一份，方框边上接得上
   */
  private capsule(st: WarpState, h: Hop, cfg: WarpConfig, now: number): void {
    const ms = cfg.pad.transitMs
    const d = now - h.at
    if (d < 0 || d > ms + BURST_MS) return
    const g = this.airFx!
    const tube = st.plan.tubes[h.tube]!
    const color = h.foe ? FOE_GLOW : TEAM_GLOW
    const pts = [
      { x: h.fx, y: h.fy },
      { x: tube.from.x * UNIT, y: tube.from.y * UNIT },
      { x: tube.ahead.x * UNIT, y: tube.ahead.y * UNIT },
      { x: h.tx, y: h.ty },
    ]
    const u = d / ms
    let p: Point
    let size: number
    if (u < SUCK) {
      const k = ease(u / SUCK)
      p = { x: pts[0]!.x + (pts[1]!.x - pts[0]!.x) * k, y: pts[0]!.y + (pts[1]!.y - pts[0]!.y) * k }
      size = h.r * (0.9 - 0.4 * k)
    } else if (u < 1 - SPIT) {
      const k = ease((u - SUCK) / (1 - SUCK - SPIT))
      p = { x: pts[1]!.x + (pts[2]!.x - pts[1]!.x) * k, y: pts[1]!.y + (pts[2]!.y - pts[1]!.y) * k }
      size = h.r * 0.5
    } else if (u < 1) {
      const k = ease((u - 1 + SPIT) / SPIT)
      p = { x: pts[2]!.x + (pts[3]!.x - pts[2]!.x) * k, y: pts[2]!.y + (pts[3]!.y - pts[2]!.y) * k }
      size = h.r * (0.5 + 0.4 * k)
    } else {
      const k = (d - ms) / BURST_MS
      for (const o of copies(tube)) {
        g.lineStyle(0.06 * UNIT, lift(color, 0.4), 0.8 * (1 - k))
        g.strokeCircle(h.tx + o.x * UNIT, h.ty + o.y * UNIT, h.r * (0.9 + 0.8 * k))
      }
      return
    }
    for (const o of copies(tube)) {
      const x = p.x + o.x * UNIT
      const y = p.y + o.y * UNIT
      for (const [k, al, c] of [
        [1.6, 0.18, color],
        [1, 0.5, color],
        [0.45, 0.95, 0xffffff],
      ] as const) {
        g.fillStyle(c, al)
        g.fillCircle(x, y, size * k)
      }
    }
  }

  /** 子弹打在玻璃上：那里闪一颗星，泛开一圈 */
  private ripples(st: WarpState, now: number): void {
    const g = this.glowFx!
    for (const r of st.impacts) {
      const d = now - r.at
      if (d < 0 || d > RIPPLE_MS) continue
      const k = d / RIPPLE_MS
      const rad = RIPPLE_U * UNIT * (0.3 + 0.7 * ease(k))
      g.lineStyle(0.05 * UNIT, 0xcff8ff, 0.8 * (1 - k))
      g.strokeCircle(r.x, r.y, rad)
      const s = 0.35 * UNIT * (1 - k)
      g.lineStyle(0.04 * UNIT, 0xffffff, 1 - k)
      g.lineBetween(r.x - s, r.y, r.x + s, r.y)
      g.lineBetween(r.x, r.y - s, r.x, r.y + s)
    }
  }

  /** 管口给身边的身体打一层补光：出口是提示灯的颜色、充能时是信号蓝，进口是这只缸的灯色；给料塔四周的身体迎着塔那一面亮一点 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return
    const px = x / UNIT
    const py = y / UNIT
    const now = this.now
    let best = PAD_LIGHT_U
    for (const room of st.plan.rooms) {
      const p = st.pads[room.index]!
      for (const [q, color] of [
        [room.exit, p.charge > 0 ? TEAM_GLOW : now < p.coolUntil ? CUE_OFF : CUE_ON],
        [room.entry, SIGNS[room.sign]!.color],
      ] as const) {
        const d = Math.hypot(px - q.x, py - q.y)
        if (d >= best) continue
        best = d
        const l = d || 1
        out.fx = (q.x - px) / l
        out.fy = (q.y - py) / l
        out.color = color
        out.fill = PAD_FILL * (1 - d / PAD_LIGHT_U)
      }
    }
    if (best < PAD_LIGHT_U) return
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
    this.tubeFx = undefined
    this.glowFx = undefined
    this.airFx = undefined
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY, TINT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}

/** 两种颜色按 k 混：k 为 0 是 a，为 1 是 b */
function lerpColor(a: number, b: number, k: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
