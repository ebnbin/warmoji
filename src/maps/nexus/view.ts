import Phaser from 'phaser'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { viewport } from '../../util/apply'
import { drawSpark } from '../textures'
import { FRAME } from '../frame'
import { textureSize } from './ground'
import { NexusPainter } from './painter'
import { CITY_FRAG, encodeTiles, TILES_FRAG } from './shader'
import { drawHolo } from './holo'
import { boxDist, hallRoom, warpEnd, warpMid } from './layout'
import { HOP_CAP, nexusPlanFor } from './world'
import type { NexusState } from './world'
import type { NexusPlan, WarpSpot } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { NexusConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing, Rect } from '../../ecs/lens'
import type { LocalLight, SpriteCut } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const BG = 0x030712
const GROUND_KEY = 'nexus-ground'
const TILES_KEY = 'nexus-tiles'
const MASK_KEY = 'nexus-mask'
const CITY_KEY = 'nexus-city'
const SPARK_KEY = 'nexus-spark'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 镜头在地板上方多高，格：玻璃外的城市按它算远近 */
const CAM_U = 26
/** 城市先画在一张小贴图上再铺满镜头：贴图的一个像素至少占屏幕上这么多个设备像素，高分屏按设备像素比，大约一个像素对一个屏幕点 */
const CITY_SCALE = 2
/** 每对传送门的颜色（橙、紫、绿）：在白地板上醒目，和队伍的蓝、敌人的红分得开；线头按对画成圆头、菱形头、方头，色弱也认得出 */
const PAIR_COLORS = [0xff6a00, 0x9b3bff, 0x00b85c] as const
/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
const TEAM_GLOW = 0x2f7dff
const FOE_GLOW = 0xff3349
/** 全息像的青色与错位时的品红重影 */
const HOLO = 0x3fe0ff
const HOLO_GHOST = 0xff4fd8
/** 刚踩上那一脚的方框扩到四边要多久，毫秒 */
const FLASH_MS = 280
/** 扫描线：每隔多久扫一遍、一遍扫多久，毫秒 */
const SCAN_EVERY_MS = 9000
const SCAN_MS = 2600
/** 全息像隔多久错位一下、一下多久，毫秒 */
const HOLO_GLITCH_EVERY_MS = 4200
const HOLO_GLITCH_MS = 170
/** 传送门给身边的身体打的补光：多远（格）以内，最浓多少 */
const WARP_LIGHT_U = 2.6
const WARP_FILL = 0.5
/** 门线：芯与深色描边多粗，外面一层层同色光晕多宽、多浓，线头的记号多大（半宽），格 */
const CORE_U = 0.21
const RIM_U = 0.27
const GLOW_U = [0.95, 0.62, 0.4] as const
const GLOW_ALPHA = [0.07, 0.13, 0.22] as const
const CAP_U = 0.2
/** 要挪走的门线断成这么多截，一截截时有时无 */
const LINE_PARTS = 10
/** 穿门时门那头冒出的错位横条：几条、留多久 */
const GLITCH_SLICES = 6
const GLITCH_MS = [120, 260] as const
/** 队长穿门：整屏闪一下青光、横着蹿过几道错位的条纹，多久、多亮、几条 */
const SIGNAL_MS = 220
const SIGNAL_ALPHA = 0.16
const SIGNAL_SLICES = 9
const SIGNAL_COLORS = [0xffffff, 0x37f6ff, 0xff3df0] as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255]
}

/** 颜色压暗到 k 倍 */
function shade(c: number, k: number): number {
  return (Math.round(((c >> 16) & 0xff) * k) << 16) | (Math.round(((c >> 8) & 0xff) * k) << 8) | Math.round((c & 0xff) * k)
}

/** 颜色往白里提 k */
function lift(c: number, k: number): number {
  const f = (v: number): number => Math.round(v + (255 - v) * k)
  return (f((c >> 16) & 0xff) << 16) | (f((c >> 8) & 0xff) << 8) | f(c & 0xff)
}

/** 整数打散成 [0, 1)：闪烁、错位这些画面上的随机 */
function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  return scene.textures.createCanvas(key, w, h)!
}

/** 把画布传上显卡：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture, filter: Phaser.Textures.FilterMode): void {
  tex.refresh()
  tex.setFilter(filter)
}

/** 一张每格一个像素的数据图：画布与它的像素 */
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

/** 穿门时冒出的一条错位横条，像素 */
interface Slice {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly color: number
  readonly until: number
}

/** 玻璃外的城市：着色器、它画进去的贴图，与把贴图铺回镜头范围的那张图 */
interface City {
  readonly shader: Phaser.GameObjects.Shader
  readonly image: Phaser.GameObjects.Image
  readonly w: number
  readonly h: number
}

/**
 * 瓷砖的掩码：只有整块都在瓷砖地面上、不挨着立柱、全息台、电梯井、也不是检修口的瓷砖才会亮
 */
function tileMask(cfg: NexusConfig, plan: NexusPlan): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(FRAME_U * FRAME_U * 4)
  const hatches = new Set(plan.hatches.map((h) => h.y * FRAME_U + h.x))
  for (let j = 0; j < FRAME_U; j++) {
    for (let i = 0; i < FRAME_U; i++) {
      const x = i + 0.5
      const y = j + 0.5
      const o = (j * FRAME_U + i) * 4
      out[o + 3] = 255
      if (hallRoom(plan.hall, x, y) < cfg.glassU + 0.5 || hatches.has(j * FRAME_U + i)) continue
      if (plan.pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + 0.75)) continue
      if (plan.pedestals.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + 0.75)) continue
      if (plan.cores.some((c) => boxDist(c.x0, c.y0, c.x1, c.y1, x, y) < 0.75)) continue
      out[o] = 255
    }
  }
  return out
}

/**
 * 天枢：地面是开局在后台线程画好的贴图——哑光的浅灰瓷砖、贴墙一圈半透的玻璃地面、亮的幕墙线，立柱、全息台、电梯井的顶与地上的影子；
 * 玻璃外与玻璃地面下透出夜里城市的灯海，着色器按镜头的位置分层画出远近。瓷砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，刚踩上的一脚扩出一圈方框；
 * 隔一阵一道扫描线扫过地面。传送门是地上一道不透明、发着光的粗线，那一对的颜色，线头是那一对的记号；
 * 要挪走的门闪烁、错位，要挪来的地方先出一条虚线，一个光点沿线把它画实。有东西穿门，门两头冒出错位的横条。
 * 全息台上悬着转动的全息像，隔一阵错一下位
 */
export class NexusView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: NexusPlan
  private cfg?: NexusConfig
  private painter?: NexusPainter
  private state?: NexusState
  private readonly u = { time: 0, camX: FRAME_U / 2, camY: FRAME_U / 2, rect: [0, 0, 1, 1], scan: [-100, 0, 0, 0] }
  private tiles?: DataTex
  private cityAt?: City
  private floorFx?: Phaser.GameObjects.Graphics
  private airFx?: Phaser.GameObjects.Graphics
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private slices: Slice[] = []
  private signal?: Phaser.GameObjects.Rectangle
  private signalUntil = 0
  private slideSeen: object | null = null
  private hopSeen = 0
  private moving: (WarpSpot | null)[] = []

  private planOf(v: ViewCtx): NexusPlan {
    if (!this.plan) this.plan = nexusPlanFor(v.def.nexus!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    this.signal = v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, 0x37f6ff).setDepth(86).setAlpha(0))
    this.visuals.push(this.signal)
    if (!v.scene.textures.exists(SPARK_KEY)) {
      const tex = canvasTexture(v.scene, SPARK_KEY, 32, 32)
      drawSpark(tex.getContext(), 32)
      upload(tex, Phaser.Textures.FilterMode.LINEAR)
    }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 瓷砖地上不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.nexus!
    this.cfg = cfg
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new NexusPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    this.city(v)
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.floor(v, cfg, plan)
    this.dynamics(v)
    const st = sim.worldState.nexus
    this.hopSeen = st?.hopCount ?? 0
    this.moving = st ? st.warps.map((w) => w.next) : []
    v.lens.screen.vignette(0.86, 0.14, 0x061028)
  }

  /**
   * 玻璃外的夜城：着色器只画镜头此刻拍到的那一块，画在一张按屏幕缩小的贴图上，再把贴图铺回镜头范围；
   * 镜头里全是瓷砖地面时不画。屏幕大小变了就按新的大小重建
   */
  private city(v: ViewCtx): void {
    const cfg = this.cfg!
    const plan = this.plan!
    const view = v.lens.screen.view()
    const zoom = v.lens.screen.zoom()
    const s = Math.max(CITY_SCALE, viewport.dpr)
    const w = Math.max(1, Math.ceil((view.w * zoom) / s))
    const h = Math.max(1, Math.ceil((view.h * zoom) / s))
    if (this.cityAt && this.cityAt.w === w && this.cityAt.h === h) return
    this.dropCity(v)
    const u = this.u
    const seed = (v.run.decorSeed % 997) + 0.5
    const hall = plan.hall
    const shader = v.scene.add
      .shader(
        {
          name: 'NexusCity',
          fragmentSource: CITY_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uRect', u.rect)
            set('uCam', [u.camX, u.camY, CAM_U])
            set('uTime', u.time)
            set('uSeed', seed)
            set('uHall', [hall.x0, hall.y0, hall.x1, hall.y1])
            set('uCut', [hall.cut, cfg.glassU + 0.1])
          },
        },
        0,
        0,
        w,
        h,
      )
      .setOrigin(0, 0)
      .setDepth(-1.6)
      .setRenderToTexture(CITY_KEY)
    v.scene.textures.get(CITY_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR)
    const image = v.scene.add.image(0, 0, CITY_KEY).setOrigin(0, 0).setDepth(-1.5)
    this.cityAt = { shader, image, w, h }
  }

  private dropCity(v: ViewCtx): void {
    const c = this.cityAt
    if (!c) return
    c.image.destroy()
    c.shader.destroy()
    if (v.scene.textures.exists(CITY_KEY)) v.scene.textures.remove(CITY_KEY)
    this.cityAt = undefined
  }

  /** 镜头拍到的范围全落在瓷砖地面上（地面是凸的，四个角都在就都在）：玻璃外与玻璃地面一点都看不到 */
  private allFloor(view: Rect): boolean {
    const plan = this.plan!
    const cut = this.cfg!.glassU + 0.2
    for (const [x, y] of [
      [view.x, view.y],
      [view.x + view.w, view.y],
      [view.x, view.y + view.h],
      [view.x + view.w, view.y + view.h],
    ] as const) {
      if (hallRoom(plan.hall, x / UNIT, y / UNIT) <= cut) return false
    }
    return true
  }

  /** 会亮的瓷砖：数据图（谁踩过）与掩码，着色器盖在地面贴图上 */
  private floor(v: ViewCtx, cfg: NexusConfig, plan: NexusPlan): void {
    const scene = v.scene
    this.tiles = dataTexture(scene, TILES_KEY)
    const mask = canvasTexture(scene, MASK_KEY, FRAME_U, FRAME_U)
    mask.getContext().putImageData(new ImageData(tileMask(cfg, plan), FRAME_U, FRAME_U), 0, 0)
    upload(mask, Phaser.Textures.FilterMode.NEAREST)
    push(this.tiles)
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'NexusTiles',
            fragmentSource: TILES_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uData', 0)
              set('uMask', 1)
              set('uTime', u.time)
              set('uScan', u.scan)
              set('uTeam', rgb(TEAM_GLOW))
              set('uFoe', rgb(FOE_GLOW))
            },
          },
          0,
          0,
          FRAME.w,
          FRAME.h,
          [TILES_KEY, MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.9),
    )
  }

  /** 会动的东西：门线、全息像、错位的横条与火花 */
  private dynamics(v: ViewCtx): void {
    const scene = v.scene
    this.floorFx = scene.add.graphics().setDepth(-0.8)
    this.airFx = scene.add.graphics().setDepth(9)
    this.sparks = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 220, max: 520 },
        speed: { min: 40, max: 200 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(9.5)
    this.visuals.push(this.floorFx, this.airFx, this.sparks)
  }

  /** (x, y)（像素）在不在镜头里，边上再放宽 pad 格：只用来决定响不响 */
  private seen(v: ViewCtx, x: number, y: number, pad: number): boolean {
    return v.lens.screen.sees(x, y, pad * UNIT)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.nexus
    const cfg = this.cfg
    if (!st || !cfg || !this.tiles || !this.floorFx || !this.airFx) return
    this.state = st
    const now = sim.elapsedMs
    const t = sim.fxMs / 1000
    const view = v.lens.screen.view()
    this.u.time = t
    this.u.camX = (view.x + view.w / 2) / UNIT
    this.u.camY = (view.y + view.h / 2) / UNIT
    this.u.rect = [view.x / UNIT, view.y / UNIT, view.w / UNIT, view.h / UNIT]
    this.city(v)
    const c = this.cityAt
    if (c) {
      const show = !this.allFloor(view)
      c.shader.setVisible(show)
      c.image.setVisible(show).setPosition(view.x, view.y).setDisplaySize(view.w, view.h)
    }
    const tl = st.tiles
    encodeTiles(this.tiles.img.data, tl.team, tl.foe, tl.teamFrom, tl.foeFrom, now, cfg.tiles.fadeMs, FLASH_MS)
    push(this.tiles)
    this.scan(st.plan, now)
    this.floorFx.clear()
    this.airFx.clear()
    this.events(v, st, cfg, sim.fxMs)
    st.warps.forEach((w, i) => {
      const p = w.next ? clamp01((now - w.since) / cfg.warps.warnMs) : -1
      this.gate(cfg, w.spot, i, p, t, now)
      if (w.next) this.preview(cfg, w.next, i, p, t)
    })
    this.holograms(st.plan, cfg, sim.fxMs, t)
    const slide = sim.camSlide
    if (slide && slide.msLeft === slide.ms && slide !== this.slideSeen) {
      this.slideSeen = slide
      this.interfere(v, sim.fxMs)
    }
    this.signal?.setAlpha(SIGNAL_ALPHA * clamp01((this.signalUntil - sim.fxMs) / SIGNAL_MS))
    this.glitches(sim.fxMs)
  }

  /** 队长穿门的那一下：整屏闪一下青光，镜头里横着蹿过几道错位的条纹，像信号被打断了一下 */
  private interfere(v: ViewCtx, fx: number): void {
    this.signalUntil = fx + SIGNAL_MS
    const view = v.lens.screen.view()
    for (let k = 0; k < SIGNAL_SLICES; k++) {
      const w = view.w * (0.15 + Math.random() * 0.5)
      this.slices.push({
        x: view.x + w / 2 + Math.random() * (view.w - w),
        y: view.y + Math.random() * view.h,
        w,
        h: (2 + Math.random() * 5) / v.lens.screen.zoom(),
        color: SIGNAL_COLORS[k % SIGNAL_COLORS.length]!,
        until: fx + GLITCH_MS[0] + Math.random() * (GLITCH_MS[1] - GLITCH_MS[0]),
      })
    }
  }

  /** 要挪走的门亮不亮：越到最后断得越频繁，0.15 到 1 */
  private flicker(now: number, i: number, p: number): number {
    return noise(Math.floor(now / 55), i * 31 + 7) > p * 0.85 ? 1 : 0.15
  }

  /** 扫描线：隔一阵横着或竖着扫过大厅，亮度两头弱中间强 */
  private scan(plan: NexusPlan, now: number): void {
    const cycle = Math.floor(now / SCAN_EVERY_MS)
    const k = now - cycle * SCAN_EVERY_MS
    const s = this.u.scan
    if (k >= SCAN_MS) {
      s[2] = 0
      return
    }
    const f = k / SCAN_MS
    const axis = cycle % 2
    const back = Math.floor(cycle / 2) % 2 === 1
    const lo = axis === 0 ? plan.hall.y0 : plan.hall.x0
    const hi = axis === 0 ? plan.hall.y1 : plan.hall.x1
    s[0] = lo + (hi - lo) * (back ? 1 - f : f)
    s[1] = axis
    s[2] = Math.sqrt(Math.sin(Math.PI * f))
  }

  /** 穿门、门开始挪、门换过去：响一声，门两头冒错位的横条与火花；fx 是画面的时钟，毫秒 */
  private events(v: ViewCtx, st: NexusState, cfg: NexusConfig, fx: number): void {
    const len = cfg.warps.lenU
    let heard = false
    for (let k = Math.max(this.hopSeen, st.hopCount - HOP_CAP); k < st.hopCount; k++) {
      const h = st.hops[k % HOP_CAP]!
      const color = PAIR_COLORS[h.warp >> 1]!
      for (const i of [h.warp, h.warp ^ 1]) this.burst(st.warps[i]!.spot, len, color, fx, h.who === 'thing' ? 2 : GLITCH_SLICES)
      if (h.who !== 'thing' && this.seen(v, h.x, h.y, 2)) heard = true
    }
    this.hopSeen = st.hopCount
    if (heard) playSfx('warp')
    st.warps.forEach((w, i) => {
      const was = this.moving[i] ?? null
      if (w.next && !was && this.seen(v, warpMid(w.spot, len).x * UNIT, warpMid(w.spot, len).y * UNIT, 3)) playSfx('glitch')
      if (!w.next && was) {
        const color = PAIR_COLORS[i >> 1]!
        this.burst(w.spot, len, color, fx, GLITCH_SLICES * 2)
        const m = warpMid(w.spot, len)
        this.sparks?.setParticleTint(color)
        this.sparks?.explode(18, m.x * UNIT, m.y * UNIT)
        if (this.seen(v, m.x * UNIT, m.y * UNIT, 3)) playSfx('print')
      }
      this.moving[i] = w.next
    })
  }

  /** 门线上冒出几条错位的横条与一把火花 */
  private burst(spot: WarpSpot, len: number, color: number, now: number, n: number): void {
    const m = warpMid(spot, len)
    for (let k = 0; k < n; k++) {
      const along = (Math.random() - 0.5) * len * UNIT * 0.9
      const across = (Math.random() - 0.5) * 0.7 * UNIT
      this.slices.push({
        x: m.x * UNIT + (spot.axis === 1 ? along : across),
        y: m.y * UNIT + (spot.axis === 0 ? along : across),
        w: (0.3 + Math.random() * 0.9) * UNIT,
        h: 2 + Math.random() * 3,
        color: Math.random() < 0.35 ? 0xffffff : color,
        until: now + GLITCH_MS[0] + Math.random() * (GLITCH_MS[1] - GLITCH_MS[0]),
      })
    }
    this.sparks?.setParticleTint(color)
    this.sparks?.explode(Math.min(8, n + 2), m.x * UNIT, m.y * UNIT)
  }

  /** 错位的横条：每帧左右乱跳，到时候就没了 */
  private glitches(fx: number): void {
    const g = this.airFx!
    this.slices = this.slices.filter((s) => s.until > fx)
    for (const s of this.slices) {
      const jx = (Math.random() - 0.5) * 10
      g.fillStyle(s.color, 0.85)
      g.fillRect(s.x - s.w / 2 + jx, s.y, s.w, s.h)
    }
  }

  /** 线段 a→b（像素）画成一道宽 w 像素的直线，两头补成圆的 */
  private stroke(g: Phaser.GameObjects.Graphics, a: Point, b: Point, w: number, color: number, alpha: number): void {
    g.lineStyle(w, color, alpha)
    g.lineBetween(a.x, a.y, b.x, b.y)
    g.fillStyle(color, alpha)
    g.fillCircle(a.x, a.y, w / 2)
    g.fillCircle(b.x, b.y, w / 2)
  }

  /** 门线一头的记号：第 pair 对画成圆头、菱形头或方头，r 是半宽（像素） */
  private cap(g: Phaser.GameObjects.Graphics, q: Point, pair: number, r: number, color: number, alpha: number): void {
    g.fillStyle(color, alpha)
    if (pair === 0) {
      g.fillCircle(q.x, q.y, r)
      return
    }
    if (pair === 1) {
      const d = r * 1.3
      g.fillTriangle(q.x - d, q.y, q.x, q.y - d, q.x + d, q.y)
      g.fillTriangle(q.x - d, q.y, q.x, q.y + d, q.x + d, q.y)
      return
    }
    g.fillRect(q.x - r, q.y - r, r * 2, r * 2)
  }

  /**
   * 一道门线：外面几层同色的光晕，深色描边，鲜艳的芯，芯上一道亮线，两头是这一对的记号；glow 是光晕浓多少，
   * capped 为 false 时 b 那头不画记号（还没画到）；broken 是线断开的那几截占多少（0 到 1），seed 变了断处就换
   */
  private line(g: Phaser.GameObjects.Graphics, a: Point, b: Point, pair: number, alpha: number, glow: number, capped: boolean, broken = 0, seed = 0): void {
    const color = PAIR_COLORS[pair]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1) return
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    GLOW_U.forEach((w, k) => this.stroke(g, a, b, w * UNIT, color, GLOW_ALPHA[k]! * glow * alpha))
    const rimPad = ((RIM_U - CORE_U) / 2) * UNIT
    const dark = shade(color, 0.45)
    this.cap(g, a, pair, CAP_U * UNIT + rimPad, dark, alpha)
    if (capped) this.cap(g, b, pair, CAP_U * UNIT + rimPad, dark, alpha)
    const parts = broken > 0 ? LINE_PARTS : 1
    const inset = CORE_U * UNIT * 0.3
    for (let k = 0; k < parts; k++) {
      if (broken > 0 && noise(seed, k) < broken) continue
      const p0 = { x: a.x + ux * ((len * k) / parts), y: a.y + uy * ((len * k) / parts) }
      const p1 = { x: a.x + ux * ((len * (k + 1)) / parts), y: a.y + uy * ((len * (k + 1)) / parts) }
      this.stroke(g, p0, p1, RIM_U * UNIT, dark, alpha)
      this.stroke(g, p0, p1, CORE_U * UNIT, color, alpha)
      const h0 = k === 0 ? inset : 0
      const h1 = k === parts - 1 ? inset : 0
      if (len / parts > h0 + h1) this.stroke(g, { x: p0.x + ux * h0, y: p0.y + uy * h0 }, { x: p1.x - ux * h1, y: p1.y - uy * h1 }, 0.06 * UNIT, lift(color, 0.6), 0.95 * alpha)
    }
    this.cap(g, a, pair, CAP_U * UNIT, color, alpha)
    if (capped) this.cap(g, b, pair, CAP_U * UNIT, color, alpha)
  }

  /**
   * 一扇立着的门：地上一道发光的粗线，光晕轻轻呼吸。closing 不为 −1 时这扇门正要挪走（0 到 1）：
   * 一闪一闪、断成一截一截、整条横着错位，旁边一青一品红两道重影，不时迸出火花，越到最后越厉害；t 是画面的时钟（秒），now 是对局的时钟（毫秒）
   */
  private gate(cfg: NexusConfig, spot: WarpSpot, i: number, closing: number, t: number, now: number): void {
    const len = cfg.warps.lenU
    const pair = i >> 1
    const on = closing < 0 ? 1 : this.flicker(now, i, closing)
    const jitter = closing < 0 ? 0 : (noise(Math.floor(now / 40), i * 17 + 3) - 0.5) * 12 * closing
    const e = warpEnd(spot, len)
    const jx = spot.axis === 0 ? jitter : 0
    const jy = spot.axis === 1 ? jitter : 0
    const a = { x: spot.x * UNIT + jx, y: spot.y * UNIT + jy }
    const b = { x: e.x * UNIT + jx, y: e.y * UNIT + jy }
    const f = this.floorFx!
    if (closing >= 0) {
      for (const [d, tint] of [
        [4 + 8 * closing, 0x37f6ff],
        [-4 - 8 * closing, 0xff3df0],
      ] as const) {
        const ox = spot.axis === 0 ? d : 0
        const oy = spot.axis === 1 ? d : 0
        this.stroke(f, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, CORE_U * UNIT * 0.8, tint, 0.25 + 0.5 * closing)
      }
    }
    const broken = closing < 0 ? 0 : 0.15 + 0.5 * closing
    this.line(f, a, b, pair, on, 0.85 + 0.15 * Math.sin(t * 4 + i), true, broken, Math.floor(now / 90) * 7 + i)
    if (closing < 0 || Math.random() >= 0.04 + 0.25 * closing) return
    const q = Math.random() < 0.5 ? a : b
    this.sparks?.setParticleTint(Math.random() < 0.5 ? PAIR_COLORS[pair]! : 0xffffff)
    this.sparks?.explode(2 + Math.floor(closing * 4), q.x, q.y)
  }

  /** 要挪来的地方：一条同色的虚线，一个光点从一头沿线走到另一头，走过的地方画实，走到头就换过去 */
  private preview(cfg: NexusConfig, spot: WarpSpot, i: number, p: number, t: number): void {
    const len = cfg.warps.lenU
    const pair = i >> 1
    const color = PAIR_COLORS[pair]!
    const e = warpEnd(spot, len)
    const a = { x: spot.x * UNIT, y: spot.y * UNIT }
    const b = { x: e.x * UNIT, y: e.y * UNIT }
    const f = this.floorFx!
    const total = len * UNIT
    const ux = (b.x - a.x) / total
    const uy = (b.y - a.y) / total
    const flick = 0.75 + 0.25 * noise(Math.floor(t * 30), i * 13 + 1)
    const dash = 0.18 * UNIT
    f.lineStyle(0.07 * UNIT, shade(color, 0.7), 0.9 * flick)
    for (let s = (t * 40) % (dash * 2) - dash * 2; s < total; s += dash * 2) {
      const s0 = Math.max(0, s)
      const s1 = Math.min(total, s + dash)
      if (s1 > s0) f.lineBetween(a.x + ux * s0, a.y + uy * s0, a.x + ux * s1, a.y + uy * s1)
    }
    const at = total * p
    const spotAt = { x: a.x + ux * at, y: a.y + uy * at }
    this.line(f, a, spotAt, pair, 1, 0.6, false)
    const air = this.airFx!
    air.fillStyle(color, 0.3 * flick)
    air.fillCircle(spotAt.x, spotAt.y, 0.36 * UNIT)
    air.fillStyle(lift(color, 0.5), 0.9)
    air.fillCircle(spotAt.x, spotAt.y, 0.16 * UNIT)
    air.fillStyle(0xffffff, 1)
    air.fillCircle(spotAt.x, spotAt.y, 0.07 * UNIT * (0.8 + 0.4 * flick))
    if (Math.random() < 0.2) {
      this.sparks?.setParticleTint(color)
      this.sparks?.explode(2, spotAt.x, spotAt.y)
    }
  }

  /** 全息台上的像：各台错开着转，隔一阵错一下位 */
  private holograms(plan: NexusPlan, cfg: NexusConfig, fxMs: number, t: number): void {
    const g = this.airFx!
    const top = cfg.pedestals.heightM * LIFT_PER_M
    plan.pedestals.forEach((q, k) => {
      const cycle = Math.floor((fxMs + k * 1300) / HOLO_GLITCH_EVERY_MS)
      const inGlitch = (fxMs + k * 1300) % HOLO_GLITCH_EVERY_MS < HOLO_GLITCH_MS && noise(cycle, k) < 0.6
      const glitch = inGlitch ? 0.4 + 0.6 * noise(Math.floor(fxMs / 30), k + 5) : 0
      const flicker = 0.75 + 0.25 * noise(Math.floor(fxMs / 70), k + 9)
      drawHolo(g, q.holo, q.x * UNIT, q.y * UNIT, top, top + 0.35 * UNIT, q.r * UNIT * 1.05, t + q.phase, HOLO, HOLO_GHOST, glitch, flicker)
    })
  }

  /** 传送门给身边的身体打一层那一对颜色的补光，从门线那边照过来 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return
    const len = cfg.warps.lenU
    let best = WARP_LIGHT_U
    st.warps.forEach((w, i) => {
      const s = w.spot
      const px = x / UNIT
      const py = y / UNIT
      const cx = s.axis === 0 ? s.x : Math.min(s.x + len, Math.max(s.x, px))
      const cy = s.axis === 0 ? Math.min(s.y + len, Math.max(s.y, py)) : s.y
      const d = Math.hypot(px - cx, py - cy)
      if (d >= best) return
      best = d
      const l = d || 1
      out.fx = (cx - px) / l
      out.fy = (cy - py) / l
      out.color = PAIR_COLORS[i >> 1]!
      out.fill = WARP_FILL * (1 - d / WARP_LIGHT_U)
    })
  }

  /** 正穿过门线的精灵切成两份：门这边画还没过去的那一半，另一扇门那边画已经过去的那一半 */
  cutAt(x: number, y: number, hw: number, hh: number, out: SpriteCut[]): number {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return 0
    const len = cfg.warps.lenU * UNIT
    for (let i = 0; i < st.warps.length; i++) {
      const s = st.warps[i]!.spot
      const o = st.warps[i ^ 1]!.spot
      const lx = s.x * UNIT
      const ly = s.y * UNIT
      const axis = s.axis
      const across = axis === 0 ? x - lx : y - ly
      const along = axis === 0 ? y - ly : x - lx
      if (Math.abs(across) >= (axis === 0 ? hw : hh) || along <= 0 || along >= len) continue
      const side = across < 0 ? -1 : 1
      const at = axis === 0 ? lx : ly
      const a = out[0]!
      a.dx = 0
      a.dy = 0
      a.axis = axis
      a.at = at
      a.keep = side
      const b = out[1]!
      b.dx = (o.x - s.x) * UNIT
      b.dy = (o.y - s.y) * UNIT
      b.axis = axis
      b.at = at
      b.keep = side < 0 ? 1 : -1
      return 2
    }
    return 0
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.dropCity(v)
    this.slices = []
    this.signal = undefined
    this.tiles = undefined
    this.floorFx = undefined
    this.airFx = undefined
    this.sparks = undefined
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, MASK_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
