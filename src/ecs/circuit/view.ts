import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { loadSettings } from '../../save/settings'
import { browserStorage } from '../../util/storage'
import { drawSpark } from '../render/volcano'
import { groundArea, textureSize } from './ground'
import { CircuitPainter } from './painter'
import { CURRENT_FRAG, encodeCopper, encodeNets } from './shader'
import { COPPER_REACH_U, NET_SLOTS } from './layout'
import { circuitPlanFor } from './world'
import type { CircuitState } from './world'
import type { PaintScene, PixelRect } from './ground'
import type { CircuitPlan, Gap, NetKind, Plate } from './layout'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Framing } from '../lens'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'

const BG = 0x050b0c
const GROUND_KEY = 'circuit-ground'
const COPPER_KEY = 'circuit-copper'
const DIST_KEY = 'circuit-dist'
const NETS_KEY = 'circuit-nets'
const SPARK_KEY = 'circuit-spark'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 电的颜色：白芯与蓝紫光晕，电弧、火花、指示灯和开关的光圈都用它 */
const CORE = 0xf4f6ff
const GLOW = 0x8f9bff
/** 电弧闪一下要多久换一个形状，毫秒 */
const ARC_FLICKER_MS = 45
/** 蓄电蓄到这么多以后电极尖上开始冒细小的火花，再多一些开始滋滋响 */
const STREAMER_FROM = 0.55
const HISS_FROM = 0.7
/** 开关准备好时那一圈光呼吸的快慢（弧度/秒） */
const BREATHE = 3.2
/** 带电的铜上一道电弧闪多久就换形，毫秒 */
const BOLT_MS = [45, 110] as const
/** 每格长的铜线上同时窜着几道电弧：电源线一直通电，少一些 */
const BOLT_DENSITY: Readonly<Record<NetKind, number>> = { rail: 0.18, clock: 0.3, button: 0.3 }
/** 一块铜板上同时窜着几道电弧：多半贴着板边窜，其余横穿板面 */
const PLATE_BOLTS = 6
const PLATE_ACROSS = 2
/** 贴着铜边窜的电弧离铜边最远多少格（里外一样） */
const EDGE_BAND_U = 0.28
/** 刚通电整片闪白多久，毫秒 */
const FLASH_MS = 300

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const tex = scene.textures.createCanvas(key, w, h)!
  if (draw) draw(tex.getContext())
  return tex
}

/** 把画布传上显卡：每次上传都会把过滤重设成游戏的默认值（高分屏开了 pixelArt 就是最近点），所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture, filter: Phaser.Textures.FilterMode): void {
  tex.refresh()
  tex.setFilter(filter)
}

/** 一道锯齿的电光：从 a 到 b 按中点位移折出来，jag 是折出去的幅度（占长度的比例） */
function jagged(ax: number, ay: number, bx: number, by: number, jag: number, depth: number): Point[] {
  let pts: Point[] = [
    { x: ax, y: ay },
    { x: bx, y: by },
  ]
  let amp = Math.hypot(bx - ax, by - ay) * jag
  for (let k = 0; k < depth; k++) {
    const next: Point[] = [pts[0]!]
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!
      const q = pts[i]!
      const dx = q.x - p.x
      const dy = q.y - p.y
      const l = Math.hypot(dx, dy) || 1
      const off = (Math.random() * 2 - 1) * amp
      next.push({ x: (p.x + q.x) / 2 - (dy / l) * off, y: (p.y + q.y) / 2 + (dx / l) * off }, q)
    }
    pts = next
    amp *= 0.55
  }
  return pts
}

/** 一道电光画三遍：外面一圈宽而淡的光，中间一层，里面一条白芯 */
function strokeBolt(g: Phaser.GameObjects.Graphics, pts: readonly Point[], width: number, alpha: number): void {
  const passes: [number, number, number][] = [
    [width * 5, GLOW, 0.16],
    [width * 2.2, GLOW, 0.45],
    [width, CORE, 0.95],
  ]
  for (const [w, c, a] of passes) {
    g.lineStyle(w, c, a * alpha)
    g.beginPath()
    g.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
    g.strokePath()
  }
}

/** 一段铜线：中线上的点（格）、从头累计到每个点有多长（格）、半宽（格） */
interface Wire {
  readonly pts: readonly Point[]
  readonly cum: readonly number[]
  readonly half: number
}

function wireOf(pts: readonly Point[], width: number): Wire {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  return { pts, cum, half: width / 2 }
}

function wireLength(w: Wire): number {
  return w.cum[w.cum.length - 1]!
}

/** 铜线上从头走了 s 格的地方，和那里朝线旁边的方向 */
function wireAt(w: Wire, s: number): { x: number; y: number; nx: number; ny: number } {
  let i = 1
  while (i < w.pts.length - 1 && w.cum[i]! < s) i++
  const a = w.pts[i - 1]!
  const b = w.pts[i]!
  const l = w.cum[i]! - w.cum[i - 1]! || 1
  const t = Math.min(1, Math.max(0, (s - w.cum[i - 1]!) / l))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx: -(b.y - a.y) / l, ny: (b.x - a.x) / l }
}

/** 一条网络的铜线上随便一处：按长度挑一段线，再挑线上走了多远 */
function pickWire(wires: readonly Wire[], length: number): { w: Wire; s: number } {
  let r = Math.random() * length
  for (const w of wires) {
    const l = wireLength(w)
    if (r < l) return { w, s: r }
    r -= l
  }
  const w = wires[wires.length - 1]!
  return { w, s: wireLength(w) * Math.random() }
}

/** 顺着铜线从 s 走 len 格的一道电弧（世界像素）：离中线的距离在 [lo, hi] 格里一路乱跳 */
function boltAlong(w: Wire, s: number, len: number, lo: number, hi: number): Point[] {
  const end = Math.min(wireLength(w), s + len)
  const out: Point[] = []
  let off = lo + Math.random() * (hi - lo)
  for (let t = s; ; ) {
    const q = wireAt(w, t)
    out.push({ x: (q.x + q.nx * off) * UNIT, y: (q.y + q.ny * off) * UNIT })
    if (t >= end) break
    t = Math.min(end, t + 0.15 + Math.random() * 0.2)
    off = Math.max(lo, Math.min(hi, off + (Math.random() * 2 - 1) * (hi - lo) * 0.7))
  }
  return out
}

/** 从电弧上随便一点朝 side 那边蹦出去一根岔（世界像素），伸出去 reach 格上下 */
function spurOff(w: Wire, s: number, main: readonly Point[], side: number, reach: number): Point[] {
  const k = 1 + Math.floor(Math.random() * (main.length - 2))
  const q = wireAt(w, s + k * 0.25)
  const from = main[k]!
  const l = (reach + Math.random() * 0.4) * UNIT
  return jagged(from.x, from.y, from.x + q.nx * side * l, from.y + q.ny * side * l, 0.3, 2)
}

/** 铜线上一道电弧：多半贴着一侧的铜边窜（一半在铜上、一半在铜外的阻焊上），少半横穿线宽；有时往线外蹦出去一根岔 */
function wireBolt(w: Wire, s: number, len: number): Point[][] {
  const r = Math.random()
  const side = r < 0.35 ? 1 : r < 0.7 ? -1 : 0
  const main =
    side === 0
      ? boltAlong(w, s, len, -w.half * 0.85, w.half * 0.85)
      : boltAlong(w, s, len, side > 0 ? w.half - EDGE_BAND_U : -w.half - EDGE_BAND_U, side > 0 ? w.half + EDGE_BAND_U : -w.half + EDGE_BAND_U)
  const lines = [main]
  if (main.length > 2 && Math.random() < 0.45) lines.push(spurOff(w, s, main, side === 0 ? (Math.random() < 0.5 ? 1 : -1) : side, side === 0 ? w.half + 0.15 : 0.25))
  return lines
}

/** 铜板的边，四角斜切，走成一圈 */
function plateRim(p: Plate): Wire {
  const c = p.cut
  return wireOf(
    [
      { x: p.x0 + c, y: p.y0 },
      { x: p.x1 - c, y: p.y0 },
      { x: p.x1, y: p.y0 + c },
      { x: p.x1, y: p.y1 - c },
      { x: p.x1 - c, y: p.y1 },
      { x: p.x0 + c, y: p.y1 },
      { x: p.x0, y: p.y1 - c },
      { x: p.x0, y: p.y0 + c },
      { x: p.x0 + c, y: p.y0 },
    ],
    0,
  )
}

/** 铜板上一道电弧：贴着板边窜一段，有时往外蹦出去一根岔 */
function rimBolt(rim: Wire): Point[][] {
  const s = Math.random() * wireLength(rim)
  const main = boltAlong(rim, s, 1 + Math.random() * 1.6, -EDGE_BAND_U, EDGE_BAND_U)
  const lines = [main]
  if (main.length > 2 && Math.random() < 0.45) lines.push(spurOff(rim, s, main, Math.random() < 0.5 ? 1 : -1, 0.25))
  return lines
}

/** 铜板上一道横穿板面的电弧：从板里一点朝随便哪边乱折着窜出 1 到 2.5 格 */
function acrossBolt(p: Plate): Point[][] {
  const ax = p.x0 + 0.4 + Math.random() * (p.x1 - p.x0 - 0.8)
  const ay = p.y0 + 0.4 + Math.random() * (p.y1 - p.y0 - 0.8)
  const ang = Math.random() * Math.PI * 2
  const len = 1 + Math.random() * 1.5
  const inside = (q: Point): Point => ({
    x: Math.min((p.x1 - 0.15) * UNIT, Math.max((p.x0 + 0.15) * UNIT, q.x)),
    y: Math.min((p.y1 - 0.15) * UNIT, Math.max((p.y0 + 0.15) * UNIT, q.y)),
  })
  return [jagged(ax * UNIT, ay * UNIT, (ax + Math.cos(ang) * len) * UNIT, (ay + Math.sin(ang) * len) * UNIT, 0.3, 4).map(inside)]
}

/** 一道电弧：主干和蹦出去的岔（世界像素），到什么时候换形，多亮多粗 */
interface Bolt {
  lines: Point[][]
  until: number
  alpha: number
  width: number
}

/** 一条网络在画面上的东西：能窜电弧的铜线与铜板，同时窜着的电弧，上一帧通没通电、什么时候通的电 */
interface NetFx {
  readonly kind: NetKind
  readonly wires: readonly Wire[]
  readonly length: number
  readonly plates: readonly { readonly plate: Plate; readonly rim: Wire }[]
  readonly bolts: Bolt[]
  was: number
  flashAt: number
}

/** 一处电弧此刻在画面上的东西：两尖上的辉光，放电时照亮周围的一团光；电光的形状隔一会儿才换 */
interface GapFx {
  readonly gap: Gap
  readonly tipA: Phaser.GameObjects.Image
  readonly tipB: Phaser.GameObjects.Image
  readonly flare: Phaser.GameObjects.Image
  readonly cap: Phaser.GameObjects.Image
  bolts: Point[][]
  shapedAt: number
  count: number
  /** 这一轮蓄电快满时已经响过滋滋声 */
  hissed: boolean
}

/**
 * 电路板：板面、元件和影子是开局在后台线程画好的贴图。带电的铜还是金的，铜边上窜着一道道细的锯齿电弧（一半在铜上、一半在铜外），
 * 不时往外蹦出岔，少数横穿过去；铜边一圈细光乱闪（着色器画）；一通电整条同时带电、整片闪一下白；时钟线快通电时线上零星冒小电火花，越临近越密，
 * 定时芯片旁的指示灯越闪越急。电极蓄电时尖上越来越亮、冒细小的火花，放电时两尖之间劈出一道电光；
 * 触摸开关准备好时外圈一呼一吸地亮，被踩了整圈亮起，断开后一圈慢慢走满才又能用；脚碰着通电的铜，脚下冒火花
 */
export class CircuitView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: CircuitPlan
  private painter?: CircuitPainter
  private readonly u = { time: 0 }
  private nets?: { tex: Phaser.Textures.CanvasTexture; img: ImageData }
  private fx?: Phaser.GameObjects.Graphics
  private rings?: Phaser.GameObjects.Graphics
  private copperFx?: Phaser.GameObjects.Graphics
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private led?: Phaser.GameObjects.Image
  private ledPool?: Phaser.GameObjects.Image
  private gaps: GapFx[] = []
  private netFx: NetFx[] = []
  private crackles: Bolt[] = []
  private lastNow = 0
  private zapSeen = 0
  private presses: number[] = []
  private clockWas: number[] = []
  private shake = true

  private planOf(v: ViewCtx): CircuitPlan {
    if (!this.plan) this.plan = circuitPlanFor(v.def.circuit!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.size * UNIT, h: p.size * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    if (!v.scene.textures.exists(SPARK_KEY)) upload(canvasTexture(v.scene, SPARK_KEY, 32, 32, (ctx) => drawSpark(ctx, 32)), Phaser.Textures.FilterMode.LINEAR)
    this.shake = loadSettings(browserStorage()).hitShake
  }

  framing(v: ViewCtx): Framing {
    return { map: { x: 0, y: 0, w: v.w, h: v.h }, edge: 'clamp' }
  }

  /** 板面上不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.circuit!
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const size = textureSize(sc)
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new CircuitPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    const ga = groundArea(sc)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.copper(v, plan)
    this.dynamics(v, plan)
    const st = sim.worldState.circuit
    this.zapSeen = st?.zapCount ?? 0
    this.presses = st ? st.buttons.map((b) => b.presses) : []
    this.clockWas = plan.clocks.map(() => -1)
    this.lastNow = sim.elapsedMs
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.72, 0.24, 0x000000)
  }

  /** 带电的铜：编成数据图，着色器在铜边上画光 */
  private copper(v: ViewCtx, plan: CircuitPlan): void {
    const scene = v.scene
    const g = plan.copper
    const data = encodeCopper(g)
    upload(canvasTexture(scene, COPPER_KEY, g.cols, g.rows, (ctx) => ctx.putImageData(new ImageData(data.copper, g.cols, g.rows), 0, 0)), Phaser.Textures.FilterMode.NEAREST)
    upload(canvasTexture(scene, DIST_KEY, g.cols, g.rows, (ctx) => ctx.putImageData(new ImageData(data.dist, g.cols, g.rows), 0, 0)), Phaser.Textures.FilterMode.LINEAR)
    const nets = canvasTexture(scene, NETS_KEY, NET_SLOTS, 1)
    this.nets = { tex: nets, img: nets.getContext().createImageData(NET_SLOTS, 1) }
    upload(nets, Phaser.Textures.FilterMode.NEAREST)
    const u = this.u
    const w = g.cols * g.cell
    const h = g.rows * g.cell
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'CircuitCurrent',
            fragmentSource: CURRENT_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uCopper', 0)
              set('uDist', 1)
              set('uNets', 2)
              set('uArea', [g.x0, g.y0, w, h])
              set('uTime', u.time)
              set('uReach', COPPER_REACH_U)
              set('uSlots', NET_SLOTS)
            },
          },
          g.x0 * UNIT,
          g.y0 * UNIT,
          w * UNIT,
          h * UNIT,
          [COPPER_KEY, DIST_KEY, NETS_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.9),
    )
  }

  /** 会动的东西：铜上的电弧、开关的光圈、指示灯、电极的辉光、电光与火花 */
  private dynamics(v: ViewCtx, plan: CircuitPlan): void {
    const scene = v.scene
    this.rings = scene.add.graphics().setDepth(-0.85).setBlendMode(Phaser.BlendModes.ADD)
    this.copperFx = scene.add.graphics().setDepth(-0.8).setBlendMode(Phaser.BlendModes.ADD)
    this.fx = scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.rings, this.copperFx, this.fx)
    this.netFx = plan.nets.map((n, k) => {
      const wires = plan.traces.filter((t) => t.net === k).map((t) => wireOf(t.pts, t.w))
      const plates = plan.plates.filter((p) => p.net === k).map((plate) => ({ plate, rim: plateRim(plate) }))
      const length = wires.reduce((a, w) => a + wireLength(w), 0)
      const slots = Math.max(1, Math.round(length * BOLT_DENSITY[n.kind])) + plates.length * PLATE_BOLTS
      const bolts = Array.from({ length: slots }, (): Bolt => ({ lines: [], until: 0, alpha: 0, width: 0 }))
      // 电源线开局就通着，不算刚通电
      return { kind: n.kind, wires, length, plates, bolts, was: n.kind === 'rail' ? 1 : 0, flashAt: -Infinity }
    })
    const clock = plan.clocks[0]
    if (clock) {
      this.ledPool = scene.add.image(clock.led.x * UNIT, clock.led.y * UNIT, SPARK_KEY).setDepth(-0.84).setBlendMode(Phaser.BlendModes.ADD).setTint(GLOW).setDisplaySize(3.2 * UNIT, 3.2 * UNIT).setAlpha(0)
      this.led = scene.add.image(clock.led.x * UNIT, clock.led.y * UNIT, SPARK_KEY).setDepth(-0.83).setBlendMode(Phaser.BlendModes.ADD).setTint(CORE).setDisplaySize(1.1 * UNIT, 1.1 * UNIT).setAlpha(0)
      this.visuals.push(this.ledPool, this.led)
    }
    for (const gap of plan.gaps) {
      const glow = (x: number, y: number, size: number, tint: number, depth: number): Phaser.GameObjects.Image => {
        const img = scene.add.image(x * UNIT, y * UNIT, SPARK_KEY).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDisplaySize(size * UNIT, size * UNIT).setAlpha(0)
        this.visuals.push(img)
        return img
      }
      const mid = { x: (gap.a.x + gap.b.x) / 2, y: (gap.a.y + gap.b.y) / 2 }
      this.gaps.push({
        gap,
        tipA: glow(gap.a.x, gap.a.y, 1.6, GLOW, 8.9),
        tipB: glow(gap.b.x, gap.b.y, 1.6, GLOW, 8.9),
        flare: glow(mid.x, mid.y, 7, GLOW, -0.84),
        cap: glow(gap.cap.x, gap.cap.y, 4, GLOW, -0.84),
        bolts: [],
        shapedAt: 0,
        count: -1,
        hissed: false,
      })
    }
    this.sparks = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 180, max: 420 },
        speed: { min: 50, max: 230 },
        scale: { start: 0.32, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffffff, 0xdfe3ff, GLOW],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9.5)
    this.visuals.push(this.sparks)
  }

  /** (x, y)（格）在不在镜头里，边上再放宽 pad 格 */
  private seen(v: ViewCtx, x: number, y: number, pad: number): boolean {
    const r = v.scene.cameras.main.worldView
    return x * UNIT > r.x - pad * UNIT && x * UNIT < r.right + pad * UNIT && y * UNIT > r.y - pad * UNIT && y * UNIT < r.bottom + pad * UNIT
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const plan = this.plan
    const st = sim.worldState.circuit
    if (!plan || !st || !this.nets || !this.fx || !this.rings || !this.copperFx) return
    const now = sim.elapsedMs
    const dt = Math.min(100, Math.max(0, now - this.lastNow))
    this.lastNow = now
    this.u.time = now / 1000
    this.fx.clear()
    this.rings.clear()
    this.copperFx.clear()
    const flash = this.currents(v, st, now, dt)
    encodeNets(this.nets.img.data, st.nets, flash)
    this.nets.tex.getContext().putImageData(this.nets.img, 0, 0)
    upload(this.nets.tex, Phaser.Textures.FilterMode.NEAREST)
    this.clocks(v, plan, st, now)
    this.buttons(v, plan, st, now)
    this.arcs(v, st, now)
    this.zaps(v, st)
  }

  /** 一条网络的铜上随便一点（格）：铜线和铜板各占一半机会 */
  private somewhere(fx: NetFx): Point {
    const p = fx.plates[Math.floor(Math.random() * fx.plates.length * 2)]?.plate
    if (p) return { x: p.x0 + Math.random() * (p.x1 - p.x0), y: p.y0 + Math.random() * (p.y1 - p.y0) }
    const at = pickWire(fx.wires, fx.length)
    return wireAt(at.w, at.s)
  }

  /**
   * 带电的铜：每道电弧到时候就换个地方、换个形状，落在镜头外的不画；刚通电时整片闪白、溅一把火花；
   * 时钟线快通电时零星冒小电火花，越临近越密。返回每条网络此刻闪白还剩多少，交给着色器
   */
  private currents(v: ViewCtx, st: CircuitState, now: number, dt: number): number[] {
    const g = this.copperFx!
    const flash = this.netFx.map((fx, k) => {
      const net = st.nets[k]
      if (!net) return 0
      if (net.level > 0 && fx.was === 0) {
        fx.flashAt = now
        for (const b of fx.bolts) b.until = 0
        for (let i = 0; i < 6; i++) {
          const p = this.somewhere(fx)
          if (this.seen(v, p.x, p.y, 1)) this.sparks?.explode(4, p.x * UNIT, p.y * UNIT)
        }
      }
      fx.was = net.level
      if (net.level > 0) {
        const plateSlots = fx.plates.length * PLATE_BOLTS
        const thin = fx.kind === 'rail' ? 0.75 : 1
        fx.bolts.forEach((b, i) => {
          if (now < b.until) return
          b.until = now + BOLT_MS[0] + Math.random() * (BOLT_MS[1] - BOLT_MS[0])
          b.alpha = (0.65 + 0.35 * Math.random()) * thin
          b.width = 0.045 * UNIT * thin
          if (i < plateSlots) {
            const { plate: p, rim } = fx.plates[Math.floor(i / PLATE_BOLTS)]!
            const seen = this.seen(v, (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.x1 - p.x0) / 2 + 1)
            b.lines = !seen ? [] : i % PLATE_BOLTS < PLATE_ACROSS ? acrossBolt(p) : rimBolt(rim)
            return
          }
          const { w, s } = pickWire(fx.wires, fx.length)
          const at = wireAt(w, s)
          b.lines = this.seen(v, at.x, at.y, 3) ? wireBolt(w, s, (fx.kind === 'rail' ? 1 : 1.4) + Math.random() * 1.6) : []
        })
        for (const b of fx.bolts) b.lines.forEach((pts, i) => strokeBolt(g, pts, i === 0 ? b.width : b.width * 0.6, b.alpha * (0.7 + 0.3 * Math.random())))
      } else if (net.warn > 0) {
        let n = (1.5 + 18 * net.warn * net.warn) * (fx.length / 10) * (dt / 1000)
        while (n > 0) {
          if (Math.random() < n) {
            const { w, s } = pickWire(fx.wires, fx.length)
            const at = wireAt(w, s)
            if (this.seen(v, at.x, at.y, 1)) {
              this.crackles.push({ lines: wireBolt(w, s, 0.35 + Math.random() * 0.45), until: now + 40 + Math.random() * 40, alpha: 0.8, width: 0.032 * UNIT })
              this.sparks?.explode(2, at.x * UNIT, at.y * UNIT)
            }
          }
          n -= 1
        }
      }
      const f = 1 - (now - fx.flashAt) / FLASH_MS
      return f > 0 ? f ** 1.5 : 0
    })
    this.crackles = this.crackles.filter((b) => now < b.until)
    for (const b of this.crackles) b.lines.forEach((pts, i) => strokeBolt(g, pts, i === 0 ? b.width : b.width * 0.6, b.alpha))
    return flash
  }

  /** 指示灯：通着电常亮，预警时越闪越急；时钟线通电、快通电时出声 */
  private clocks(v: ViewCtx, plan: CircuitPlan, st: CircuitState, now: number): void {
    plan.clocks.forEach((c, i) => {
      const net = st.nets[c.nets[0]!]
      if (!net) return
      const blink = net.warn > 0 ? (Math.sin(now / (110 - 70 * net.warn)) > 0 ? 1 : 0.15) : 0
      const on = Math.max(net.level, blink * 0.9)
      this.led?.setAlpha(0.1 + 0.9 * on)
      this.ledPool?.setAlpha(0.35 * on)
      const state = net.level > 0 ? 2 : net.warn > 0 ? 1 : 0
      if (state !== this.clockWas[i] && this.clockWas[i] !== -1 && this.seen(v, c.chip.x, c.chip.y, 6)) {
        if (state === 1) playSfx('crackle')
        if (state === 2) playSfx('surge')
      }
      this.clockWas[i] = state
    })
  }

  /** 触摸开关的光圈 */
  private buttons(v: ViewCtx, plan: CircuitPlan, st: CircuitState, now: number): void {
    const g = this.rings!
    const cfg = v.def.circuit!.button
    plan.buttons.forEach((b, i) => {
      const s = st.buttons[i]!
      const x = b.x * UNIT
      const y = b.y * UNIT
      const r = b.r * UNIT
      const touch = b.touch * UNIT
      if (s.phase === 'ready') {
        const k = 0.5 + 0.5 * Math.sin((now / 1000) * BREATHE)
        g.lineStyle(0.12 * UNIT, GLOW, 0.25 + 0.3 * k)
        g.strokeCircle(x, y, r * 1.02)
        g.fillStyle(GLOW, 0.05 + 0.06 * k)
        g.fillCircle(x, y, touch)
      } else if (s.phase === 'live') {
        g.lineStyle(0.16 * UNIT, CORE, 0.9)
        g.strokeCircle(x, y, r * 1.02)
        g.fillStyle(GLOW, 0.35)
        g.fillCircle(x, y, touch)
      } else {
        const k = Math.min(1, (now - s.since) / cfg.rearmMs)
        g.lineStyle(0.1 * UNIT, GLOW, 0.12)
        g.strokeCircle(x, y, r * 1.02)
        g.lineStyle(0.12 * UNIT, GLOW, 0.4)
        g.beginPath()
        g.arc(x, y, r * 1.02, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, false)
        g.strokePath()
      }
      if (s.presses !== this.presses[i]) {
        this.presses[i] = s.presses
        if (this.seen(v, b.x, b.y, 4)) {
          playSfx('relay')
          playSfx('surge')
        }
      }
    })
  }

  /** 电弧：蓄电时两尖越来越亮、冒细火花，放电时劈出电光、照亮周围、溅出火花 */
  private arcs(v: ViewCtx, st: CircuitState, now: number): void {
    const g = this.fx!
    this.gaps.forEach((fx, i) => {
      const s = st.gaps[i]
      if (!s) return
      const { a, b } = fx.gap
      const ax = a.x * UNIT
      const ay = a.y * UNIT
      const bx = b.x * UNIT
      const by = b.y * UNIT
      const charge = s.phase === 'charge' ? s.charge : s.phase === 'arc' ? 1 : 0
      const shimmer = 0.85 + 0.15 * Math.sin(now / 37 + i)
      fx.tipA.setAlpha(charge * charge * 0.8 * shimmer)
      fx.tipB.setAlpha(charge * charge * 0.8 * shimmer)
      fx.cap.setAlpha(charge * 0.25)
      if (s.phase !== 'charge') fx.hissed = false
      else if (!fx.hissed && s.charge > HISS_FROM) {
        fx.hissed = true
        if (this.seen(v, (a.x + b.x) / 2, (a.y + b.y) / 2, 2)) playSfx('crackle')
      }
      if (s.phase === 'charge' && s.charge > STREAMER_FROM) {
        // 细火花：从两尖朝对面探出去，蓄得越满探得越远
        const reach = (s.charge - STREAMER_FROM) / (1 - STREAMER_FROM)
        for (const [p, q] of [
          [a, b],
          [b, a],
        ] as const) {
          if (Math.random() > 0.35 + 0.5 * reach) continue
          const len = 0.15 + 0.35 * reach * Math.random()
          const ex = p.x + (q.x - p.x) * len + (Math.random() * 2 - 1) * 0.3
          const ey = p.y + (q.y - p.y) * len + (Math.random() * 2 - 1) * 0.3
          strokeBolt(g, jagged(p.x * UNIT, p.y * UNIT, ex * UNIT, ey * UNIT, 0.35, 3), 0.035 * UNIT, 0.5 + 0.4 * reach)
        }
      }
      if (s.phase === 'arc') {
        if (s.count !== fx.count) {
          fx.count = s.count
          fx.shapedAt = 0
          if (this.seen(v, (a.x + b.x) / 2, (a.y + b.y) / 2, 3)) {
            playSfx('arc')
            if (this.shake && this.seen(v, (a.x + b.x) / 2, (a.y + b.y) / 2, 0)) v.lens.shake(120, 0.0015)
          }
          this.sparks?.explode(10, ax, ay)
          this.sparks?.explode(10, bx, by)
        }
        if (now - fx.shapedAt >= ARC_FLICKER_MS) {
          fx.shapedAt = now
          fx.bolts = [jagged(ax, ay, bx, by, 0.22, 5), jagged(ax, ay, bx, by, 0.3, 4)]
          if (Math.random() < 0.5) {
            const t = 0.3 + Math.random() * 0.4
            const mx = ax + (bx - ax) * t
            const my = ay + (by - ay) * t
            const ang = Math.atan2(by - ay, bx - ax) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6)
            const l = Math.hypot(bx - ax, by - ay) * (0.2 + Math.random() * 0.25)
            fx.bolts.push(jagged(mx, my, mx + Math.cos(ang) * l, my + Math.sin(ang) * l, 0.3, 3))
          }
        }
        fx.bolts.forEach((pts, k) => strokeBolt(g, pts, (k === 0 ? 0.07 : 0.045) * UNIT, k === 0 ? 1 : 0.7))
        fx.flare.setAlpha(0.55 + 0.25 * Math.random())
      } else {
        fx.flare.setAlpha(fx.flare.alpha * 0.82)
      }
    })
  }

  /** 脚碰着通电的铜：脚下溅火花，响一声 */
  private zaps(v: ViewCtx, st: CircuitState): void {
    if (st.zapCount === this.zapSeen) return
    this.zapSeen = st.zapCount
    let heard = false
    for (const z of st.zaps) {
      if (!this.seen(v, z.x, z.y, 1)) continue
      this.sparks?.explode(5, z.x * UNIT + (Math.random() * 2 - 1) * 0.2 * UNIT, z.y * UNIT + (Math.random() * 2 - 1) * 0.2 * UNIT)
      heard = true
    }
    if (heard) playSfx('shock')
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.gaps = []
    this.netFx = []
    this.crackles = []
    this.nets = undefined
    this.fx = undefined
    this.rings = undefined
    this.copperFx = undefined
    this.sparks = undefined
    this.led = undefined
    this.ledPool = undefined
    for (const key of [GROUND_KEY, COPPER_KEY, DIST_KEY, NETS_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
