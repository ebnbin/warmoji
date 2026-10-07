import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, Due, ENEMY_SET, Telegraph, Transform } from '../../ecs/components'
import { decorSprite } from '../../ecs/decor'
import { FONT_FAMILY } from '../../ui/theme'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { ExitPainter } from './painter'
import { CYAN_GLOW, EXIT_GREEN, FOE_GLOW, hex, lift, rgb, SEASONS, shade, TEAM_GLOW, VOID_DEEP } from './palette'
import { encodeTiles, TILES_FRAG, VOID_FRAG } from './shader'
import { textureSize } from './ground'
import { exitPlanFor } from './world'
import type { Flight, ExitState } from './world'
import type { Chamber, Door, ExitPlan } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { ExitConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const GROUND_KEY = 'exit-ground'
const TILES_KEY = 'exit-tiles'
const MASK_KEY = 'exit-mask'
const TINT_KEY = 'exit-tint'
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
/** 门发车、入口到站时亮的那一下多久，毫秒 */
const BURST_MS = 520
/** 力场受击的涟漪多久、多大（格） */
const RIPPLE_MS = 420
const RIPPLE_U = 0.7
/** 门与入口给身边的身体打的补光：多远（格）以内，最浓多少 */
const PAD_LIGHT_U = 2.6
const PAD_FILL = 0.45
/** 标本罐的玻璃多高，格 */
const JAR_TALL_U = 1.7
/** 到了一间舱室，门牌与「第几次」放大亮一下多久，毫秒 */
const ARRIVE_MS = 1600
/** 字的清晰度：按这个倍数画进贴图 */
const TEXT_RES = 2
/** 字底下垫的深色牌子：白地砖上也看得清 */
const PLATE = 0x0b1c2a
/** 舱室暗下去时盖上的那一层：盖住舱室里的一切；全黑的舱室在它上面隐约透出一格格瓷砖，队伍飞过虚空的光块在最上面 */
const DARK_DEPTH = 65
const DARK = 0x01040b
/** 全黑的舱室里只看得见的瓷砖：块面、块与块之间的缝（缝宽，格） */
const GHOST_FACE = 0x0c1418
const GHOST_SEAM = 0x020609
const GHOST_SEAM_U = 0.07

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

/** 门牌号写成两位 */
function codeOf(room: Chamber): string {
  return String(room.code).padStart(2, '0')
}

/** 一间舱室的待机律动里，(x, y)（格）这块瓷砖排在哪：脉冲按离中心多远，光波按从入口往对面扫到哪 */
function phaseOf(room: Chamber, pattern: number, x: number, y: number): number {
  if (pattern === 0) return clamp01(Math.hypot(x - room.center.x, y - room.center.y) / 10)
  if (pattern === 1) {
    const dx = room.center.x - room.entry.x
    const dy = room.center.y - room.entry.y
    const len = Math.hypot(dx, dy) || 1
    return clamp01(((x - room.entry.x) * dx + (y - room.entry.y) * dy) / (len * len * 2))
  }
  return noise(Math.floor(x * 7), Math.floor(y * 13))
}

/**
 * 掩码与着色图：R 是这块瓷砖的律动（加一再乘 50，0 是不会亮的地方），G 是舱室（加一），B 是它在律动里的相位；着色图是那一季的主色
 */
function maskImages(plan: ExitPlan): { mask: Uint8ClampedArray<ArrayBuffer>; tint: Uint8ClampedArray<ArrayBuffer> } {
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
    const sign = SEASONS[room.season]!
    const x = (k % FRAME_U) + 0.5
    const y = Math.floor(k / FRAME_U) + 0.5
    mask[o] = (sign.pattern + 1) * 50
    mask[o + 1] = room.index + 1
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

/** 一间舱室地上的大门牌 */
interface RoomText {
  readonly code: Phaser.GameObjects.Text
}

/** (x, y) 在平铺的画面上离 from 最近的那一份 */
function nearestImage(from: Point, x: number, y: number): Point {
  const w = FRAME_U * UNIT
  return { x: x - w * Math.round((x - from.x) / w), y: y - w * Math.round((y - from.y) / w) }
}

/** 收回方框里的那一份：方框外画的东西会被平铺的副本盖住，画在方框里才四周都看得见 */
function wrapPx(v: number): number {
  const w = FRAME_U * UNIT
  return v - w * Math.floor(v / w)
}

/** 从 a 到 b 的一段越出了方框的哪几边：要整段平移回来再画一遍的那几份 */
function shifts(a: Point, b: Point): Point[] {
  const w = FRAME_U * UNIT
  const one = (lo: number, hi: number): number[] => [0, ...(hi > w ? [-w] : []), ...(lo < 0 ? [w] : [])]
  return one(Math.min(a.x, b.x), Math.max(a.x, b.x)).flatMap((x) => one(Math.min(a.y, b.y), Math.max(a.y, b.y)).map((y) => ({ x, y })))
}

/**
 * 迷宫：底下是望得见底的虚空，网格上流着数据光流，一道扫描线隔一阵从上往下扫过；镜头跟着队长走，整块方框在画面上往四周平铺，往哪边看都是舱室。
 * 舱室的地面、台沿与平台的影子是开局在后台线程画好的贴图；地砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，闲着时按那一季的律动透出主色。
 * 门牌、门上写的去处、「出口」的绿牌与「第几次」是字；门、入口、光桥、监控、标本罐的玻璃、出怪板上凝成形的敌人、被送过虚空的身体散成的光块都每帧现画。
 * 队伍那间与刚走过的几间按各自的亮度亮着，别的舱室暗下去，舱室里的一切都盖在暗里；只有飞过虚空的光块不被盖住
 */
export class ExitView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: ExitPlan
  private cfg?: ExitConfig
  private painter?: ExitPainter
  private state?: ExitState
  private tiles?: DataTex
  private floorFx?: Phaser.GameObjects.Graphics
  private glowFx?: Phaser.GameObjects.Graphics
  private airFx?: Phaser.GameObjects.Graphics
  private shadeFx?: Phaser.GameObjects.Graphics
  private flyFx?: Phaser.GameObjects.Graphics
  /** 每间舱室全黑时透出来的那一格格瓷砖：开局画好，按那间暗到几成显出来 */
  private ghosts: Phaser.GameObjects.Graphics[] = []
  /** 每间舱室此刻亮到几成：朝它该有的亮度慢慢亮起来、暗下去 */
  private power: number[] = []
  private texts: RoomText[] = []
  private readonly u: Uniforms = { time: 0, px: 0.05, charge: [0, 0, 0, 0], chargeRoom: -1 }
  private jumpsSeen = 0
  private shuttleSeen: number[] = []
  private charging = false

  private planOf(v: ViewCtx): ExitPlan {
    if (!this.plan) this.plan = exitPlanFor(v.def.exit!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    const c = p.rooms[p.start]!.center
    return { w: FRAME.w, h: FRAME.h, origin: { x: c.x * UNIT, y: c.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, VOID_DEEP).setDepth(-2)))
    const u = this.u
    const seed = (v.run.decorSeed % 997) + 0.5
    const rect = [0, 0, FRAME_U, FRAME_U]
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'ExitVoid',
            fragmentSource: VOID_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uRect', rect)
              set('uTime', u.time)
              set('uSeed', seed)
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

  /** 镜头跟着队长走，方框在画面上往四周平铺：往哪边看都有舱室，只是画，不是世界 */
  framing(): Framing {
    return { map: FRAME, edge: 'wrap', tile: true }
  }

  /** 每间舱室一角的标本罐里装着那一季的一件东西 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    for (const room of this.planOf(v).rooms) {
      const j = room.jar
      const size = (j.x1 - j.x0) * 0.62 * UNIT
      v.decor.push(decorSprite(atlas, room.token, ((j.x0 + j.x1) / 2) * UNIT, ((j.y0 + j.y1) / 2 - 0.55) * UNIT, size, 0, 0.92))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.exit!
    this.cfg = cfg
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new ExitPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    this.shadeFx = scene.add.graphics().setDepth(DARK_DEPTH)
    this.flyFx = scene.add.graphics().setDepth(DARK_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.floorFx, this.glowFx, this.airFx, this.shadeFx, this.flyFx)
    this.ghosts = plan.rooms.map((r) => this.ghost(v, r))
    this.labels(v, plan, cfg)
    const st = sim.worldState.exit
    this.power = plan.rooms.map((r) => (st ? this.lit(st, cfg, r.index) : r.index === plan.start ? 1 : 0))
    this.jumpsSeen = st?.jumps ?? 0
    this.shuttleSeen = st ? st.doors.map((p) => p.shuttledAt) : []
    v.lens.screen.vignette(0.9, 0.12, 0x020610)
  }

  /** 会亮的地砖：数据图（谁踩过）、掩码与着色图，着色器盖在地面贴图上 */
  private floor(v: ViewCtx, plan: ExitPlan): void {
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
            name: 'ExitTiles',
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

  /** 一段字：px 是字高（世界像素） */
  private text(v: ViewCtx, x: number, y: number, s: string, px: number, color: number, depth: number, bg?: number): Phaser.GameObjects.Text {
    const t = v.scene.add
      .text(x, y, s, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(px)}px`,
        fontStyle: 'bold',
        color: hex(color),
        backgroundColor: bg === undefined ? undefined : hex(bg),
        padding: bg === undefined ? undefined : { x: px * 0.3, y: px * 0.08 },
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RES)
      .setDepth(depth)
    this.visuals.push(t)
    return t
  }

  /**
   * 字：每间舱室地上一个大大的门牌号（开局那间下面多一行「起点」）；
   * 每扇门朝屋里那一侧写着它通往哪间（那一季的颜色），标着出口的那扇再挂一块绿底的「出口」牌
   */
  private labels(v: ViewCtx, plan: ExitPlan, cfg: ExitConfig): void {
    const R = cfg.pad.radiusU
    this.texts = plan.rooms.map((room) => {
      const color = SEASONS[room.season]!.color
      const code = this.text(v, room.center.x * UNIT, room.center.y * UNIT, codeOf(room), 2.6 * UNIT, lift(color, 0.3), -0.7).setAlpha(0.2)
      if (room.index === plan.start) this.text(v, room.center.x * UNIT, (room.center.y + 1.9) * UNIT, '起点', 0.8 * UNIT, lift(color, 0.3), -0.7).setAlpha(0.3)
      for (const d of room.doors) {
        const to = plan.rooms[d.to]!
        const lx = (d.x + d.nx * (R + 0.55)) * UNIT
        const ly = (d.y + d.ny * (R + 0.55)) * UNIT
        if (d.exit) {
          this.text(v, lx, ly, `出口 ${codeOf(to)}`, 0.5 * UNIT, 0xffffff, -0.7, shade(EXIT_GREEN, 0.75))
        } else {
          this.text(v, lx, ly, codeOf(to), 0.5 * UNIT, lift(SEASONS[to.season]!.color, 0.2), -0.7, PLATE)
        }
      }
      return { code }
    })
  }

  /** 一间舱室全黑时透出来的样子：能走的那一块铺满一格格瓷砖，别的什么都没有 */
  private ghost(v: ViewCtx, room: Chamber): Phaser.GameObjects.Graphics {
    const g = v.scene.add.graphics().setDepth(DARK_DEPTH + 0.5).setAlpha(0)
    const f = room.floor
    const h = GHOST_SEAM_U / 2
    g.fillStyle(GHOST_SEAM, 1)
    g.fillRect(f.x0 * UNIT, f.y0 * UNIT, (f.x1 - f.x0) * UNIT, (f.y1 - f.y0) * UNIT)
    g.fillStyle(GHOST_FACE, 1)
    for (let y = f.y0; y < f.y1; y++) for (let x = f.x0; x < f.x1; x++) g.fillRect((x + h) * UNIT, (y + h) * UNIT, (1 - 2 * h) * UNIT, (1 - 2 * h) * UNIT)
    this.visuals.push(g)
    return g
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const st = sim.worldState.exit
    const cfg = this.cfg
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.glowFx || !this.airFx || !this.shadeFx || !this.flyFx) return
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
    this.flyFx.clear()
    this.shade(st, cfg, delta)
    this.chargeRing(st, cfg)
    this.sounds(v, st)
    this.arrival(st, now)
    this.bridges(st, cfg, now, t)
    for (const d of st.plan.doors) this.door(sim, st, cfg, d, now, t)
    for (const room of st.plan.rooms) this.entry(st, cfg, room, now, t)
    this.racks(st, cfg, t)
    this.jars(st, t)
    this.cameras(sim, st, t)
    this.forming(sim, st, cfg, now)
    for (const f of st.flights) this.voxels(f, cfg, now)
    this.ripples(st, now)
  }

  /** 第 i 间舱室该亮到几成：亮着的按它在亮着的几间里排第几，别的全黑 */
  private lit(st: ExitState, cfg: ExitConfig, i: number): number {
    const k = st.trail.indexOf(i)
    return k < 0 ? 0 : cfg.light.levels[k]!
  }

  /**
   * 每间舱室朝它该有的亮度亮起来或暗下去，没全亮的盖上一层暗，盖住整块分到的格：全黑时舱室里的一切都看不见；
   * 比亮着的几间里最暗的那一档还暗时，透出一格格瓷砖，越暗越清楚
   */
  private shade(st: ExitState, cfg: ExitConfig, delta: number): void {
    const g = this.shadeFx!
    g.clear()
    const dim = cfg.light.levels[cfg.light.levels.length - 1]!
    st.plan.rooms.forEach((room, i) => {
      const want = this.lit(st, cfg, i)
      const p = this.power[i]!
      const next = want > p ? Math.min(want, p + delta / cfg.light.wakeMs) : Math.max(want, p - delta / cfg.light.dimMs)
      this.power[i] = next
      this.ghosts[i]!.setAlpha(clamp01(1 - next / dim))
      if (next >= 1) return
      const c = room.cell
      g.fillStyle(DARK, 1 - next)
      g.fillRect(c.x0 * UNIT, c.y0 * UNIT, (c.x1 - c.x0) * UNIT, (c.y1 - c.y0) * UNIT)
    })
  }

  /** 刚到的那一间，地上的门牌放大亮一下 */
  private arrival(st: ExitState, now: number): void {
    this.texts.forEach((tx, i) => {
      const k = i === st.teamRoom ? clamp01(1 - (now - st.arrivedAt) / ARRIVE_MS) : 0
      const pop = k > 0 && now >= st.arrivedAt ? ease(k) : 0
      tx.code.setAlpha(0.2 + 0.5 * pop).setScale(1 + 0.25 * pop)
    })
  }

  /** 着色器里那圈扩满整间舱室的充能光：半径随充能从门边扩到舱室最远的角 */
  private chargeRing(st: ExitState, cfg: ExitConfig): void {
    let best: Door | null = null
    let k = 0
    for (const d of st.plan.doors) {
      const c = st.doors[d.index]!.charge / cfg.pad.chargeMs
      if (d.room === st.teamRoom && c > k) {
        k = c
        best = d
      }
    }
    if (!best) {
      this.u.charge = [0, 0, 0, 0]
      this.u.chargeRoom = -1
      return
    }
    const f = st.plan.rooms[best.room]!.floor
    const reach = Math.max(...[f.x0, f.x1].flatMap((x) => [f.y0, f.y1].map((y) => Math.hypot(x - best.x, y - best.y))))
    const r = cfg.pad.radiusU + (reach + 1 - cfg.pad.radiusU) * ease(k)
    this.u.charge = [best.x, best.y, r, 0.4 + 0.6 * k]
    this.u.chargeRoom = best.room + 1
  }

  /** 开始充能、整队出发、送来一批敌人：在镜头里才响 */
  private sounds(v: ViewCtx, st: ExitState): void {
    const charging = this.u.charge[3] > 0
    const k = st.plan.doors.reduce((m, d) => (d.room === st.teamRoom ? Math.max(m, st.doors[d.index]!.charge) : m), 0)
    if (charging && !this.charging && k < 200) playSfx('charge')
    this.charging = charging
    if (st.jumps !== this.jumpsSeen) {
      this.jumpsSeen = st.jumps
      playSfx('jump')
    }
    st.plan.doors.forEach((d, i) => {
      const p = st.doors[i]!
      if (p.shuttledAt === this.shuttleSeen[i]) return
      this.shuttleSeen[i] = p.shuttledAt
      const to = st.plan.rooms[d.to]!
      if (p.shuttled > 0 && v.lens.screen.sees(to.entry.x * UNIT, to.entry.y * UNIT, 2 * UNIT)) playSfx('warp')
    })
  }

  /**
   * 光桥：队伍所在那间的每扇门，到它通往的那间入口（画面上平铺的最近那一份）之间一道淡淡的虚线，一节节往那边流；
   * 队长在哪扇门上充能，那道桥就越来越亮；整队出发、一趟车送人过去的那一阵整条桥亮起来，队伍是信号蓝、敌人是信号红
   */
  private bridges(st: ExitState, cfg: ExitConfig, now: number, t: number): void {
    const g = this.glowFx!
    const R = cfg.pad.radiusU * UNIT
    const live = cfg.pad.transitMs + 250
    for (const d of st.plan.doors) {
      const p = st.doors[d.index]!
      const to = st.plan.rooms[d.to]!
      const sinceJump = now - p.jumpedAt
      const sinceShuttle = now - p.shuttledAt
      const teamHot = sinceJump >= 0 && sinceJump < live ? 1 - sinceJump / live : 0
      const foeHot = p.shuttled > 0 && d.to === st.teamRoom && sinceShuttle >= 0 && sinceShuttle < live ? 1 - sinceShuttle / live : 0
      const mine = d.room === st.teamRoom
      if (!mine && teamHot <= 0 && foeHot <= 0) continue
      const door = { x: d.x * UNIT, y: d.y * UNIT }
      const entry = { x: to.entry.x * UNIT, y: to.entry.y * UNIT }
      // 从门这头看就画到入口最近的那一份；只是敌人送进队伍这间，就从入口这头看画到门最近的那一份
      const toward = mine || teamHot > 0
      const src = toward ? door : nearestImage(entry, door.x, door.y)
      const end = toward ? nearestImage(door, entry.x, entry.y) : entry
      const len = Math.hypot(end.x - src.x, end.y - src.y) || 1
      const ux = (end.x - src.x) / len
      const uy = (end.y - src.y) / len
      const a0 = { x: src.x + ux * R, y: src.y + uy * R }
      const b0 = { x: end.x - ux * R, y: end.y - uy * R }
      const span = Math.hypot(b0.x - a0.x, b0.y - a0.y)
      const color = d.exit ? EXIT_GREEN : SEASONS[to.season]!.color
      const charge = p.charge / cfg.pad.chargeMs
      // 越出方框的那一截从方框另一边接着画
      for (const o of shifts(a0, b0)) {
        const a = { x: a0.x + o.x, y: a0.y + o.y }
        const b = { x: b0.x + o.x, y: b0.y + o.y }
        if (mine) {
          const step = 0.9 * UNIT
          const speed = (0.7 + 3.5 * charge) * UNIT
          for (let s = ((t * speed) % step) - step; s < span; s += step) {
            if (s < 0) continue
            const fade = Math.sqrt(Math.sin((Math.PI * s) / span))
            g.lineStyle(0.07 * UNIT, color, (0.16 + 0.7 * charge) * fade)
            g.lineBetween(a.x + ux * s, a.y + uy * s, a.x + ux * (s + 0.35 * UNIT), a.y + uy * (s + 0.35 * UNIT))
          }
        }
        for (const [hot, glow] of [
          [teamHot, TEAM_GLOW],
          [foeHot, FOE_GLOW],
        ] as const) {
          if (hot <= 0) continue
          for (const [w, al] of [
            [1.2, 0.1],
            [0.6, 0.22],
            [0.25, 0.5],
          ] as const) {
            g.lineStyle(w * UNIT * (0.6 + 0.4 * hot), glow, al * hot)
            g.lineBetween(a.x, a.y, b.x, b.y)
          }
          g.lineStyle(0.05 * UNIT, 0xffffff, hot)
          g.lineBetween(a.x, a.y, b.x, b.y)
        }
      }
    }
  }

  /**
   * 一扇门：外圈是它通往那一季的颜色（出口是应急绿），台面上三道人字纹朝它要飞去的方向滑出去；
   * 队长站上来充能，台面一层层亮成信号蓝、往里收的圈越收越快，队伍里每个人头上一道光柱；有敌人站着时发车前亮起往里收的红圈；出发时亮一下
   */
  private door(sim: Sim, st: ExitState, cfg: ExitConfig, d: Door, now: number, t: number): void {
    const to = st.plan.rooms[d.to]!
    const color = d.exit ? EXIT_GREEN : SEASONS[to.season]!.color
    const p = st.doors[d.index]!
    const R = cfg.pad.radiusU * UNIT
    const x = d.x * UNIT
    const y = d.y * UNIT
    const f = this.floorFx!
    const g = this.glowFx!
    const charge = p.charge / cfg.pad.chargeMs
    f.lineStyle(0.1 * UNIT, shade(color, 0.5), 1)
    f.strokeCircle(x, y, R * 0.93)
    g.lineStyle(0.06 * UNIT, color, 0.85 + 0.15 * Math.sin(t * 3 + d.index))
    g.strokeCircle(x, y, R * 0.93)
    const ux = d.fx
    const uy = d.fy
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
    if (charge > 0) {
      g.fillStyle(TEAM_GLOW, 0.18 + 0.4 * charge)
      g.fillCircle(x, y, R * 0.86)
      for (let k = 0; k < 3; k++) {
        const s = 1 - ((t * (1 + 3 * charge) + k / 3) % 1)
        g.lineStyle(0.07 * UNIT, lift(TEAM_GLOW, 0.4), 0.8 * charge * (1 - s * 0.5))
        g.strokeCircle(x, y, R * (0.15 + 0.75 * s))
      }
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
    const warn = p.shuttleAt - now
    if (warn > 0 && warn < cfg.pad.warnMs && this.crowd(sim, cfg, d)) {
      const k = 1 - warn / cfg.pad.warnMs
      for (let j = 0; j < 2; j++) {
        const s = 1 - ((k * 2 + j / 2) % 1)
        g.lineStyle(0.06 * UNIT, FOE_GLOW, 0.7 * k)
        g.strokeCircle(x, y, R * (0.2 + 0.7 * s))
      }
    }
    this.burst(p.jumpedAt, TEAM_GLOW, 1, x, y, R, now, true)
    this.burst(p.shuttledAt, FOE_GLOW, p.shuttled > 0 ? 1 : 0, x, y, R, now, true)
  }

  /** 出发时一根往上冲的光柱、到站时一根往下落的，加上台面亮一下 */
  private burst(at: number, c: number, strength: number, x: number, y: number, R: number, now: number, rising: boolean): void {
    const d = now - at
    if (d < 0 || d > BURST_MS || strength <= 0) return
    const k = d / BURST_MS
    const g = this.glowFx!
    g.fillStyle(c, 0.5 * (1 - k) * strength)
    g.fillCircle(x, y, R * (0.7 + 0.5 * k))
    g.lineStyle(0.08 * UNIT, lift(c, 0.5), (1 - k) * strength)
    g.strokeCircle(x, y, R * (0.9 + 1.4 * k))
    const h = 3.2 * UNIT * (rising ? 0.4 + 0.6 * ease(k) : 1 - 0.6 * ease(k))
    for (const [w, al] of [
      [1, 0.16],
      [0.6, 0.3],
      [0.22, 0.7],
    ] as const) {
      this.airFx!.fillStyle(w < 0.3 ? 0xffffff : c, al * (1 - k) * strength)
      this.airFx!.fillRect(x - R * w, y - h, R * w * 2, h)
    }
  }

  /** 入口：只进不出，青色的外圈，台面上三圈往台心收的圈；有身体送到的那一刻亮一下 */
  private entry(st: ExitState, cfg: ExitConfig, room: Chamber, now: number, t: number): void {
    const R = cfg.pad.radiusU * UNIT
    const x = room.entry.x * UNIT
    const y = room.entry.y * UNIT
    const f = this.floorFx!
    const g = this.glowFx!
    f.lineStyle(0.1 * UNIT, shade(CYAN_GLOW, 0.4), 1)
    f.strokeCircle(x, y, R * 0.93)
    g.lineStyle(0.05 * UNIT, CYAN_GLOW, 0.55)
    g.strokeCircle(x, y, R * 0.93)
    for (let k = 0; k < 3; k++) {
      const s = 1 - ((t * 0.35 + k / 3) % 1)
      g.lineStyle(0.05 * UNIT, CYAN_GLOW, 0.4 * Math.sin(Math.PI * s))
      g.strokeCircle(x, y, R * (0.15 + 0.7 * s))
    }
    for (const d of st.plan.doors) {
      if (d.to !== room.index) continue
      const p = st.doors[d.index]!
      this.burst(p.jumpedAt + cfg.pad.transitMs, TEAM_GLOW, 1, x, y, R, now, false)
      this.burst(p.shuttledAt + cfg.pad.transitMs, FOE_GLOW, p.shuttled > 0 ? 1 : 0, x, y, R, now, false)
    }
  }

  /** 此刻有没有敌人站在这扇门上 */
  private crowd(sim: Sim, cfg: ExitConfig, d: Door): boolean {
    const r = cfg.pad.radiusU * UNIT
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] && Math.hypot(Transform.x[e]! - d.x * UNIT, Transform.y[e]! - d.y * UNIT) <= r) return true
    return false
  }

  /** 机柜：墩子上立着一排半透明的机柜，朝屏幕下方的那一面上一排排指示灯随机明灭，顶面一圈亮边 */
  private racks(st: ExitState, cfg: ExitConfig, t: number): void {
    const g = this.airFx!
    const h = cfg.racks.heightM * LIFT_PER_M
    for (const room of st.plan.rooms) {
      const color = SEASONS[room.season]!.color
      room.racks.forEach((b, k) => {
        const x0 = b.x0 * UNIT + 0.08 * UNIT
        const x1 = b.x1 * UNIT - 0.08 * UNIT
        const y0 = b.y0 * UNIT + 0.08 * UNIT
        const y1 = b.y1 * UNIT - 0.08 * UNIT
        const w = x1 - x0
        g.fillStyle(0x4a7a94, 0.14)
        g.fillRect(x0, y1 - h, w, h)
        g.fillStyle(0x6a9ab4, 0.12)
        g.fillRect(x0, y0 - h, w, y1 - y0)
        g.lineStyle(0.04 * UNIT, lift(color, 0.5), 0.35)
        g.strokeRect(x0, y0 - h, w, y1 - y0)
        const units = Math.max(1, Math.round(w / UNIT / 0.5))
        for (let j = 0; j < 4; j++) {
          for (let i = 0; i < units; i++) {
            const on = noise(k * 131 + j * 17 + i, Math.floor(t * (1.5 + noise(k + i, j) * 3)))
            if (on < 0.5) continue
            g.fillStyle(on > 0.88 ? color : 0x46ffb0, 0.65)
            g.fillRect(x0 + (i + 0.35) * (w / units), y1 - h * (0.2 + j * 0.2), (w / units) * 0.25, 0.05 * UNIT)
          }
        }
      })
    }
  }

  /** 标本罐：罐座上一节玻璃筒，泡着那一季颜色的液体，一串气泡慢慢往上冒，筒顶一圈金属盖 */
  private jars(st: ExitState, t: number): void {
    const g = this.airFx!
    for (const room of st.plan.rooms) {
      const color = SEASONS[room.season]!.color
      const j = room.jar
      const w = (j.x1 - j.x0) * UNIT * 0.78
      const cx = ((j.x0 + j.x1) / 2) * UNIT
      const base = ((j.y0 + j.y1) / 2) * UNIT + w * 0.15
      const h = JAR_TALL_U * UNIT
      g.fillStyle(color, 0.1)
      g.fillRect(cx - w / 2, base - h, w, h)
      g.fillStyle(0xffffff, 0.14)
      g.fillRect(cx - w * 0.36, base - h, w * 0.1, h)
      g.fillStyle(0xffffff, 0.06)
      g.fillRect(cx + w * 0.2, base - h, w * 0.06, h)
      for (let k = 0; k < 4; k++) {
        const s = (t * 0.3 + k / 4 + room.index * 0.13) % 1
        const bx = cx + (noise(room.index * 5 + k, 3) - 0.5) * w * 0.6
        g.fillStyle(lift(color, 0.6), 0.35 * Math.sin(Math.PI * s))
        g.fillCircle(bx, base - h * s, 0.05 * UNIT)
      }
      g.fillStyle(0xbfeaff, 0.35)
      g.fillRect(cx - w / 2 - 0.04 * UNIT, base - h - 0.08 * UNIT, w + 0.08 * UNIT, 0.12 * UNIT)
    }
  }

  /**
   * 监控：每间舱室台沿的两个角上各装一台。队伍所在那间的监控转过来盯着队长，红灯常亮，地上一片淡淡的视野扫着队长；
   * 别的舱室里的慢慢左右摆，红灯一闪一闪
   */
  private cameras(sim: Sim, st: ExitState, t: number): void {
    const g = this.airFx!
    const f = this.glowFx!
    const lx = Transform.x[sim.leader]!
    const ly = Transform.y[sim.leader]!
    for (const room of st.plan.rooms) {
      const watching = room.index === st.teamRoom
      room.cams.forEach((c, k) => {
        const x = c.x * UNIT
        const y = c.y * UNIT
        const home = Math.atan2(room.center.y - c.y, room.center.x - c.x)
        const ang = watching ? Math.atan2(ly - y, lx - x) : home + 0.6 * Math.sin(t * 0.5 + room.index * 1.7 + k * 2.1)
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        const pole = 0.9 * UNIT
        if (watching) {
          const d = Math.hypot(lx - x, ly - y)
          const spread = 0.9 * UNIT + d * 0.12
          f.fillStyle(0xff5a6a, 0.05)
          f.fillTriangle(x, y, lx - sa * spread, ly + ca * spread, lx + sa * spread, ly - ca * spread)
        }
        g.fillStyle(0x0a1e2c, 0.9)
        g.fillRect(x - 0.05 * UNIT, y - pole, 0.1 * UNIT, pole)
        const L = 0.42 * UNIT
        const W = 0.14 * UNIT
        const bx = x
        const by = y - pole
        g.fillStyle(0x6a8ea4, 0.85)
        g.fillTriangle(bx - sa * W, by + ca * W * 0.5, bx + sa * W, by - ca * W * 0.5, bx + ca * L + sa * W * 0.7, by + sa * L * 0.5 - ca * W * 0.35)
        g.fillTriangle(bx - sa * W, by + ca * W * 0.5, bx + ca * L - sa * W * 0.7, by + sa * L * 0.5 + ca * W * 0.35, bx + ca * L + sa * W * 0.7, by + sa * L * 0.5 - ca * W * 0.35)
        const on = watching ? 1 : Math.sin(t * 4 + k * 3 + room.index) > 0.6 ? 1 : 0.15
        g.fillStyle(0xff2e48, 0.9 * on)
        g.fillCircle(bx + ca * L, by + sa * L * 0.5, 0.06 * UNIT)
        g.fillStyle(0xff2e48, 0.25 * on)
        g.fillCircle(bx + ca * L, by + sa * L * 0.5, 0.16 * UNIT)
      })
    }
  }

  /**
   * 出怪板上凝成形的敌人：预兆打下去的那一刻起，四面八方的红色光块往落点收拢、越聚越密，脚下的出怪板跟着亮起来；
   * 到点就是一只敌人
   */
  private forming(sim: Sim, st: ExitState, cfg: ExitConfig, now: number): void {
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
      f.strokeRect(x - spread * 0.4 * (1 - k) - 0.3 * UNIT, y - spread * 0.4 * (1 - k) - 0.3 * UNIT, spread * 0.8 * (1 - k) + 0.6 * UNIT, spread * 0.8 * (1 - k) + 0.6 * UNIT)
    }
  }

  /**
   * 一个被送过虚空的身体：出发时散成一格格光块往上飘开，顺着身体走的那条最近的路飞向它要去的那间入口，越过方框的边就从另一边接着飞，在入口聚拢；
   * 队伍是信号蓝，画在暗下去的舱室上面；敌人是信号红，飞进全黑的舱室就看不见了；都夹着几块白
   */
  private voxels(h: Flight, cfg: ExitConfig, now: number): void {
    const ms = cfg.pad.transitMs
    const d = now - h.at
    if (d < 0 || d > ms + GATHER_MS) return
    const g = h.foe ? this.airFx! : this.flyFx!
    const color = h.foe ? FOE_GLOW : TEAM_GLOW
    const n = VOXELS + Math.round((h.r / UNIT) * VOXELS_PER_U)
    const seed = Math.floor(h.at) ^ Math.floor(h.fx * 7) ^ Math.floor(h.ty * 3)
    const to = nearestImage({ x: h.fx, y: h.fy }, h.tx, h.ty)
    const dx = to.x - h.fx
    const dy = to.y - h.fy
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
        const s = ease(d / SCATTER_MS)
        x = h.fx + Math.cos(ang) * off * s
        y = h.fy + Math.sin(ang) * off * s * 0.6 - (0.3 + 0.6 * c) * UNIT * s - 0.4 * UNIT
        al = 0.9
      } else if (d < ms) {
        const s = clamp01((d - SCATTER_MS * (1 - lag)) / (ms - SCATTER_MS * (1 - lag)))
        const e = ease(clamp01(s * (1 + lag) - lag * 0.5))
        const wob = Math.sin(e * Math.PI) * (b - 0.5) * 0.8 * UNIT
        x = h.fx + dx * e + Math.cos(ang) * off * (1 - e) + nx * wob
        y = h.fy + dy * e + Math.sin(ang) * off * 0.6 * (1 - e) + ny * wob - 0.4 * UNIT * (1 - e) - Math.sin(e * Math.PI) * 0.8 * UNIT
        al = 0.95
      } else {
        const s = clamp01((d - ms) / GATHER_MS)
        const r = off * 0.9 * (1 - ease(s))
        x = h.tx + Math.cos(ang + 1.3) * r
        y = h.ty + Math.sin(ang + 1.3) * r * 0.6 - 0.4 * UNIT * (1 - s)
        al = 1 - s
      }
      g.fillStyle(k % 4 === 0 ? 0xffffff : color, al)
      g.fillRect(wrapPx(x) - size / 2, wrapPx(y) - size / 2, size, size)
    }
  }

  /** 子弹打在力场上：那里泛起一圈六角形的涟漪 */
  private ripples(st: ExitState, now: number): void {
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

  /** 门给身边的身体打一层它通往那一季颜色的补光（充能时是信号蓝），入口打一层青光 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return
    const px = x / UNIT
    const py = y / UNIT
    const room = st.plan.rooms[st.plan.owner[Math.min(FRAME_U - 1, Math.max(0, Math.floor(py))) * FRAME_U + Math.min(FRAME_U - 1, Math.max(0, Math.floor(px)))]!]
    if (!room) return
    let best = PAD_LIGHT_U
    const pick = (cx: number, cy: number, color: number): void => {
      const d = Math.hypot(px - cx, py - cy)
      if (d >= best) return
      best = d
      const l = d || 1
      out.fx = (cx - px) / l
      out.fy = (cy - py) / l
      out.color = color
      out.fill = PAD_FILL * (1 - d / PAD_LIGHT_U)
    }
    pick(room.entry.x, room.entry.y, CYAN_GLOW)
    for (const d of room.doors) pick(d.x, d.y, st.doors[d.index]!.charge > 0 ? TEAM_GLOW : d.exit ? EXIT_GREEN : SEASONS[st.plan.rooms[d.to]!.season]!.color)
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.texts = []
    this.tiles = undefined
    this.floorFx = undefined
    this.glowFx = undefined
    this.airFx = undefined
    this.shadeFx = undefined
    this.flyFx = undefined
    this.ghosts = []
    this.power = []
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY, TINT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
