import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, Due, ENEMY_SET, Radius, Telegraph, Transform } from '../../ecs/components'
import { emojiRaster } from '../../emoji/textures'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { nextRoom } from './layout'
import { WarpPainter } from './painter'
import { FOE_GLOW, GAZE_COLD, GAZE_HOT, lift, mix, rgb, shade, SIGNS, SPECIMENS, TEAM_GLOW, VOID_DEEP } from './palette'
import { encodeTiles, TILES_FRAG, VOID_FRAG } from './shader'
import { textureSize } from './ground'
import { warpPlanFor } from './world'
import type { Hop, WarpState } from './world'
import type { WarpPlan, WarpRoom } from './layout'
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
const SPECIMEN_KEY = 'warp-specimen-'
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
/** 台子发车、到站时亮的那一下多久，毫秒 */
const BURST_MS = 520
/** 力场受击的涟漪多久、多大（格） */
const RIPPLE_MS = 420
const RIPPLE_U = 0.7
/** 传送台给身边的身体打的补光：多远（格）以内，最浓多少 */
const PAD_LIGHT_U = 2.6
const PAD_FILL = 0.45
/** 核心柱照亮四周的身体：多远（格）以内 */
const CORE_LIGHT_U = 6
/** 眼睛的半径是核心柱的几倍；瞳仁最多偏出眼心几成；视线隔多远（格）就偏到底 */
const EYE_K = 1.25
const LOOK_K = 0.42
const LOOK_FULL_U = 10
/** 锁定的那一下闪多久，毫秒 */
const LOCK_MS = 700
/** 眼睛调人时从眼睛射向各座传送台的光多久，毫秒 */
const CALL_MS = 500
/** 标本的全息像多大、浮多高（格） */
const SPECIMEN_U = 1.5
const SPECIMEN_LIFT_U = 1.7

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (t: number): number => t * t * (3 - 2 * t)

/** 整数打散成 [0, 1)：光块的位置、闪烁这些画面上的随机 */
function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 按次序围成的四边形，两个三角拼成 */
function quad(g: Phaser.GameObjects.Graphics, a: Point, b: Point, c: Point, d: Point): void {
  g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
  g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y)
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

/** 第 i 间房的待机律动里，(x, y)（格）这块瓷砖排在哪：脉冲按离中心多远，光波按顺着扫的方向走到哪 */
function phaseOf(room: WarpRoom, pattern: number, x: number, y: number): number {
  const f = room.floor
  if (pattern === 0) return clamp01(Math.hypot(x - room.center.x, y - room.center.y) / 13)
  if (pattern === 1) {
    const far = { x: room.pad.x < room.center.x ? f.x1 : f.x0, y: room.pad.y < room.center.y ? f.y1 : f.y0 }
    const dx = room.pad.x - far.x
    const dy = room.pad.y - far.y
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
  charge: [number, number, number, number]
  chargeRoom: number
  gaze: [number, number, number, number]
  gazeRoom: number
  gazeCol: [number, number, number]
  lock: number
}

/**
 * 跃迁：底下是望得见底的虚空，网格上流着数据光流，正中的核心柱一路照进深处；镜头跟着队长走，整块方框在画面上往四周平铺。四块平台的地面、台沿与平台的影子是开局在后台线程画好的贴图。
 * 地砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，闲着时按各间的律动透出房间的主色；传送台、光桥、核心柱、出怪板上凝成形的敌人、
 * 被送过虚空的身体散成的光块都每帧现画
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
  private airFx?: Phaser.GameObjects.Graphics
  private readonly u: Uniforms = { time: 0, px: 0.05, charge: [0, 0, 0, 0], chargeRoom: -1, gaze: [0, 0, 0, 0], gazeRoom: -1, gazeCol: [1, 1, 1], lock: 0 }
  private eyeFx?: Phaser.GameObjects.Graphics
  private eyeGlow?: Phaser.GameObjects.Graphics
  private beamFx?: Phaser.GameObjects.Graphics
  private markFx?: Phaser.GameObjects.Graphics
  private specimens: { readonly img: Phaser.GameObjects.Image; readonly x: number; readonly y: number; readonly color: number }[] = []
  private jumpsSeen = 0
  private shuttleSeen: number[] = []
  private charging = false
  private locksSeen = 0
  private spotted = false

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
    this.airFx = scene.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD)
    this.beamFx = v.lens.mainOnly(scene.add.graphics().setDepth(-0.74))
    this.markFx = scene.add.graphics().setDepth(9.45)
    this.eyeFx = v.lens.mainOnly(scene.add.graphics().setDepth(-0.7))
    this.eyeGlow = v.lens.mainOnly(scene.add.graphics().setDepth(-0.69).setBlendMode(Phaser.BlendModes.ADD))
    this.visuals.push(this.floorFx, this.glowFx, this.airFx, this.beamFx, this.markFx, this.eyeFx, this.eyeGlow)
    await this.specimenImages(v, plan)
    const st = sim.worldState.warp
    this.jumpsSeen = st?.jumps ?? 0
    this.shuttleSeen = st ? st.pads.map((p) => p.shuttledAt) : []
    this.locksSeen = st?.gaze.locks ?? 0
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
              set('uCharge', u.charge)
              set('uChargeRoom', u.chargeRoom)
              set('uGaze', u.gaze)
              set('uGazeRoom', u.gazeRoom)
              set('uGazeCol', u.gazeCol)
              set('uLock', u.lock)
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
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.glowFx || !this.airFx || !this.eyeFx || !this.eyeGlow || !this.beamFx || !this.markFx) return
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
    this.airFx.clear()
    this.eyeFx.clear()
    this.eyeGlow.clear()
    this.beamFx.clear()
    this.markFx.clear()
    this.chargeRing(st, cfg)
    this.gazeUniforms(st, cfg, now)
    this.sounds(v, st, cfg)
    st.plan.rooms.forEach((room) => this.bridge(st, cfg, room, now, t))
    st.plan.rooms.forEach((room) => this.pad(sim, st, cfg, room, now, t))
    this.beam(st, cfg, now, t)
    this.eyes(v, sim, st, cfg, now, t)
    this.watched(sim, st)
    this.reticle(sim, st, now, t)
    this.specimenFx(t)
    this.pillars(st, cfg, t)
    this.forming(sim, st, cfg, now)
    for (const h of st.hops) this.voxels(h, cfg, now)
    this.ripples(st, now)
  }

  /** 着色器里那圈扩满整间房的充能光：半径随充能从台边扩到房间最远的角 */
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
    const reach = Math.max(...[f.x0, f.x1].flatMap((x) => [f.y0, f.y1].map((y) => Math.hypot(x - room.pad.x, y - room.pad.y))))
    const r = cfg.pad.radiusU + (reach + 1 - cfg.pad.radiusU) * ease(k)
    this.u.charge = [room.pad.x, room.pad.y, r, 0.4 + 0.6 * k]
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
    const g = st.gaze
    if (g.locks !== this.locksSeen) {
      this.locksSeen = g.locks
      playSfx('glare')
      v.lens.screen.flash(220, 255, 40, 85)
    }
    const spotted = g.room === st.teamRoom
    if (spotted && !this.spotted) playSfx('sonar')
    this.spotted = spotted
    st.pads.forEach((pad, i) => {
      if (pad.shuttledAt === this.shuttleSeen[i]) return
      this.shuttleSeen[i] = pad.shuttledAt
      const to = nextRoom(st.plan, i)
      if (pad.shuttled > 0 && v.lens.screen.sees(to.pad.x * UNIT, to.pad.y * UNIT, 2 * UNIT)) playSfx('warp')
    })
  }

  /**
   * 光桥：第 i 间的传送台与下一间的传送台之间一道光。平时只是一串淡淡的人字纹往下一间流；队长充能时越来越亮，
   * 整队出发、一趟车送人过去的那一阵整条桥亮起来，队伍是信号蓝、敌人是信号红
   */
  private bridge(st: WarpState, cfg: WarpConfig, room: WarpRoom, now: number, t: number): void {
    const to = nextRoom(st.plan, room.index)
    const color = SIGNS[to.sign]!.color
    const R = cfg.pad.radiusU
    const ax = room.pad.x
    const ay = room.pad.y
    const dx = to.pad.x - ax
    const dy = to.pad.y - ay
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    const a = { x: (ax + ux * R) * UNIT, y: (ay + uy * R) * UNIT }
    const b = { x: (to.pad.x - ux * R) * UNIT, y: (to.pad.y - uy * R) * UNIT }
    const span = Math.hypot(b.x - a.x, b.y - a.y)
    const pad = st.pads[room.index]!
    const charge = pad.charge / cfg.pad.chargeMs
    const sinceJump = now - pad.jumpedAt
    const sinceShuttle = now - pad.shuttledAt
    const live = cfg.pad.transitMs + 250
    const teamHot = sinceJump >= 0 && sinceJump < live ? 1 - sinceJump / live : 0
    const foeHot = pad.shuttled > 0 && sinceShuttle >= 0 && sinceShuttle < live ? 1 - sinceShuttle / live : 0
    const g = this.glowFx!
    const f = this.floorFx!
    // 桥身：一道暗的底，上面同色的细线
    f.lineStyle(0.22 * UNIT, shade(color, 0.22), 0.55)
    f.lineBetween(a.x, a.y, b.x, b.y)
    g.lineStyle(0.07 * UNIT, color, 0.35 + 0.5 * charge)
    g.lineBetween(a.x, a.y, b.x, b.y)
    // 人字纹往下一间流，充能时流得快、亮得多
    const step = 0.9 * UNIT
    const speed = (0.7 + 3.5 * charge) * UNIT
    const nx = -uy
    const ny = ux
    for (let s = ((t * speed) % step) - step; s < span; s += step) {
      if (s < 0) continue
      const fade = Math.sin((Math.PI * s) / span)
      const c = { x: a.x + ux * s, y: a.y + uy * s }
      const w = 0.24 * UNIT
      const back = 0.22 * UNIT
      g.lineStyle(0.09 * UNIT, color, (0.45 + 0.55 * charge) * fade)
      g.lineBetween(c.x - ux * back + nx * w, c.y - uy * back + ny * w, c.x, c.y)
      g.lineBetween(c.x - ux * back - nx * w, c.y - uy * back - ny * w, c.x, c.y)
    }
    for (const [hot, glow] of [
      [teamHot, TEAM_GLOW],
      [foeHot, FOE_GLOW],
    ] as const) {
      if (hot <= 0) continue
      for (const [w, al] of [
        [1.6, 0.1],
        [0.9, 0.22],
        [0.4, 0.5],
        [0.18, 0.9],
      ] as const) {
        g.lineStyle(w * UNIT * (0.6 + 0.4 * hot), glow, al * hot)
        g.lineBetween(a.x, a.y, b.x, b.y)
      }
      g.lineStyle(0.06 * UNIT, 0xffffff, hot)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    // 一团光沿桥从这头冲到那头，和穿行的身体一起到
    for (const [since, glow, on] of [
      [sinceJump, TEAM_GLOW, true],
      [sinceShuttle, FOE_GLOW, pad.shuttled > 0],
    ] as const) {
      if (!on || since < 0 || since > cfg.pad.transitMs) continue
      const k = ease(since / cfg.pad.transitMs)
      const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
      g.lineStyle(0.3 * UNIT, glow, 0.5)
      g.lineBetween(a.x, a.y, q.x, q.y)
      for (const [r, al, c] of [
        [0.9, 0.2, glow],
        [0.55, 0.45, glow],
        [0.25, 1, 0xffffff],
      ] as const) {
        g.fillStyle(c, al)
        g.fillCircle(q.x, q.y, r * UNIT)
      }
    }
  }

  /**
   * 一座传送台：外圈是下一间房的颜色。能用时台面上三道人字纹朝下一间滑过去；刚到站、还在冷却时外圈发灰，一段弧随冷却走满；
   * 队长站上来充能，台面一层层亮成信号蓝、往里收的圈越收越快；发车前台面上亮起一圈圈往里收的红；出发、到站时亮一下
   */
  private pad(sim: Sim, st: WarpState, cfg: WarpConfig, room: WarpRoom, now: number, t: number): void {
    const to = nextRoom(st.plan, room.index)
    const color = SIGNS[to.sign]!.color
    const p = st.pads[room.index]!
    const R = cfg.pad.radiusU * UNIT
    const x = room.pad.x * UNIT
    const y = room.pad.y * UNIT
    const f = this.floorFx!
    const g = this.glowFx!
    const cooling = now < p.coolUntil
    const charge = p.charge / cfg.pad.chargeMs
    const rimColor = cooling ? 0x5d6878 : color
    f.lineStyle(0.1 * UNIT, shade(rimColor, 0.5), 1)
    f.strokeCircle(x, y, R * 0.93)
    g.lineStyle(0.06 * UNIT, rimColor, cooling ? 0.5 : 0.85 + 0.15 * Math.sin(t * 3))
    g.strokeCircle(x, y, R * 0.93)
    if (cooling) {
      const k = clamp01(1 - (p.coolUntil - now) / cfg.pad.cooldownMs)
      const a0 = -Math.PI / 2
      g.lineStyle(0.1 * UNIT, color, 0.9)
      g.beginPath()
      g.arc(x, y, R * 0.93, a0, a0 + k * Math.PI * 2, false)
      g.strokePath()
    } else {
      // 朝下一间滑过去的人字纹
      const ux = room.toward.x
      const uy = room.toward.y
      const nx = -uy
      const ny = ux
      for (let k = 0; k < 3; k++) {
        const s = ((t * 0.8 + k / 3) % 1) * 1.4 - 0.7
        const al = Math.sin(((s + 0.7) / 1.4) * Math.PI) * (0.55 + 0.45 * charge)
        const cx = x + ux * s * R
        const cy = y + uy * s * R
        const w = 0.42 * R
        const back = 0.32 * R
        g.lineStyle(0.08 * UNIT, color, al)
        g.lineBetween(cx - ux * back + nx * w, cy - uy * back + ny * w, cx, cy)
        g.lineBetween(cx - ux * back - nx * w, cy - uy * back - ny * w, cx, cy)
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
      // 队伍里每个人头上一道光柱：整队都锁上了
      for (const m of sim.characters) {
        if (!Alive.v[m]) continue
        const mx = Transform.x[m]!
        const my = Transform.y[m]!
        const h = (0.6 + 1.6 * charge) * UNIT
        this.airFx!.fillStyle(TEAM_GLOW, 0.1 + 0.25 * charge)
        this.airFx!.fillRect(mx - 0.12 * UNIT, my - h, 0.24 * UNIT, h)
        this.airFx!.fillStyle(0xffffff, 0.25 * charge)
        this.airFx!.fillRect(mx - 0.035 * UNIT, my - h, 0.07 * UNIT, h)
      }
    }
    // 发车前：台面上一圈圈往里收的红
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
    // 出发与到站
    const flash = (at: number, c: number, strength: number, px: number, py: number): void => {
      const d = now - at
      if (d < 0 || d > BURST_MS || strength <= 0) return
      const k = d / BURST_MS
      g.fillStyle(c, 0.5 * (1 - k) * strength)
      g.fillCircle(px, py, R * (0.7 + 0.5 * k))
      g.lineStyle(0.08 * UNIT, lift(c, 0.5), (1 - k) * strength)
      g.strokeCircle(px, py, R * (0.9 + 1.4 * k))
    }
    const column = (at: number, c: number, strength: number, px: number, py: number, rising: boolean): void => {
      const d = now - at
      if (d < 0 || d > BURST_MS || strength <= 0) return
      const k = d / BURST_MS
      const h = 3.2 * UNIT * (rising ? 0.4 + 0.6 * ease(k) : 1 - 0.6 * ease(k))
      for (const [w, al] of [
        [1, 0.16],
        [0.6, 0.3],
        [0.22, 0.7],
      ] as const) {
        this.airFx!.fillStyle(w < 0.3 ? 0xffffff : c, al * (1 - k) * strength)
        this.airFx!.fillRect(px - R * w, py - h, R * w * 2, h)
      }
    }
    column(p.jumpedAt, TEAM_GLOW, 1, x, y, true)
    column(p.shuttledAt, FOE_GLOW, p.shuttled > 0 ? 1 : 0, x, y, true)
    column(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, to.pad.x * UNIT, to.pad.y * UNIT, false)
    column(p.shuttledAt + cfg.pad.transitMs, FOE_GLOW, p.shuttled > 0 ? 1 : 0, to.pad.x * UNIT, to.pad.y * UNIT, false)
    flash(p.jumpedAt, TEAM_GLOW, 1, x, y)
    flash(p.shuttledAt, FOE_GLOW, p.shuttled > 0 ? 1 : 0.25, x, y)
    const tx = to.pad.x * UNIT
    const ty = to.pad.y * UNIT
    flash(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, tx, ty)
    flash(p.shuttledAt + cfg.pad.transitMs, FOE_GLOW, p.shuttled > 0 ? 1 : 0, tx, ty)
    // 被眼睛调去队伍那间：这座台烧红着发车，那边的台子到点一齐涌出来
    const called = st.plan.rooms[p.calledTo]!.pad
    column(p.calledAt, FOE_GLOW, p.called > 0 ? 1 : 0.35, x, y, true)
    flash(p.calledAt, GAZE_HOT, 1, x, y)
    column(p.calledAt + cfg.pad.transitMs, FOE_GLOW, p.called > 0 ? 1 : 0, called.x * UNIT, called.y * UNIT, false)
    flash(p.calledAt + cfg.pad.transitMs, FOE_GLOW, p.called > 0 ? 1 : 0, called.x * UNIT, called.y * UNIT)
  }

  /** 此刻有没有敌人站在这座台上 */
  private crowd(sim: Sim, cfg: WarpConfig, room: WarpRoom): boolean {
    const r = cfg.pad.radiusU * UNIT
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] && Math.hypot(Transform.x[e]! - room.pad.x * UNIT, Transform.y[e]! - room.pad.y * UNIT) <= r) return true
    return false
  }

  /** 此刻视线的颜色：锁定越近越红 */
  private gazeColor(st: WarpState): number {
    return mix(GAZE_COLD, GAZE_HOT, st.gaze.heat * st.gaze.heat)
  }

  /** 着色器里眼睛盯着的那间：光斑在哪、多大、锁定攒到多少，视线的颜色，锁定那一下的闪 */
  private gazeUniforms(st: WarpState, cfg: WarpConfig, now: number): void {
    const g = st.gaze
    this.u.gaze = [g.x, g.y, cfg.gaze.spotU, g.heat]
    this.u.gazeRoom = g.room
    this.u.gazeCol = rgb(this.gazeColor(st))
    this.u.lock = clamp01(1 - (now - g.lockedAt) / LOCK_MS)
  }

  /**
   * 视线：从眼睛斜斜地照到地上的一道光，落地是一块光斑，光斑边上一圈刻度慢慢转；跟丢时视线发虚、一闪一闪地在原来那间里乱扫。
   * 只从真的那只眼睛照出来
   */
  private beam(st: WarpState, cfg: WarpConfig, now: number, t: number): void {
    const g = st.gaze
    const b = this.beamFx!
    const cx = st.plan.core.x * UNIT
    const cy = st.plan.core.y * UNIT
    const fx = g.x * UNIT
    const fy = g.y * UNIT
    const dx = fx - cx
    const dy = fy - cy
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const lost = now < g.lostUntil
    const color = this.gazeColor(st)
    const flick = lost ? 0.45 + 0.35 * Math.abs(Math.sin(t * 23)) : 1
    const R = cfg.core.radiusU * EYE_K * UNIT
    const spot = cfg.gaze.spotU * UNIT
    for (const [w, al] of [
      [1, 0.06],
      [0.7, 0.07],
      [0.4, 0.08],
    ] as const) {
      const r0 = R * 0.35 * w
      const r1 = spot * w
      b.fillStyle(color, al * flick * (1 + g.heat))
      quad(b, { x: cx + nx * r0, y: cy + ny * r0 }, { x: fx + nx * r1, y: fy + ny * r1 }, { x: fx - nx * r1, y: fy - ny * r1 }, { x: cx - nx * r0, y: cy - ny * r0 })
    }
    b.fillStyle(color, 0.12 * flick)
    b.fillCircle(fx, fy, spot)
    b.lineStyle(0.07 * UNIT, color, 0.85 * flick)
    b.strokeCircle(fx, fy, spot)
    const spin = t * 0.6
    b.lineStyle(0.12 * UNIT, color, 0.8 * flick)
    for (let k = 0; k < 12; k++) {
      const a = spin + (k / 12) * Math.PI * 2
      const r = spot * (k % 3 === 0 ? 0.82 : 0.9)
      b.lineBetween(fx + Math.cos(a) * r, fy + Math.sin(a) * r, fx + Math.cos(a) * spot * 0.97, fy + Math.sin(a) * spot * 0.97)
    }
  }

  /**
   * 核心柱是一只眼：一圈暗色的机壳上八片光圈叶片，里面眼白、青色的虹膜、黑的瞳孔。虹膜朝视线落下的地方偏过去，锁定越近越红、瞳孔越缩越小；
   * 跟丢时虹膜发暗。画面往四周平铺出的每一只眼都是它，每一只都转过来看着同一处
   */
  private eyes(v: ViewCtx, sim: Sim, st: WarpState, cfg: WarpConfig, now: number, t: number): void {
    const g = st.gaze
    const e = this.eyeFx!
    const glow = this.eyeGlow!
    const R = cfg.core.radiusU * EYE_K * UNIT
    const W = FRAME_U * UNIT
    const fx = g.x * UNIT
    const fy = g.y * UNIT
    const heat = g.heat
    const lost = now < g.lostUntil
    const iris = mix(0x18c8ee, 0xe8203f, heat * heat)
    const lock = clamp01(1 - (now - g.lockedAt) / LOCK_MS)
    let boss = 0
    for (const b of query(sim.world, [Telegraph, Due])) {
      if (!Telegraph.boss[b]) continue
      const span = Math.max(1, Due.at[b]! - Telegraph.bornMs[b]!)
      boss = Math.max(boss, clamp01((sim.elapsedMs - Telegraph.bornMs[b]!) / span))
    }
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cx = st.plan.core.x * UNIT + i * W
        const cy = st.plan.core.y * UNIT + j * W
        if (!v.lens.screen.sees(cx, cy, R * 3)) continue
        const dx = fx - cx
        const dy = fy - cy
        const d = Math.hypot(dx, dy) || 1
        const off = R * LOOK_K * Math.min(1, d / (LOOK_FULL_U * UNIT))
        const ex = cx + (dx / d) * off
        const ey = cy + (dy / d) * off
        // 机壳与光圈叶片
        e.fillStyle(0x07141c, 1)
        e.fillCircle(cx, cy, R * 1.24)
        e.lineStyle(0.05 * UNIT, 0x2a6a80, 1)
        e.strokeCircle(cx, cy, R * 1.24)
        for (let k = 0; k < 8; k++) {
          const a = t * 0.15 + (k / 8) * Math.PI * 2
          e.lineStyle(0.04 * UNIT, 0x1d4c5c, 1)
          e.lineBetween(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, cx + Math.cos(a + 0.5) * R * 1.22, cy + Math.sin(a + 0.5) * R * 1.22)
        }
        // 眼白：背着光的那一边暗一点，像个球
        e.fillStyle(0xcfeef6, 1)
        e.fillCircle(cx, cy, R)
        e.fillStyle(0x7fb6c6, 0.55)
        e.fillCircle(cx + R * 0.16, cy + R * 0.2, R * 0.86)
        e.fillStyle(0xe8fbff, 1)
        e.fillCircle(cx - R * 0.08, cy - R * 0.1, R * 0.8)
        // 眼白上几根血丝，锁定越近越多
        const veins = Math.round(heat * 9)
        e.lineStyle(0.03 * UNIT, 0xd8344c, 0.75)
        for (let k = 0; k < veins; k++) {
          const a = (k / 9) * Math.PI * 2 + 0.4
          e.lineBetween(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97, cx + Math.cos(a + 0.12) * R * 0.66, cy + Math.sin(a + 0.12) * R * 0.66)
        }
        // 虹膜
        const ir = R * 0.52
        e.fillStyle(shade(iris, lost ? 0.45 : 0.75), 1)
        e.fillCircle(ex, ey, ir)
        e.fillStyle(lost ? shade(iris, 0.6) : iris, 1)
        e.fillCircle(ex, ey, ir * 0.82)
        e.lineStyle(0.03 * UNIT, lift(iris, 0.5), 0.8)
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2
          e.lineBetween(ex + Math.cos(a) * ir * 0.4, ey + Math.sin(a) * ir * 0.4, ex + Math.cos(a) * ir * 0.8, ey + Math.sin(a) * ir * 0.8)
        }
        // 瞳孔：锁定越近缩得越小
        const pr = ir * (0.5 - 0.22 * heat)
        e.fillStyle(0x020608, 1)
        e.fillCircle(ex, ey, pr)
        e.fillStyle(0xffffff, 0.85)
        e.fillCircle(ex - ir * 0.32, ey - ir * 0.36, ir * 0.16)
        // 眼睛四周的光，锁定那一下扩出一圈红；头目要出来时整只眼一闪一闪地发红
        glow.fillStyle(iris, 0.18 + 0.25 * heat)
        glow.fillCircle(ex, ey, ir * 1.25)
        glow.fillStyle(GAZE_COLD, 0.06)
        glow.fillCircle(cx, cy, R * 1.9)
        if (lock > 0) {
          glow.lineStyle(0.18 * UNIT, GAZE_HOT, lock)
          glow.strokeCircle(cx, cy, R * (1.3 + 3 * (1 - lock)))
        }
        if (boss > 0) {
          glow.fillStyle(0xff4060, 0.3 * boss * (0.5 + 0.5 * Math.sin(t * (8 + 20 * boss))))
          glow.fillCircle(cx, cy, R * 1.4)
        }
      }
    }
    // 锁定那一刻：从眼睛射向全站其余的传送台
    for (const [i, p] of st.pads.entries()) {
      const d = now - p.calledAt
      if (d < 0 || d > CALL_MS) continue
      const k = 1 - d / CALL_MS
      const pad = st.plan.rooms[i]!.pad
      this.airFx!.lineStyle(0.16 * UNIT, GAZE_HOT, 0.8 * k)
      this.airFx!.lineBetween(st.plan.core.x * UNIT, st.plan.core.y * UNIT, pad.x * UNIT, pad.y * UNIT)
    }
  }

  /** 被盯着的那间里的敌人脚下一圈视线色的圈：它们跑得快、打得疼 */
  private watched(sim: Sim, st: WarpState): void {
    const room = st.gaze.room
    if (room < 0) return
    const f = st.plan.rooms[room]!.slab
    const color = this.gazeColor(st)
    const g = this.floorFx!
    g.lineStyle(0.08 * UNIT, color, 0.9)
    for (const e of query(sim.world, ENEMY_SET)) {
      if (!Alive.v[e]) continue
      const x = Transform.x[e]!
      const y = Transform.y[e]!
      if (x < f.x0 * UNIT || x >= f.x1 * UNIT || y < f.y0 * UNIT || y >= f.y1 * UNIT) continue
      const r = Radius.v[e]! * 1.2
      g.strokeEllipse(x, y + r * 0.25, r * 2, r * 1.2)
    }
  }

  /** 队伍被盯着时，队长四周四个角标往里收，锁定越近收得越紧、越红，快满时一闪一闪 */
  private reticle(sim: Sim, st: WarpState, now: number, t: number): void {
    const g = st.gaze
    if (g.room !== st.teamRoom || now < g.lostUntil) return
    const lead = sim.leader
    if (!Alive.v[lead]) return
    const x = Transform.x[lead]!
    const y = Transform.y[lead]!
    const k = g.heat
    const r = (2.4 - 1.5 * k) * UNIT
    const color = this.gazeColor(st)
    const blink = k > 0.8 ? 0.5 + 0.5 * Math.sign(Math.sin(t * 18)) : 1
    const a = this.markFx!
    a.lineStyle(0.1 * UNIT, color, (0.45 + 0.55 * k) * blink)
    const arm = 0.5 * UNIT
    for (let q = 0; q < 4; q++) {
      const ang = t * (0.5 + 2 * k) + (q * Math.PI) / 2
      const cx = x + Math.cos(ang) * r
      const cy = y - 0.5 * UNIT + Math.sin(ang) * r
      const ux = -Math.cos(ang)
      const uy = -Math.sin(ang)
      a.lineBetween(cx, cy, cx - uy * arm, cy + ux * arm)
      a.lineBetween(cx, cy, cx + uy * arm, cy - ux * arm)
    }
  }

  /** 每间房的标本：按那间的签名画出它的 emoji，放进自己的贴图里；狭长那间供在机柜台上，回廊那间浮在凹槽上，别的浮在离核心柱最远的那个角上 */
  private async specimenImages(v: ViewCtx, plan: WarpPlan): Promise<void> {
    const imgs = await Promise.all(plan.rooms.map((r) => emojiRaster(SPECIMENS[r.sign]!, 'player')))
    plan.rooms.forEach((room, i) => {
      const key = SPECIMEN_KEY + i
      if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
      v.scene.textures.addImage(key, imgs[i]!)
      const f = room.floor
      const corner = { x: room.center.x < plan.core.x ? f.x0 + 2.5 : f.x1 - 2.5, y: room.center.y < plan.core.y ? f.y0 + 3.5 : f.y1 - 2 }
      const at = room.deck ? { x: (room.deck.x0 + room.deck.x1) / 2, y: (room.deck.y0 + room.deck.y1) / 2 } : room.pit ? room.center : corner
      const img = v.scene.add.image(at.x * UNIT, (at.y - SPECIMEN_LIFT_U) * UNIT, key).setDepth(9.4)
      img.setDisplaySize(SPECIMEN_U * UNIT, SPECIMEN_U * UNIT)
      this.visuals.push(img)
      this.specimens.push({ img, x: at.x * UNIT, y: at.y * UNIT, color: SIGNS[room.sign]!.color })
    })
  }

  /** 标本的全息像：脚下一圈投影台，一道光往上托着它，像慢慢转着、上下浮，一道道扫描线往上走 */
  private specimenFx(t: number): void {
    const size = SPECIMEN_U * UNIT
    this.specimens.forEach((sp, k) => {
      const bob = Math.sin(t * 1.3 + k) * 0.12 * UNIT
      const top = sp.y - SPECIMEN_LIFT_U * UNIT + bob
      const turn = Math.cos(t * 0.7 + k * 1.7)
      const base = size / sp.img.width
      sp.img.setScale(base * (0.7 + 0.3 * turn), base)
      sp.img.setPosition(sp.x, top)
      sp.img.setAlpha(0.8 + 0.15 * Math.sin(t * 9 + k) * Math.sin(t * 2.3))
      const g = this.glowFx!
      g.lineStyle(0.06 * UNIT, sp.color, 0.8)
      g.strokeEllipse(sp.x, sp.y, 1.3 * UNIT, 0.7 * UNIT)
      g.fillStyle(sp.color, 0.25)
      g.fillEllipse(sp.x, sp.y, 0.9 * UNIT, 0.45 * UNIT)
      const a = this.airFx!
      a.fillStyle(sp.color, 0.08)
      quad(a, { x: sp.x - 0.4 * UNIT, y: sp.y }, { x: sp.x - size * 0.55, y: top - size * 0.1 }, { x: sp.x + size * 0.55, y: top - size * 0.1 }, { x: sp.x + 0.4 * UNIT, y: sp.y })
      for (let j = 0; j < 3; j++) {
        const s = (t * 0.5 + j / 3) % 1
        const y = top + size * 0.5 - s * size
        a.lineStyle(0.04 * UNIT, sp.color, 0.45 * Math.sin(Math.PI * s))
        a.lineBetween(sp.x - size * 0.5, y, sp.x + size * 0.5, y)
      }
    })
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
    const ms = cfg.pad.transitMs
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

  /** 传送台给身边的身体打一层下一间颜色的补光；眼睛四周的身体迎着眼睛那一面染上视线的颜色 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return
    let best = PAD_LIGHT_U
    for (const room of st.plan.rooms) {
      const px = x / UNIT
      const py = y / UNIT
      const d = Math.hypot(px - room.pad.x, py - room.pad.y)
      if (d >= best) continue
      best = d
      const l = d || 1
      const p = st.pads[room.index]!
      out.fx = (room.pad.x - px) / l
      out.fy = (room.pad.y - py) / l
      out.color = p.charge > 0 ? TEAM_GLOW : SIGNS[nextRoom(st.plan, room.index).sign]!.color
      out.fill = PAD_FILL * (1 - d / PAD_LIGHT_U)
    }
    if (best < PAD_LIGHT_U) return
    const d = Math.hypot(x / UNIT - st.plan.core.x, y / UNIT - st.plan.core.y)
    if (d >= CORE_LIGHT_U) return
    out.fx = (st.plan.core.x - x / UNIT) / d
    out.fy = (st.plan.core.y - y / UNIT) / d
    out.color = this.gazeColor(st)
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
    this.airFx = undefined
    this.eyeFx = undefined
    this.eyeGlow = undefined
    this.beamFx = undefined
    this.markFx = undefined
    this.specimens = []
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY, TINT_KEY, ...[0, 1, 2, 3].map((i) => SPECIMEN_KEY + i)]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
