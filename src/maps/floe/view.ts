import Phaser from 'phaser'
import { hasComponent } from 'bitecs'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { decorSprite } from '../../ecs/decor'
import type { EcsAtlas } from '../../ecs/atlas'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import { Alive, Pickup, Transform, Uid, VisOff } from '../../ecs/components'
import { canvasTexture } from '../textures'
import { edgeAt, floeFor, GRAVITY as FLOE_GRAVITY, inWater, SWIMMING, windAt } from './model'
import type { FloeField, FloeState } from './model'
import { FLOE_PPU, floeFrame, floeHeights, LIGHT } from './render'
import type { FloeCanvas } from './render'
import { drawLee, drawSeaNoise, drawShore, FLOE_SEA_FRAG, LEE_CELL_U, NOISE_TILE, SEA_N, WindSea } from './sea'
import { FloePainter } from './painter'
import type { FloeConfig } from '../../types/maps'
import { playSfx } from '../../audio/sfx'
import type { Framing } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'

/** 这一局的浮冰：布景种子定下的形状，视图排版时就要用到 */
function floeField(v: ViewCtx): FloeField {
  return floeFor(v.run.decorSeed, v.def.floe!)
}

const FLOE_SEA = 0x061820
const FLOE_KEY = 'floe-ice'
const SHORE_KEY = 'floe-shore'
const LEE_KEY = 'floe-lee'
const SEA_NOISE_KEY = 'floe-noise'
const SEA_LONG_KEY = 'floe-sea-long'
const SEA_SHORT_KEY = 'floe-sea-short'
const FROST_KEY = 'floe-frost'
/** 霜那张图长边多少像素 */
const FROST_PX = 960
/** 开局最多几个线程分着画冰面 */
const FLOE_THREADS = 4
/** 风速过了 DRIFT_FROM_MS（米/秒）雪才扬得起来，扬起的雪按超出的部分的三次方变多，超出 DRIFT_SPAN_MS 时每格每秒撒 1.1 粒 */
const DRIFT_FROM_MS = 4.5
const DRIFT_SPAN_MS = 8.5
/** 风浪图隔多久（毫秒）重算一次 */
const SEA_FRAME_MS = 33
/** 涌浪的波长，格：深水里按色散关系定周期 */
const SWELL_U = 75
/** 落水的人浮着时露在水面上的部分占贴图高度的比例 */
const AFLOAT = 0.46

/** 一粒被风吹着跑的雪：贴地的拖成一道短线，飞起来的是一个小点 */
interface Flake {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  high: boolean
}

/** 水面上的一圈波纹 */
interface Ripple {
  x: number
  y: number
  r0: number
  r1: number
  age: number
  life: number
  alpha: number
}

/** 溅起的一滴水：往外飞、往上抛，按重力落回去 */
interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  /** 离水面多高，米；vz 是往上的速度，米/秒 */
  z: number
  vz: number
  age: number
  life: number
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，高分屏开了 pixelArt 就是最近点，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/**
 * 屏幕四边结起的霜：贴着边是一层厚薄不匀的白霜，角上最厚；霜上长出一丛丛羽毛似的冰花，
 * 主干微微打弯，两侧按六十度一路长出细刺，越往梢越短越淡
 */
function drawFrost(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = new Rng(0xf205)
  const m = Math.min(w, h)
  ctx.clearRect(0, 0, w, h)
  /** 四边上的一点：越靠角越容易取到 */
  const rim = (k: number): { x: number; y: number; inward: number; corner: number } => {
    const side = k % 4
    const u = r.next()
    const t = r.next() < 0.5 ? u * u * 0.5 : 1 - u * u * 0.5
    const x = side < 2 ? t * w : side === 2 ? 0 : w
    const y = side === 0 ? 0 : side === 1 ? h : t * h
    const inward = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI
    return { x, y, inward, corner: 1 + 0.8 * Math.max(0, 1 - Math.min(t, 1 - t) / 0.18) }
  }
  for (let k = 0; k < 180; k++) {
    const p = rim(k)
    const rad = m * (0.03 + 0.08 * r.next()) * p.corner
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad)
    g.addColorStop(0, 'rgba(228,241,250,0.3)')
    g.addColorStop(1, 'rgba(228,241,250,0)')
    ctx.fillStyle = g
    ctx.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2)
  }
  ctx.lineCap = 'round'
  const line = (x0: number, y0: number, x1: number, y1: number, width: number, alpha: number): void => {
    ctx.strokeStyle = `rgba(240,249,255,${alpha})`
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  const step = 3
  for (let k = 0; k < 240; k++) {
    const p = rim(k)
    const len = m * (0.03 + 0.07 * r.next()) * p.corner
    const curl = (r.next() - 0.5) * 0.05
    let a = p.inward + (r.next() * 2 - 1) * 0.6
    let x = p.x
    let y = p.y
    const segs = Math.ceil(len / step)
    for (let i = 0; i < segs; i++) {
      const t = i / segs
      const nx = x + Math.cos(a) * step
      const ny = y + Math.sin(a) * step
      line(x, y, nx, ny, 0.5 + 0.9 * (1 - t), 0.5 * (1 - 0.6 * t))
      if (i % 2 === 1) {
        const barb = len * 0.26 * (1 - t) * (0.6 + 0.8 * r.next())
        for (const side of [-1, 1]) {
          const ba = a + side * (Math.PI / 3)
          line(nx, ny, nx + Math.cos(ba) * barb, ny + Math.sin(ba) * barb, 0.9, 0.38 * (1 - 0.7 * t))
        }
      }
      x = nx
      y = ny
      a += curl
    }
  }
}

/**
 * 浮冰：冰面是开局在后台线程画好的一张贴图，压在着色器画的南大洋上；海面铺满方框。
 * 风吹着雪贴地跑，阵风来时雪流变密、飞得更快；有人落水就溅起水花，浮着的人只露出上半身，一圈圈波纹往外扩；
 * 队长泡在冰水里，屏幕四边就结起霜，上了冰慢慢化掉
 */
export class FloeView extends BoundedView {
  private painter?: FloePainter
  private sea?: { sea: WindSea; long: Phaser.Textures.CanvasTexture; short: Phaser.Textures.CanvasTexture; longPx: ImageData; shortPx: ImageData; at: number }
  private readonly u = { time: 0, wind: [1, 0, 0, 0] }
  private low?: Phaser.GameObjects.Graphics
  private high?: Phaser.GameObjects.Graphics
  private wet?: Phaser.GameObjects.Graphics
  private cover?: Phaser.GameObjects.Graphics
  private waterline?: Phaser.GameObjects.Graphics
  private spray?: Phaser.GameObjects.Graphics
  private frost?: Phaser.GameObjects.Image
  private flakes: Flake[] = []
  private ripples: Ripple[] = []
  private drops: Drop[] = []
  private flakeAcc = 0
  private chill = 0
  private gustAt = -Infinity
  private frostAspect = 0
  private readonly rippleAt = new Map<number, number>()

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, FLOE_SEA).setDepth(-3)))
    this.fitFrost(v, viewport.logicalWidth / viewport.logicalHeight)
    this.frost = v.scene.add.image(0, 0, FROST_KEY).setDepth(89).setAlpha(0)
    this.visuals.push(this.frost)
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 装饰只撒在冰上，离冰缘留出它自己的大小 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const f = floeField(v)
    const rng = new Rng(v.run.decorSeed)
    const cells = Math.round(v.w / UNIT)
    for (const d of rollDecor(v.def.decor, () => rng.next(), cells, cells)) {
      if (edgeAt(f, d.xU * UNIT, d.yU * UNIT) < d.sizeU / 2 + 0.3) continue
      v.decor.push(decorSprite(atlas, d.emoji, d.xU * UNIT, d.yU * UNIT, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  /** 冰面交给后台线程画，画完才开战；海面、风雪与水花随后铺上 */
  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.floe
    if (!s) return
    const cfg = v.def.floe!
    const f = s.field
    const scene = v.scene
    const frame = floeFrame(f, FLOE_PPU)
    const heights = floeHeights(f, frame.x0, frame.y0, (frame.w / FLOE_PPU) * UNIT, (frame.h / FLOE_PPU) * UNIT)
    const canvas: FloeCanvas = { cols: f.cols, rows: f.rows, cell: f.cell, edge: f.edge, snow: f.snow, young: f.young, ...heights, ...frame, ppu: FLOE_PPU, windAngle: f.windAngle, seed: f.seed, meterPerU: cfg.meterPerU }
    const painter = new FloePainter(canvas, Math.max(1, Math.min(FLOE_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tex = canvasTexture(scene, FLOE_KEY, frame.w, frame.h)
    const painting = painter.paint((p) => tex.getContext().putImageData(new ImageData(p.pixels, frame.w, p.r1 - p.r0), 0, p.r0))
    // 后台线程画冰面的时候，主线程把海面要用的几张图算好
    const rect = [FRAME.x, FRAME.y, FRAME.w, FRAME.h]
    // 冰缘一圈留不住雪，投影按光冰高出海面的高度算
    const shadeU = (f.freeboard / cfg.meterPerU) * (Math.hypot(LIGHT.x, LIGHT.y) / LIGHT.z)
    canvasTexture(scene, SHORE_KEY, f.cols, f.rows, (ctx) => drawShore(ctx, f, shadeU))
    canvasTexture(scene, LEE_KEY, Math.round(rect[2]! / (LEE_CELL_U * UNIT)), Math.round(rect[3]! / (LEE_CELL_U * UNIT)), (ctx) =>
      drawLee(ctx, f, { x: rect[0]!, y: rect[1]!, w: rect[2]!, h: rect[3]! }, cfg.wind.fetchM / cfg.meterPerU),
    )
    canvasTexture(scene, SEA_NOISE_KEY, NOISE_TILE, NOISE_TILE, (ctx) => drawSeaNoise(ctx, f.seed ^ 0x3a7)).setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT)
    const sea = new WindSea(f.windAngle, f.seed ^ 0x51a, cfg.wind.meanMs, cfg.wind.fetchM, cfg.meterPerU, FLOE_GRAVITY)
    const long = canvasTexture(scene, SEA_LONG_KEY, SEA_N, SEA_N)
    const short = canvasTexture(scene, SEA_SHORT_KEY, SEA_N, SEA_N)
    for (const t of [long, short]) t.setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT)
    await painting
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex)
    this.visuals.push(scene.add.image(frame.x0, frame.y0, FLOE_KEY).setOrigin(0, 0).setDisplaySize((frame.w / FLOE_PPU) * UNIT, (frame.h / FLOE_PPU) * UNIT).setDepth(-1))
    const swellAngle = f.windAngle + (new Rng(f.seed ^ 0x5e11).next() * 2 - 1) * 1.2
    const k = (Math.PI * 2) / SWELL_U
    const omega = Math.sqrt((FLOE_GRAVITY / cfg.meterPerU) * k)
    const flow = [s.current.x / UNIT, s.current.y / UNIT, cfg.meterPerU]
    const seaState = [cfg.wind.fetchM / cfg.meterPerU, sea.peakOmega, sea.sigmaU, cfg.wind.meanMs]
    const tiles = [sea.long.size, sea.short.size, sea.long.omegaMean, sea.short.omegaMean]
    const longScale = [...sea.long.sigma, sea.long.variance / (sea.long.variance + sea.short.variance)]
    const shortScale = [...sea.short.sigma]
    this.sea = { sea, long, short, longPx: new ImageData(SEA_N, SEA_N), shortPx: new ImageData(SEA_N, SEA_N), at: -Infinity }
    this.waves(sim.elapsedMs)
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'FloeSea',
            fragmentSource: FLOE_SEA_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uNoise', 0)
              set('uShore', 1)
              set('uLee', 2)
              set('uLong', 3)
              set('uShort', 4)
              set('uTime', u.time)
              set('uRect', rect)
              set('uGrid', [f.cols * f.cell, f.rows * f.cell, UNIT])
              set('uSun', [LIGHT.x, LIGHT.y, LIGHT.z])
              set('uWind', u.wind)
              set('uSeaState', seaState)
              set('uTiles', tiles)
              set('uLongScale', longScale)
              set('uShortScale', shortScale)
              set('uLeeRect', rect)
              set('uSwell', [Math.cos(swellAngle), Math.sin(swellAngle), k, omega])
              set('uFlow', flow)
            },
          },
          rect[0]!,
          rect[1]!,
          rect[2]!,
          rect[3]!,
          [SEA_NOISE_KEY, SHORE_KEY, LEE_KEY, SEA_LONG_KEY, SEA_SHORT_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-2),
    )
    this.wet = scene.add.graphics().setDepth(-1.5)
    this.low = scene.add.graphics().setDepth(-0.5)
    this.cover = scene.add.graphics().setDepth(8.5).setBlendMode(Phaser.BlendModes.MULTIPLY)
    this.waterline = scene.add.graphics().setDepth(8.6)
    this.spray = scene.add.graphics().setDepth(34)
    this.high = scene.add.graphics().setDepth(36)
    this.visuals.push(this.wet, this.low, this.cover, this.waterline, this.spray, this.high)
    v.lens.screen.vignette(0.8, 0.08, 0x0a1622)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.floe
    if (!s || !this.low) return
    const cfg = v.def.floe!
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    const w = windAt(s.field, cfg, s.gust, now)
    this.u.time = now / 1000
    this.u.wind = [Math.cos(w.angle), Math.sin(w.angle), w.speed, w.level]
    this.waves(now)
    if (s.gust.at !== this.gustAt) {
      this.gustAt = s.gust.at
      if (s.gust.at > 0) playSfx('gust')
    }
    this.blow(v, cfg, w.speed, w.angle, dt)
    for (const p of s.splashes) this.splash(p.x, p.y, p.r, p.sink)
    s.splashes.length = 0
    this.swimmers(v, s, now)
    this.drawWater(dt)
    const lead = sim.leader
    const cold = lead >= 0 && inWater(s, lead, Uid.v[lead]!)
    this.chill = Math.min(1, Math.max(0, this.chill + (cold ? dt / 3 : -dt / 2)))
    const view = v.lens.screen.view()
    this.fitFrost(v, view.w / view.h)
    this.frost?.setAlpha(this.chill * 0.9).setPosition(view.x + view.w / 2, view.y + view.h / 2).setDisplaySize(view.w, view.h)
  }

  /** 霜按镜头的宽高比画：拉伸会把六十度的冰花拉歪 */
  private fitFrost(v: ViewCtx, aspect: number): void {
    if (Math.abs(aspect / this.frostAspect - 1) < 0.05) return
    this.frostAspect = aspect
    const w = Math.round(aspect >= 1 ? FROST_PX : FROST_PX * aspect)
    const h = Math.round(aspect >= 1 ? FROST_PX / aspect : FROST_PX)
    canvasTexture(v.scene, FROST_KEY, w, h, (ctx) => drawFrost(ctx, w, h))
    this.frost?.setTexture(FROST_KEY)
  }

  /** 这一刻的风浪：做一遍逆变换写进两张风浪图，一秒三十次就够看了 */
  private waves(now: number): void {
    const w = this.sea
    if (!w || Math.abs(now - w.at) < SEA_FRAME_MS) return
    w.at = now
    w.sea.frame(now / 1000, w.longPx.data, w.shortPx.data)
    w.long.getContext().putImageData(w.longPx, 0, 0)
    w.short.getContext().putImageData(w.shortPx, 0, 0)
    upload(w.long)
    upload(w.short)
  }

  /** 风吹雪：按风速的三次方在镜头里撒雪，从上风那一侧吹进来；贴地的拖成短线，少数飞起来的是小点 */
  private blow(v: ViewCtx, cfg: FloeConfig, speed: number, angle: number, dt: number): void {
    const cam = v.lens.screen.view()
    const lift = Math.max(0, speed - DRIFT_FROM_MS) / DRIFT_SPAN_MS
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const px = UNIT / cfg.meterPerU
    this.flakeAcc += dt * ((cam.w * cam.h) / (UNIT * UNIT)) * (0.05 + 1.1 * lift * lift * lift)
    for (; this.flakeAcc >= 1; this.flakeAcc--) {
      const high = Math.random() < 0.22
      const pace = speed * (high ? 0.9 : 0.5) * (0.7 + Math.random() * 0.5) * px
      const back = Math.random() * 0.6
      this.flakes.push({
        x: cam.x + Math.random() * cam.w - c * back * cam.w,
        y: cam.y + Math.random() * cam.h - s * back * cam.h,
        vx: c * pace + (Math.random() - 0.5) * 0.4 * px,
        vy: s * pace + (Math.random() - 0.5) * 0.4 * px,
        age: 0,
        life: 0.5 + Math.random() * 0.7,
        high,
      })
    }
    const low = this.low!
    const high = this.high!
    low.clear()
    high.clear()
    const kept: Flake[] = []
    for (const f of this.flakes) {
      f.age += dt
      if (f.age >= f.life) continue
      f.x += f.vx * dt
      f.y += f.vy * dt
      kept.push(f)
      const a = Math.sin((f.age / f.life) * Math.PI)
      if (f.high) {
        high.fillStyle(0xf4f8fc, 0.55 * a)
        high.fillCircle(f.x, f.y, 2.2)
        continue
      }
      const tail = 0.028
      low.lineStyle(1.6, 0xf2f7fb, 0.4 * a)
      low.lineBetween(f.x, f.y, f.x - f.vx * tail, f.y - f.vy * tail)
    }
    this.flakes = kept
  }

  /** 落水溅起水花：两圈波纹、一团白沫、一把往外抛的水珠；金币沉下去只冒一个小圈 */
  private splash(x: number, y: number, r: number, sink: boolean): void {
    if (sink) {
      this.ripples.push({ x, y, r0: r * 0.5, r1: r * 2.4, age: 0, life: 0.7, alpha: 0.5 })
      playSfx('plip')
      return
    }
    playSfx('splash')
    this.ripples.push({ x, y, r0: r * 0.8, r1: r * 4.5, age: 0, life: 1.1, alpha: 0.75 }, { x, y, r0: r * 0.4, r1: r * 3, age: 0, life: 1.6, alpha: 0.45 })
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = (1 + Math.random() * 2.5) * UNIT
      this.drops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, z: 0.05, vz: 2.2 + Math.random() * 2.2, age: 0, life: 0.9 })
    }
  }

  /** 泡在水里的身体：水线以下染成海水的颜色（正片叠底，看得出没在水里），水线上一圈浅浅的反光随浮沉起落，隔一阵往外扩一圈波纹 */
  private swimmers(v: ViewCtx, s: FloeState, now: number): void {
    const g = this.cover!
    const line = this.waterline!
    g.clear()
    line.clear()
    for (const [eid, foot] of s.feet) {
      if (foot.mode !== SWIMMING || Uid.v[eid] !== foot.uid || !hasComponent(v.world, eid, Transform) || hasComponent(v.world, eid, Pickup)) continue
      if (hasComponent(v.world, eid, Alive) && !Alive.v[eid]) continue
      const w = Transform.w[eid]!
      const h = Transform.h[eid]!
      if (w <= 0 || h <= 0) continue
      const x = Transform.x[eid]! + VisOff.x[eid]!
      const bob = Math.sin(now / 420 + eid * 1.7) * h * 0.035
      const top = Transform.y[eid]! + VisOff.y[eid]! + bob + h * (0.5 - AFLOAT)
      const bottom = Transform.y[eid]! + VisOff.y[eid]! + h * 0.5
      g.fillStyle(0x2f7480, 1)
      g.fillEllipse(x, (top + bottom) / 2, w * 1.05, (bottom - top) * 1.08)
      line.lineStyle(2, 0xd9f1f4, 0.55)
      line.strokeEllipse(x, top + h * 0.04, w * 1.02, h * 0.2)
      const last = this.rippleAt.get(eid) ?? 0
      if (now - last > 1100) {
        this.rippleAt.set(eid, now)
        this.ripples.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, r0: w * 0.5, r1: w * 1.25, age: 0, life: 1.2, alpha: 0.22 })
      }
    }
    if (this.rippleAt.size > 256) this.rippleAt.clear()
  }

  /** 波纹、白沫与水珠 */
  private drawWater(dt: number): void {
    const g = this.wet!
    const sp = this.spray!
    g.clear()
    sp.clear()
    const keep: Ripple[] = []
    for (const r of this.ripples) {
      r.age += dt
      if (r.age >= r.life) continue
      keep.push(r)
      const t = r.age / r.life
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t))
      g.lineStyle(1.8 * (1 - t) + 0.8, 0xd8f0f4, r.alpha * (1 - t))
      g.strokeEllipse(r.x, r.y, rad * 2, rad * 1.7)
      if (r.alpha > 0.6 && t < 0.6) {
        g.fillStyle(0xeef7f9, 0.5 * (1 - t / 0.6))
        g.fillCircle(r.x, r.y, r.r0 * (1.1 + t))
      }
    }
    this.ripples = keep
    const drops: Drop[] = []
    for (const d of this.drops) {
      d.age += dt
      d.vz -= FLOE_GRAVITY * dt
      d.z += d.vz * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.age >= d.life || d.z < 0) continue
      drops.push(d)
      sp.fillStyle(0xe6f6fa, 0.85 * (1 - d.age / d.life))
      sp.fillCircle(d.x, d.y - d.z * LIFT_PER_M, 2.6)
    }
    this.drops = drops
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    this.low = undefined
    this.high = undefined
    this.wet = undefined
    this.cover = undefined
    this.waterline = undefined
    this.spray = undefined
    this.frost = undefined
    this.flakes = []
    this.ripples = []
    this.drops = []
    this.rippleAt.clear()
    this.sea = undefined
    for (const key of [FLOE_KEY, SHORE_KEY, LEE_KEY, SEA_NOISE_KEY, SEA_LONG_KEY, SEA_SHORT_KEY, FROST_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
