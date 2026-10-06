import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, Due, Telegraph, Transform } from '../../ecs/components'
import { decorSprite } from '../../ecs/decor'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { nextRoom } from './layout'
import { WarpPainter } from './painter'
import { CORE_GLOW, DARK, FOE_GLOW, lift, rgb, shade, SIGNS, TEAM_GLOW, VOID_DEEP } from './palette'
import { encodeTiles, TILES_FRAG, VOID_FRAG } from './shader'
import { FACE_U, textureSize } from './ground'
import { warpPlanFor } from './world'
import type { Decor } from '../../ecs/decor'
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
/** 熄透的房间压上多浓的暗色；熄了灯的东西还留着几成光 */
const DARK_MAX = 0.8
const STANDBY = 0.15
/** 灯刚亮起来的那一段一闪一闪：每一下多久，毫秒 */
const FLICKER_MS = 70
/** 标本管里的东西多大（格）、上下浮多少（格）；管里往上冒的气泡有几个 */
const SPECIMEN_U = 0.95
const BOB_U = 0.12
const BUBBLES = 6
/** 熄灯房间正中的暂停号：两竖条多高、多宽、隔多远，格 */
const PAUSE = { h: 2.4, w: 0.55, gap: 0.6 } as const
/** 队伍所在那间四角的取景框：离平台边多远、两臂多长，格 */
const FINDER = { inset: 0.45, arm: 2.2 } as const

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
  clock: [number, number, number, number]
  power: [number, number, number, number]
}

/**
 * 跃迁：底下是望得见底的虚空，网格上流着数据光流，正中的核心柱一路照进深处；镜头跟着队长走，整块方框在画面上往四周平铺。四块平台的地面、台沿与平台的影子是开局在后台线程画好的贴图。
 * 地砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，闲着时按各间的律动透出房间的主色；传送台、光桥、核心柱、标本管、出怪板上凝成形的敌人、
 * 被送过虚空的身体散成的光块都每帧现画。每间房按自己的灯压一层暗色：熄了灯的房间正中一个暂停号，房里的一切都按那间的钟走、停在熄灯那一刻；
 * 队伍所在那间四角一副取景框，亮灯、熄灯时一道扫描线扫过整块平台
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
  private shadeFx?: Phaser.GameObjects.Graphics
  private readonly u: Uniforms = { time: 0, px: 0.05, charge: [0, 0, 0, 0], chargeRoom: -1, clock: [0, 0, 0, 0], power: [1, 1, 1, 1] }
  private jumpsSeen = 0
  private charging = false
  /** 各间房此刻画出来的灯亮几成（亮起来时会闪）与各间自己的钟，秒 */
  private readonly vp = [1, 1, 1, 1]
  private readonly rt = [0, 0, 0, 0]
  /** 四根标本管里泡着的东西 */
  private specimens: Decor[] = []

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

  /** 四根标本管里泡着的东西：按那间房的季节 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const cfg = v.def.warp!
    this.specimens = plan.rooms.map((room) => decorSprite(atlas, cfg.specimens[room.sign]!, room.vault.x * UNIT, room.vault.y * UNIT, SPECIMEN_U * UNIT, 0, 1))
    v.decor.push(...this.specimens)
  }

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
    this.shadeFx = scene.add.graphics().setDepth(9.4)
    this.airFx = scene.add.graphics().setDepth(9.5).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.floorFx, this.glowFx, this.shadeFx, this.airFx)
    const st = sim.worldState.warp
    this.jumpsSeen = st?.jumps ?? 0
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
              set('uClock', u.clock)
              set('uPower', u.power)
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
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.glowFx || !this.airFx || !this.shadeFx) return
    this.state = st
    const now = sim.elapsedMs
    const t = sim.fxMs / 1000
    this.u.time = t
    this.u.px = 1 / (v.lens.screen.zoom() * UNIT)
    this.lights(st, now)
    const tl = st.tiles
    encodeTiles(this.tiles.img.data, tl.team, tl.foe, tl.teamFrom, tl.foeFrom, st.plan.tiles, st.lights.map((l) => l.clock), cfg.tiles.teamFadeMs, cfg.tiles.foeFadeMs, FLASH_MS)
    push(this.tiles)
    this.floorFx.clear()
    this.glowFx.clear()
    this.airFx.clear()
    this.shadeFx.clear()
    this.chargeRing(st, cfg)
    this.sounds(st, cfg)
    st.plan.rooms.forEach((room) => this.bridge(st, cfg, room, now))
    st.plan.rooms.forEach((room) => this.pad(sim, st, cfg, room, now))
    this.core(sim, st, t)
    this.pillars(st, cfg)
    st.plan.rooms.forEach((room) => this.vault(cfg, room))
    this.forming(sim, st, cfg, now)
    for (const h of st.hops) this.voxels(h, cfg, now)
    this.ripples(st, now)
    st.plan.rooms.forEach((room) => this.shade(st, room, t))
  }

  /**
   * 各间房画出来的灯与钟：队伍所在那间灯还没全亮时一闪一闪地亮起来，越亮闪得越少；熄灯一路平平地暗下去。
   * 着色器要的各间的钟与灯也在这里给
   */
  private lights(st: WarpState, now: number): void {
    st.lights.forEach((l, i) => {
      let p = l.power
      if (i === st.teamRoom && p < 1 && p > 0) {
        const n = noise(Math.floor(now / FLICKER_MS), i + 1)
        if (n > 0.25 + 0.75 * p) p *= 0.3
      }
      this.vp[i] = p
      this.rt[i] = l.clock / 1000
      this.u.clock[i] = l.clock / 1000
      this.u.power[i] = p
    })
  }

  /** 熄了灯的东西还留几成光 */
  private glow(room: WarpRoom): number {
    return STANDBY + (1 - STANDBY) * this.vp[room.index]!
  }

  /**
   * 一间房的灯：按灯暗了几成在整块平台（连同朝下的侧面）上压一层暗色，熄透了正中一个暂停号；亮灯、熄灯的半路上一道扫描线扫过平台，
   * 亮灯从上往下、熄灯从下往上；队伍所在那间四角一副取景框，角上一颗录像的红点一闪一闪
   */
  private shade(st: WarpState, room: WarpRoom, t: number): void {
    const g = this.shadeFx!
    const a = this.airFx!
    const p = this.vp[room.index]!
    const power = st.lights[room.index]!.power
    const b = room.slab
    const x0 = b.x0 * UNIT
    const y0 = b.y0 * UNIT
    const w = (b.x1 - b.x0) * UNIT
    const h = (b.y1 - b.y0 + FACE_U) * UNIT
    if (p < 1) {
      g.fillStyle(DARK, DARK_MAX * (1 - p))
      g.fillRect(x0, y0, w, h)
    }
    const off = 1 - power
    if (off > 0.02) {
      const cx = room.center.x * UNIT
      const cy = room.center.y * UNIT
      const ph = PAUSE.h * UNIT
      const pw = PAUSE.w * UNIT
      const gap = PAUSE.gap * UNIT
      g.fillStyle(CORE_GLOW, 0.3 * off * off)
      g.fillRect(cx - gap / 2 - pw, cy - ph / 2, pw, ph)
      g.fillRect(cx + gap / 2, cy - ph / 2, pw, ph)
    }
    if (power > 0 && power < 1) {
      const sy = y0 + h * power
      const k = Math.sin(Math.PI * power)
      for (const [lw, al] of [
        [0.9, 0.12],
        [0.35, 0.3],
        [0.1, 0.9],
      ] as const) {
        a.fillStyle(lw < 0.2 ? 0xffffff : CORE_GLOW, al * k)
        a.fillRect(x0, sy - (lw * UNIT) / 2, w, lw * UNIT)
      }
    }
    if (room.index !== st.teamRoom || p <= 0) return
    const fi = FINDER.inset * UNIT
    const arm = FINDER.arm * UNIT
    g.lineStyle(0.12 * UNIT, CORE_GLOW, 0.6 * p)
    for (const [cx, sx] of [
      [x0 + fi, 1],
      [x0 + w - fi, -1],
    ] as const) {
      for (const [cy, sy] of [
        [y0 + fi, 1],
        [b.y1 * UNIT - fi, -1],
      ] as const) {
        g.lineBetween(cx, cy, cx + sx * arm, cy)
        g.lineBetween(cx, cy, cx, cy + sy * arm)
      }
    }
    if (Math.sin(t * Math.PI * 2 * 0.8) > -0.2) {
      g.fillStyle(0xff3048, 0.85 * p)
      g.fillCircle(x0 + fi + 0.6 * UNIT, y0 + fi + 0.6 * UNIT, 0.2 * UNIT)
    }
  }

  /**
   * 标本管：外角立着的一根玻璃管，管里是那间房颜色的液体，泡着那一季的东西，按房间的钟上下浮、慢慢转，气泡往上冒；
   * 熄了灯就停在那一刻
   */
  private vault(cfg: WarpConfig, room: WarpRoom): void {
    const f = this.floorFx!
    const a = this.airFx!
    const color = SIGNS[room.sign]!.color
    const lit = this.glow(room)
    const t = this.rt[room.index]!
    const r = room.vault.r * UNIT * 0.82
    const x = room.vault.x * UNIT
    const base = room.vault.y * UNIT
    const h = cfg.vault.heightM * LIFT_PER_M
    const top = base - h
    f.fillStyle(shade(color, 0.35), 0.55)
    f.fillRect(x - r, top, r * 2, h)
    f.fillStyle(color, 0.22)
    f.fillRect(x - r, top + h * 0.12, r * 2, h * 0.88)
    const spec = this.specimens[room.index]
    if (spec) {
      spec.x = x
      spec.y = base - h * 0.5 + Math.sin(t * 1.3 + room.index) * BOB_U * UNIT
      spec.rot = Math.sin(t * 0.7 + room.index * 2) * 0.35
    }
    for (let k = 0; k < BUBBLES; k++) {
      const s = (t * (0.25 + 0.1 * noise(k, room.index)) + k / BUBBLES) % 1
      const bx = x + (noise(k + 7, room.index) - 0.5) * r * 1.4 + Math.sin(t * 3 + k) * 0.05 * UNIT
      a.fillStyle(lift(color, 0.6), 0.5 * lit * Math.sin(Math.PI * s))
      a.fillCircle(bx, base - h * 0.1 - h * 0.78 * s, (0.05 + 0.04 * noise(k, 3)) * UNIT)
    }
    // 玻璃：两边一线亮，左边一道高光，管口与管底各一圈
    a.lineStyle(0.05 * UNIT, lift(color, 0.5), 0.55 * lit)
    a.lineBetween(x - r, top, x - r, base)
    a.lineBetween(x + r, top, x + r, base)
    a.fillStyle(0xffffff, 0.16 * lit)
    a.fillRect(x - r * 0.62, top + h * 0.08, r * 0.18, h * 0.8)
    a.lineStyle(0.08 * UNIT, CORE_GLOW, 0.7 * lit)
    a.strokeEllipse(x, top, r * 2, r * 0.7)
    a.lineStyle(0.06 * UNIT, color, 0.6 * lit)
    a.strokeEllipse(x, base, r * 2, r * 0.7)
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

  /** 开始充能、整队出发 */
  private sounds(st: WarpState, cfg: WarpConfig): void {
    const p = st.pads[st.teamRoom]
    const charging = !!p && p.charge > 0 && p.charge < cfg.pad.chargeMs
    if (charging && !this.charging && p.charge < 200) playSfx('charge')
    this.charging = charging
    if (st.jumps !== this.jumpsSeen) {
      this.jumpsSeen = st.jumps
      playSfx('jump')
    }
  }

  /**
   * 光桥：第 i 间的传送台与下一间的传送台之间一道光。平时只是一串淡淡的人字纹往下一间流，按出发那间的钟走、随那间的灯明暗；
   * 队长充能时越来越亮，整队出发的那一阵整条桥亮成信号蓝，跟着走的敌人再叠一道信号红
   */
  private bridge(st: WarpState, cfg: WarpConfig, room: WarpRoom, now: number): void {
    const t = this.rt[room.index]!
    const lit = this.glow(room)
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
    const live = cfg.pad.transitMs + 250
    const teamHot = sinceJump >= 0 && sinceJump < live ? 1 - sinceJump / live : 0
    const foeHot = pad.carried > 0 ? teamHot * 0.6 : 0
    const g = this.glowFx!
    const f = this.floorFx!
    // 桥身：一道暗的底，上面同色的细线
    f.lineStyle(0.22 * UNIT, shade(color, 0.22), 0.55)
    f.lineBetween(a.x, a.y, b.x, b.y)
    g.lineStyle(0.07 * UNIT, color, (0.35 + 0.5 * charge) * lit)
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
      g.lineStyle(0.09 * UNIT, color, (0.45 + 0.55 * charge) * fade * lit)
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
      [sinceJump - 90, FOE_GLOW, pad.carried > 0],
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
   * 队长站上来充能，台面一层层亮成信号蓝、往里收的圈越收越快；出发、到站时亮一下。台子按那间的钟走、随那间的灯明暗
   */
  private pad(sim: Sim, st: WarpState, cfg: WarpConfig, room: WarpRoom, now: number): void {
    const t = this.rt[room.index]!
    const lit = this.glow(room)
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
    g.lineStyle(0.06 * UNIT, rimColor, (cooling ? 0.5 : 0.85 + 0.15 * Math.sin(t * 3)) * lit)
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
        g.lineStyle(0.08 * UNIT, color, al * lit)
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
    const foes = p.carried > 0 ? 0.7 : 0
    const tx = to.pad.x * UNIT
    const ty = to.pad.y * UNIT
    column(p.jumpedAt, TEAM_GLOW, 1, x, y, true)
    column(p.jumpedAt + 60, FOE_GLOW, foes, x, y, true)
    column(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, tx, ty, false)
    column(p.jumpedAt + cfg.pad.transitMs + 60, FOE_GLOW, foes, tx, ty, false)
    flash(p.jumpedAt, TEAM_GLOW, 1, x, y)
    flash(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, tx, ty)
    flash(p.jumpedAt + cfg.pad.transitMs + 60, FOE_GLOW, foes, tx, ty)
  }

  /**
   * 核心柱：方框正中一根发光的柱子，是全图唯一的高光——白亮的柱顶、外面几圈转着的光环，一道光往上冲出平台的高度；
   * 头目要从核心里出来时，柱子先烧成红白色
   */
  private core(sim: Sim, st: WarpState, t: number): void {
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
    const rise = 3.2 * LIFT_PER_M * 2
    // 往上冲出平台的那一截光
    const slices = 14
    for (let j = 0; j < slices; j++) {
      const s0 = j / slices
      const fade = (1 - s0) ** 1.6
      for (const [w, al] of [
        [0.95, 0.07],
        [0.5, 0.14],
        [0.2, 0.35],
      ] as const) {
        const ww = r * w * (1 - 0.35 * s0)
        g.fillStyle(tint, al * fade * (1 + hot))
        g.fillRect(cx - ww, cy - rise * (s0 + 1 / slices), ww * 2, rise / slices)
      }
    }
    for (const [k, al] of [
      [2.6, 0.05],
      [1.8, 0.1],
      [1.25, 0.2],
      [0.9, 0.45],
      [0.55, 0.9],
    ] as const) {
      g.fillStyle(k < 0.6 ? 0xffffff : tint, al * (1 + 0.6 * hot))
      g.fillCircle(cx, cy, r * k)
    }
    for (let k = 0; k < 3; k++) {
      const a0 = t * (0.6 + k * 0.35) * (k % 2 ? -1 : 1) + (k * Math.PI * 2) / 3
      g.lineStyle(0.06 * UNIT, tint, 0.7)
      for (let s = 0; s < 3; s++) {
        g.beginPath()
        g.arc(cx, cy, r * (1.15 + k * 0.28), a0 + (s * Math.PI * 2) / 3, a0 + (s * Math.PI * 2) / 3 + 1.2, false)
        g.strokePath()
      }
    }
  }

  /** 立柱：墩子上立着一根半透明的光柱，一圈圈光往上走；按那间的钟走、随那间的灯明暗 */
  private pillars(st: WarpState, cfg: WarpConfig): void {
    const g = this.airFx!
    const h = cfg.pillars.heightM * LIFT_PER_M
    for (const room of st.plan.rooms) {
      if (room.pillars.length === 0) continue
      const t = this.rt[room.index]!
      const lit = this.glow(room)
      const color = SIGNS[room.sign]!.color
      room.pillars.forEach((b, k) => {
        const x0 = b.x0 * UNIT + 0.12 * UNIT
        const w = (b.x1 - b.x0) * UNIT - 0.24 * UNIT
        const base = b.y1 * UNIT - 0.25 * UNIT
        g.fillStyle(color, 0.1 * lit)
        g.fillRect(x0, base - h, w, h)
        g.fillStyle(lift(color, 0.5), 0.16 * lit)
        g.fillRect(x0 + w * 0.35, base - h, w * 0.3, h)
        for (let j = 0; j < 3; j++) {
          const s = (t * 0.45 + j / 3 + k * 0.17) % 1
          g.fillStyle(lift(color, 0.6), 0.45 * Math.sin(Math.PI * s) * lit)
          g.fillRect(x0, base - h * s - 0.03 * UNIT, w, 0.06 * UNIT)
        }
        g.fillStyle(0xffffff, 0.3 * lit)
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

  /** 传送台给身边的身体打一层下一间颜色的补光；核心柱四周的身体迎着柱子那一面亮一点 */
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
      out.fill = PAD_FILL * (1 - d / PAD_LIGHT_U) * this.glow(room)
    }
    if (best < PAD_LIGHT_U) return
    const d = Math.hypot(x / UNIT - st.plan.core.x, y / UNIT - st.plan.core.y)
    if (d >= CORE_LIGHT_U) return
    out.fx = (st.plan.core.x - x / UNIT) / d
    out.fy = (st.plan.core.y - y / UNIT) / d
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
    this.airFx = undefined
    this.shadeFx = undefined
    this.state = undefined
    this.specimens = []
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY, TINT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
