import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Alive, ENEMY_SET, Phys, PrevPos, PROJ_SET, Transform, Uid } from '../../ecs/components'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { facingAngle } from '../../ecs/utils/facing'
import { BoundedView } from '../../ecs/views'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { airRadius, breathable } from './bell'
import { groundM, HEIGHT_RANGE, paintScene, RELIEF_PPU } from './ground'
import { seabedM } from './layout'
import { DeepPainter } from './painter'
import { MAX_LAMPS, SEABED_FRAG } from './shader'
import { drawBell, drawBubble, drawFlake, drawHalo } from './sprites'
import { underBell } from './world'
import type { Bell, BellPhase } from './bell'
import type { PaintScene } from './ground'
import type { DeepState } from './world'
import type { DeepConfig } from '../../types/maps'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { ViewCtx } from '../../ecs/views'
import type { Point } from '../../util/vec'

const BG = 0x020916
const ALBEDO_KEY = 'deep-albedo'
const GEO_KEY = 'deep-geo'
const NORM_KEY = 'deep-norm'
const GLOW_KEY = 'deep-glow'
const BELL_KEY = 'deep-bell'
const BUBBLE_KEY = 'deep-bubble'
const HALO_KEY = 'deep-halo'
const FLAKE_KEY = 'deep-flake'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 透视镜头离开局站位那片谷底多高，米：比谷底高的东西在画面上更大、从画面中间往外偏 */
const CAM_M = 20
/** 钟从钟口到顶有多高，米：画在一半高处 */
const BELL_TALL_M = 2.4
/** 钟画多大，占钟口底下喘得上气那一圈的比例：那一圈比钟口宽一点，气泡从钟口漫出来 */
const BELL_SIZE = 0.62
/** 探照灯与头灯的亮度（给着色器的量，与照到的距离平方相除）；头灯举多高（米） */
const BELL_LAMP = 24
const HEAD_LAMP = 1.6
const HEAD_LAMP_M = 1.3
/** 头顶照下来的那一丝蓝，三色 */
const SKY = [0.02, 0.066, 0.25] as const
const EXPOSURE = 1.5
/** 冷光：每格几个格子，衰减的时间常数（秒），身体游多快（格/秒）才搅亮水，搅亮多少；弹体一路拖出多亮的尾巴 */
const GLOW_PPU = 4
const GLOW_TAU = 0.75
const GLOW_SPEED_U = 1.4
const GLOW_BODY = 2.4
const GLOW_SHOT = 0.22
const GLOW_GAIN = 1.1
/** 气泡：最多同时几个，往上升多快（米/秒），升到多高就散了（米） */
const BUBBLE_MAX = 160
const BUBBLE_RISE_MS = 1.4
const BUBBLE_TOP_M = 9
/** 海雪：几片，往下沉多快（米/秒），离谷底多高的范围（米） */
const SNOW = 190
const SNOW_SINK_MS = 0.12
const SNOW_LO_M = 0.4
const SNOW_HI_M = CAM_M * 0.72
/** 呛水时一串串冒泡，隔多久响一声（毫秒） */
const GURGLE_MS = 1300

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

interface Bubble {
  x: number
  y: number
  h: number
  vh: number
  r: number
  phase: number
  age: number
  readonly img: Phaser.GameObjects.Image
}

interface Flake {
  x: number
  y: number
  h: number
  vx: number
  vy: number
  r: number
  phase: number
  readonly img: Phaser.GameObjects.Image
}

/** 把画布重新传上显卡：重传会按游戏的像素风退回最近邻取样，这几张图都要线性插值 */
function refreshLinear(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/**
 * 深海：谷底是开局在后台线程画好的固有色与高度，光照由着色器逐点算——头顶只剩一丝深蓝，钟上的探照灯与队员的头灯照出一圈圈暖白，
 * 光在水里走得越远越只剩青蓝，灯四周罩着一团泛青的光晕；被搅动的浮游生物发出蓝绿的冷光，游过的身体与飞过的子弹身后拖着一道道光痕。
 * 潜水钟、缆绳、气泡与海雪按透视画：越高的东西越大、越往画面外偏；钟口底下那一圈喘得上气的地方画一道圈，钟吊走时圈画在它要落下去的地方。
 * 呛水的队员一串串冒泡
 */
export class DeepView extends BoundedView {
  private painter?: DeepPainter
  private relief?: PaintScene
  private ground?: Phaser.GameObjects.Shader
  private readonly u = {
    bell: [0, 0, 0, 0],
    lamp: new Float32Array(MAX_LAMPS * 4),
    dir: new Float32Array(MAX_LAMPS * 4),
    count: 0,
  }
  private glow?: { tex: Phaser.Textures.CanvasTexture; img: ImageData; v: Float32Array; n: number }
  private bell?: Phaser.GameObjects.Image
  private lampHalo?: Phaser.GameObjects.Image
  private cable?: Phaser.GameObjects.Graphics
  private ring?: Phaser.GameObjects.Graphics
  private bubbles: Bubble[] = []
  private spare: Phaser.GameObjects.Image[] = []
  private snow: Flake[] = []
  private phase: BellPhase = 'down'
  private exhaleAt = new Map<number, number>()
  private gurgleAt = 0
  private bubbleDebt = 0
  private seepDebt = 0
  /** 这一帧钟的灯在哪、多亮：单位、气泡与海雪按它分明暗 */
  private readonly lit = { x: 0, y: 0, power: 0 }
  private ready = false

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    if (!scene.textures.exists(BELL_KEY)) canvasTexture(scene, BELL_KEY, 256, 256, (ctx) => drawBell(ctx, 256))
    if (!scene.textures.exists(BUBBLE_KEY)) canvasTexture(scene, BUBBLE_KEY, 32, 32, (ctx) => drawBubble(ctx, 32))
    if (!scene.textures.exists(HALO_KEY)) canvasTexture(scene, HALO_KEY, 64, 64, (ctx) => drawHalo(ctx, 64))
    if (!scene.textures.exists(FLAKE_KEY)) canvasTexture(scene, FLAKE_KEY, 16, 16, (ctx) => drawFlake(ctx, 16))
  }

  /** 谷底上的小东西都画进地面里了 */
  decor(): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.deep
    if (!s) return
    const cfg = v.def.deep!
    const scene = v.scene
    const W = FRAME_U * GROUND_PPU
    const RW = FRAME_U * RELIEF_PPU
    const albedo = canvasTexture(scene, ALBEDO_KEY, W, W)
    const geo = canvasTexture(scene, GEO_KEY, RW, RW)
    const norm = canvasTexture(scene, NORM_KEY, RW, RW)
    const painter = new DeepPainter(s.plan, cfg.meterPerU, GROUND_PPU, W, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    await painter.paint(
      RW * RW,
      (r0, r1, pixels) => albedo.getContext().putImageData(new ImageData(pixels, W, r1 - r0), 0, r0),
      (g, n) => {
        geo.getContext().putImageData(new ImageData(g, RW, RW), 0, 0)
        norm.getContext().putImageData(new ImageData(n, RW, RW), 0, 0)
      },
    )
    if (this.painter !== painter) return
    painter.close()
    this.painter = undefined
    refreshLinear(albedo)
    refreshLinear(geo)
    refreshLinear(norm)
    this.relief = paintScene(s.plan, cfg.meterPerU)
    const n = FRAME_U * GLOW_PPU
    const glowTex = canvasTexture(scene, GLOW_KEY, n, n)
    this.glow = { tex: glowTex, img: glowTex.getContext().createImageData(n, n), v: new Float32Array(n * n), n }
    const u = this.u
    const rect = [FRAME.x, FRAME.y, FRAME.w, FRAME.h]
    this.ground = scene.add
      .shader(
        {
          name: 'DeepSeabed',
          fragmentSource: SEABED_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uAlbedo', 0)
            set('uGeo', 1)
            set('uNorm', 2)
            set('uGlow', 3)
            set('uRect', rect)
            set('uField0', rect)
            set('uHeight', [HEIGHT_RANGE.lo, HEIGHT_RANGE.span])
            set('uMpp', cfg.meterPerU / UNIT)
            set('uBell', u.bell)
            set('uLamp[0]', u.lamp)
            set('uLampDir[0]', u.dir)
            set('uLampCount', u.count)
            set('uSky', SKY)
            set('uGlowGain', GLOW_GAIN)
            set('uExposure', EXPOSURE)
          },
        },
        FRAME.x,
        FRAME.y,
        FRAME.w,
        FRAME.h,
        [ALBEDO_KEY, GEO_KEY, NORM_KEY, GLOW_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(-1)
    this.visuals.push(this.ground)
    this.ring = scene.add.graphics().setDepth(-0.5)
    this.lampHalo = scene.add.image(0, 0, HALO_KEY).setDepth(30.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xbfe8ff)
    this.bell = scene.add.image(0, 0, BELL_KEY).setDepth(31)
    this.cable = scene.add.graphics().setDepth(31.5)
    this.visuals.push(this.ring, this.lampHalo, this.bell, this.cable)
    this.phase = s.bell.phase
    this.seedSnow(v)
    v.lens.screen.vignette(0.72, 0.3, 0x010510)
  }

  /** 镜头拍到的世界范围的正中，像素：透视从这里往外推 */
  private eye(v: ViewCtx): Point {
    const r = v.lens.screen.view()
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.deep
    if (!s || !this.ground || !this.relief) return
    const cfg = v.def.deep!
    const dt = Math.min(delta, 100) / 1000
    const now = sim.elapsedMs
    const eye = this.eye(v)
    this.lamps(sim, s, cfg, now)
    this.stepGlow(sim, dt)
    this.drawBell(sim, s, cfg, eye, now)
    this.sounds(s.bell)
    this.emit(v, sim, s, cfg, dt, now)
    this.stepBubbles(dt, eye)
    this.stepSnow(v, dt, eye)
  }

  /** 钟上的探照灯与队员的头灯：位置、高度、亮度交给着色器；钟预兆时灯一闪一闪 */
  private lamps(sim: Sim, s: DeepState, cfg: DeepConfig, now: number): void {
    const b = s.bell
    const plan = s.plan
    const floor = seabedM(plan, b.x / UNIT, b.y / UNIT)
    const flicker = b.phase === 'warn' ? 0.72 + 0.28 * Math.abs(Math.sin(now / 90)) * (Math.sin(now / 37) > -0.6 ? 1 : 0.4) : 1
    const power = BELL_LAMP * flicker
    const u = this.u
    u.bell[0] = b.x
    u.bell[1] = b.y
    u.bell[2] = floor + b.h - 0.2
    u.bell[3] = power
    this.lit.x = b.x
    this.lit.y = b.y
    this.lit.power = (power / BELL_LAMP) * (1 - smooth(cfg.bell.hangM + 2, cfg.bell.liftM, b.h) * 0.85)
    this.ready = true
    let n = 0
    for (const m of sim.characters) {
      if (!Alive.v[m] || n >= MAX_LAMPS) continue
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      const a = facingAngle(sim, m)
      u.lamp.set([x, y, groundM(this.relief!, x / UNIT, y / UNIT) + HEAD_LAMP_M, HEAD_LAMP], n * 4)
      u.dir.set([Math.cos(a), Math.sin(a), 0, 0], n * 4)
      n++
    }
    u.count = n
  }

  /** 冷光：整片按时间常数暗下去，游得快的身体与飞过的弹体沿路把水搅亮 */
  private stepGlow(sim: Sim, dt: number): void {
    const g = this.glow
    if (!g) return
    const n = g.n
    const fade = Math.exp(-dt / GLOW_TAU)
    const f = g.v
    for (let i = 0; i < f.length; i++) f[i] = f[i]! * fade
    const stamp = (x: number, y: number, amount: number): void => {
      const gx = (x / UNIT) * GLOW_PPU - 0.5
      const gy = (y / UNIT) * GLOW_PPU - 0.5
      const ix = Math.floor(gx)
      const iy = Math.floor(gy)
      if (ix < 0 || iy < 0 || ix >= n - 1 || iy >= n - 1) return
      const fx = gx - ix
      const fy = gy - iy
      const i = iy * n + ix
      f[i] = f[i]! + amount * (1 - fx) * (1 - fy)
      f[i + 1] = f[i + 1]! + amount * fx * (1 - fy)
      f[i + n] = f[i + n]! + amount * (1 - fx) * fy
      f[i + n + 1] = f[i + n + 1]! + amount * fx * fy
    }
    const swim = (eid: number, r: number): void => {
      const sp = Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) / UNIT
      if (sp <= GLOW_SPEED_U) return
      const amount = Math.min(0.6, (sp - GLOW_SPEED_U) * GLOW_BODY * dt * (0.6 + r / UNIT))
      stamp(Transform.x[eid]!, Transform.y[eid]!, amount)
    }
    for (const m of sim.characters) if (Alive.v[m]) swim(m, 0.4 * UNIT)
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e]) swim(e, 0.4 * UNIT)
    for (const p of query(sim.world, PROJ_SET)) {
      const ax = PrevPos.x[p]!
      const ay = PrevPos.y[p]!
      const bx = Transform.x[p]!
      const by = Transform.y[p]!
      const len = Math.hypot(bx - ax, by - ay)
      const k = Math.min(12, Math.ceil(len / (0.2 * UNIT)))
      for (let j = 1; j <= k; j++) stamp(ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k, GLOW_SHOT / k)
    }
    const d = g.img.data
    for (let i = 0; i < f.length; i++) {
      const v = Math.min(1, f[i]!)
      f[i] = v
      d[i * 4] = v * 255
      d[i * 4 + 1] = 0
      d[i * 4 + 2] = 0
      d[i * 4 + 3] = 255
    }
    g.tex.getContext().putImageData(g.img, 0, 0)
    refreshLinear(g.tex)
  }

  /** 钟按透视画在钟口往上一半高处，靠近画面中间的盖住队员时淡下去；缆绳从顶上一直往上没进黑暗；地上那一圈是喘得上气的地方，吊走时圈在新落点 */
  private drawBell(sim: Sim, s: DeepState, cfg: DeepConfig, eye: Point, now: number): void {
    const b = s.bell
    const img = this.bell!
    const halo = this.lampHalo!
    const cable = this.cable!
    const ring = this.ring!
    const R = airRadius(cfg)
    const floor = seabedM(s.plan, b.x / UNIT, b.y / UNIT)
    const sway = b.phase === 'warn' ? Math.sin(now / 70) * 0.06 * UNIT : Math.sin(now / 2300) * 0.04 * UNIT
    const at = (h: number): { x: number; y: number; k: number } => {
      const k = CAM_M / Math.max(0.5, CAM_M - (floor + h))
      return { x: eye.x + (b.x + sway - eye.x) * k, y: eye.y + (b.y - eye.y) * k, k }
    }
    const mid = at(b.h + BELL_TALL_M * 0.5)
    const lead = sim.leader
    const near = Math.hypot(Transform.x[lead]! - b.x, Transform.y[lead]! - b.y)
    const high = smooth(cfg.bell.hangM + 3, cfg.bell.hangM + 9, b.h)
    img
      .setPosition(mid.x, mid.y)
      .setDisplaySize(R * 2 * BELL_SIZE * mid.k, R * 2 * BELL_SIZE * mid.k)
      .setRotation(Math.sin(now / 3100) * 0.03)
      .setAlpha((0.3 + 0.62 * smooth(R * 0.5, R * 1.3, near)) * (1 - high))
      .setVisible(high < 1)
    const rim = at(b.h)
    halo
      .setPosition(rim.x, rim.y)
      .setScale((R * 3.2 * rim.k) / 64)
      .setAlpha(0.22 * this.lit.power * (1 - high))
    cable.clear()
    const top = b.h + BELL_TALL_M
    let prev = at(top)
    for (let i = 1; i <= 12; i++) {
      const h = top + ((CAM_M * 0.82 - floor - top) * i) / 12
      const p = at(h)
      cable.lineStyle(Math.max(1.5, 0.05 * UNIT * p.k), 0x2a2f36, 0.85 * (1 - i / 13) * (1 - high * 0.6))
      cable.lineBetween(prev.x, prev.y, p.x, p.y)
      prev = p
    }
    ring.clear()
    const breath = breathable(b)
    const cx = breath ? b.x : b.toX
    const cy = breath ? b.y : b.toY
    const dashes = 28
    const spin = now / (breath ? 6000 : 1500)
    ring.lineStyle(0.07 * UNIT, breath ? 0x7fe3ff : 0xffd54f, breath ? 0.42 + 0.12 * Math.sin(now / 400) : 0.3 + 0.25 * Math.abs(Math.sin(now / 250)))
    for (let i = 0; i < dashes; i++) {
      const a0 = spin + (i / dashes) * Math.PI * 2
      ring.beginPath()
      ring.arc(cx, cy, R, a0, a0 + (Math.PI * 2) / dashes / 1.8)
      ring.strokePath()
    }
  }

  /** 钟每进一段响一声：预兆时缆绳一紧、钟里的气咕嘟往外涌，放稳时铛的一声 */
  private sounds(b: Bell): void {
    if (b.phase === this.phase) return
    this.phase = b.phase
    if (b.phase === 'warn') {
      playSfx('creak')
      playSfx('bubble')
    } else if (b.phase === 'hoist') playSfx('bubble')
    else if (b.phase === 'down') playSfx('clank')
  }

  /** 冒气泡：钟口一圈平时慢慢冒、预兆时猛冒、吊起那一下涌出一大团；钟底下换气的队员呼出一串；呛水的一串串往上冒；冷泉冒甲烷 */
  private emit(v: ViewCtx, sim: Sim, s: DeepState, cfg: DeepConfig, dt: number, now: number): void {
    const b = s.bell
    const R = airRadius(cfg)
    const screen = v.lens.screen
    const floorAt = (x: number, y: number): number => seabedM(s.plan, x / UNIT, y / UNIT)
    const rate = b.phase === 'down' ? 2 : b.phase === 'warn' ? 18 : b.phase === 'hoist' ? 10 : 0
    this.bubbleDebt += rate * dt
    if (screen.sees(b.x, b.y, 6 * UNIT)) {
      while (this.bubbleDebt >= 1) {
        this.bubbleDebt -= 1
        const a = Math.random() * Math.PI * 2
        this.spawnBubble(v, b.x + Math.cos(a) * R * 0.95, b.y + Math.sin(a) * R * 0.95, floorAt(b.x, b.y) + b.h, 0.03 + Math.random() * 0.05)
      }
    } else this.bubbleDebt = 0
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      const h = floorAt(x, y) + 1.5
      if (underBell(cfg, b, x, y)) {
        const at = this.exhaleAt.get(Uid.v[m]!) ?? 0
        if (now < at) continue
        this.exhaleAt.set(Uid.v[m]!, now + 1800 + Math.random() * 1200)
        for (let i = 0; i < 3; i++) this.spawnBubble(v, x + (Math.random() - 0.5) * 8, y - 0.2 * UNIT, h, 0.02 + Math.random() * 0.03)
      } else if (staminaLeft(m) <= 0) {
        if (Math.random() < dt * 9) this.spawnBubble(v, x + (Math.random() - 0.5) * 10, y - 0.2 * UNIT, h, 0.03 + Math.random() * 0.05)
        if (now >= this.gurgleAt && screen.sees(x, y)) {
          this.gurgleAt = now + GURGLE_MS
          playSfx('gurgle')
        }
      }
    }
    this.seepDebt += s.plan.seeps.length * 3 * dt
    while (this.seepDebt >= 1) {
      this.seepDebt -= 1
      const q = s.plan.seeps[Math.floor(Math.random() * s.plan.seeps.length)]!
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * q.r * 0.45 * UNIT
      const x = q.x * UNIT + Math.cos(a) * r
      const y = q.y * UNIT + Math.sin(a) * r
      if (screen.sees(x, y, 3 * UNIT)) this.spawnBubble(v, x, y, floorAt(x, y), 0.015 + Math.random() * 0.03)
    }
  }

  private spawnBubble(v: ViewCtx, x: number, y: number, h: number, r: number): void {
    if (this.bubbles.length >= BUBBLE_MAX) return
    const img = this.spare.pop() ?? v.scene.add.image(0, 0, BUBBLE_KEY).setDepth(32)
    img.setVisible(true)
    this.bubbles.push({ x, y, h, vh: BUBBLE_RISE_MS * (0.75 + Math.random() * 0.5) * (0.7 + r * 6), r, phase: Math.random() * 6.28, age: 0, img })
  }

  /** 气泡一边往上升一边左右晃，按透视画：越高越大、越往画面外偏，升高了就散了 */
  private stepBubbles(dt: number, eye: Point): void {
    const kept: Bubble[] = []
    for (const q of this.bubbles) {
      q.age += dt
      q.h += q.vh * dt
      q.phase += dt * 7
      q.x += Math.sin(q.phase) * 6 * dt
      if (q.h >= BUBBLE_TOP_M) {
        q.img.setVisible(false)
        this.spare.push(q.img)
        continue
      }
      const k = CAM_M / Math.max(0.5, CAM_M - q.h)
      const size = (q.r / 0.5) * UNIT * 2 * k
      q.img
        .setPosition(eye.x + (q.x - eye.x) * k, eye.y + (q.y - eye.y) * k)
        .setDisplaySize(size * (1 + 0.08 * Math.sin(q.phase * 1.7)), size * (1 - 0.08 * Math.sin(q.phase * 1.7)))
        .setAlpha(smooth(0, 0.15, q.age) * (1 - smooth(BUBBLE_TOP_M * 0.45, BUBBLE_TOP_M, q.h)) * 0.8)
        .setTint(this.lightTint(q.x, q.y))
      kept.push(q)
    }
    this.bubbles = kept
  }

  /** 气泡与海雪被灯照到多少：离钟的灯近的偏暖白，远的只剩一点深蓝 */
  private lightTint(x: number, y: number): number {
    const l = this.lit
    const d = Math.hypot(x - l.x, y - l.y) / UNIT
    const k = clamp01(l.power * Math.exp(-(d * d) / 40))
    const r = Math.round(60 + 195 * k)
    const g = Math.round(110 + 140 * k)
    const b = Math.round(170 + 85 * k)
    return (r << 16) | (g << 8) | b
  }

  /** 海雪：在镜头拍到的那一柱水里撒开，离谷底高高低低 */
  private seedSnow(v: ViewCtx): void {
    const scene = v.scene
    const eye = this.eye(v)
    const view = v.lens.screen.view()
    for (let i = 0; i < SNOW; i++) {
      const img = scene.add.image(0, 0, FLAKE_KEY).setDepth(33)
      this.visuals.push(img)
      const f: Flake = { x: 0, y: 0, h: 0, vx: 0, vy: 0, r: 0.04 + Math.random() * 0.06, phase: Math.random() * 6.28, img }
      this.respawnFlake(f, eye, view, Math.random())
      this.snow.push(f)
    }
  }

  /** 把一片海雪放回镜头里：挑屏幕上的一点，按它的高度反推回世界里 */
  private respawnFlake(f: Flake, eye: Point, view: { x: number; y: number; w: number; h: number }, height: number): void {
    f.h = SNOW_LO_M + (SNOW_HI_M - SNOW_LO_M) * height
    const k = CAM_M / (CAM_M - f.h)
    const sx = view.x + (Math.random() * 1.2 - 0.1) * view.w
    const sy = view.y + (Math.random() * 1.2 - 0.1) * view.h
    f.x = eye.x + (sx - eye.x) / k
    f.y = eye.y + (sy - eye.y) / k
    f.vx = (Math.random() - 0.5) * 0.25 * UNIT
    f.vy = (0.15 + Math.random() * 0.2) * UNIT
  }

  /** 海雪慢慢往下沉、被底流带着漂，按透视画；出了镜头或沉到底就在镜头里别处重新撒 */
  private stepSnow(v: ViewCtx, dt: number, eye: Point): void {
    const view = v.lens.screen.view()
    for (const f of this.snow) {
      f.h -= SNOW_SINK_MS * dt
      f.phase += dt
      f.x += (f.vx + Math.sin(f.phase * 0.7) * 0.06 * UNIT) * dt
      f.y += f.vy * dt
      const k = CAM_M / Math.max(0.5, CAM_M - f.h)
      const sx = eye.x + (f.x - eye.x) * k
      const sy = eye.y + (f.y - eye.y) * k
      if (f.h < SNOW_LO_M || sx < view.x - view.w * 0.15 || sx > view.x + view.w * 1.15 || sy < view.y - view.h * 0.15 || sy > view.y + view.h * 1.15) {
        this.respawnFlake(f, eye, view, f.h < SNOW_LO_M ? 1 : Math.random())
        continue
      }
      const size = (f.r / 0.5) * UNIT * 2 * k
      f.img
        .setPosition(sx, sy)
        .setDisplaySize(size, size)
        .setRotation(f.phase)
        .setAlpha((0.3 + 0.45 * smooth(SNOW_HI_M, SNOW_LO_M, f.h)) * (0.4 + 0.6 * smooth(0, 1, f.h)))
        .setTint(this.lightTint(f.x, f.y))
    }
  }

  /** 立着的身体迎着钟的灯那一面亮，离得越近明暗越分明，再补一层暖白；离灯远的四面一样，只吃头顶那一丝蓝 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const l = this.lit
    if (!this.ready) return
    const dx = l.x - x
    const dy = l.y - y
    const d = Math.hypot(dx, dy)
    const k = clamp01(l.power * 1.4 / (1 + ((d / UNIT) / 4.5) ** 2))
    const nx = d > 1 ? dx / d : 0
    const ny = d > 1 ? dy / d : 0
    out.kx = nx * k
    out.ky = ny * k
    out.fx = nx
    out.fy = ny
    out.color = 0xfff1d6
    out.fill = 0.5 * k
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    for (const q of this.bubbles) q.img.destroy()
    for (const img of this.spare) img.destroy()
    this.bubbles = []
    this.spare = []
    this.snow = []
    this.exhaleAt.clear()
    this.ground = undefined
    this.bell = undefined
    this.lampHalo = undefined
    this.cable = undefined
    this.ring = undefined
    this.glow = undefined
    this.relief = undefined
    this.ready = false
    for (const key of [ALBEDO_KEY, GEO_KEY, NORM_KEY, GLOW_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
