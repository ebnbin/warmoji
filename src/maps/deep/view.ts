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
import { groundM, HEIGHT_RANGE, paintScene, RELIEF_PPU } from './ground'
import { seabedM } from './layout'
import { DeepPainter } from './painter'
import { MAX_LAMPS, SEABED_FRAG } from './shader'
import { doorFrame, drawBubble, drawDoor, drawFlake, drawHalo, drawSub, drawSubShadow, shadowFrame, subFrame } from './sprites'
import { breathable, fromHull, hullOf } from './sub'
import { breathesAt, grounded } from './world'
import type { SubFrame } from './sprites'
import type { Hull, Pose, Sub, SubPhase } from './sub'
import type { PaintScene } from './ground'
import type { DeepState } from './world'
import type { DeepConfig } from '../../types/maps'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { ViewCtx } from '../../ecs/views'
import type { Point } from '../../util/vec'

const BG = 0x061a30
const ALBEDO_KEY = 'deep-albedo'
const GEO_KEY = 'deep-geo'
const NORM_KEY = 'deep-norm'
const GLOW_KEY = 'deep-glow'
const SUB_KEY = 'deep-sub'
const DOOR_KEY = 'deep-sub-door'
const SHADOW_KEY = 'deep-sub-shadow'
const BUBBLE_KEY = 'deep-bubble'
const HALO_KEY = 'deep-halo'
const FLAKE_KEY = 'deep-flake'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 透视镜头离开局站位那片谷底多高，米：浮起来的潜艇与海雪离谷底越高，在画面上越大、越往画面外偏 */
const CAM_M = 20
/** 潜艇的贴图每格多少像素 */
const SUB_PPU = 96
/** 队员的头离脚多高（格）：呼出的气泡从这里冒 */
const HEAD_U = 0.9
/** 灯的亮度（给着色器的量，与照到的距离平方相除）：潜艇门上的灯、艇首的探照灯、队员的头灯；门上的灯在门外几格、离谷底几米，头灯举多高（米） */
const DOOR_LAMP = 24
const FLOOD_LAMP = 4
const HEAD_LAMP = 1.6
const DOOR_LAMP_U = 1
const DOOR_LAMP_M = 2.2
const HEAD_LAMP_M = 1.3
/** 头顶透下来的那层幽蓝的微光，三色 */
const SKY = [0.07, 0.2, 0.5] as const
const EXPOSURE = 1.5
/** 冷光：每格几个格子，衰减的时间常数（秒），身体游多快（格/秒）才搅亮水，搅亮多少；弹体一路拖出多亮的尾巴 */
const GLOW_PPU = 4
const GLOW_TAU = 0.75
const GLOW_SPEED_U = 1.4
const GLOW_BODY = 2.4
const GLOW_SHOT = 0.22
const GLOW_GAIN = 1.1
/** 气泡：最多同时几个，往上升多快（格/秒），最多升多高就散了（格） */
const BUBBLE_MAX = 160
const BUBBLE_RISE_U = 1.2
const BUBBLE_TOP_U = 5
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

/** 一个气泡：x、y 是它底下地上的位置，up 是它画得比地上高多少格，从 from 升到 end 就散了；r 是半径（格） */
interface Bubble {
  x: number
  y: number
  up: number
  vup: number
  readonly from: number
  readonly end: number
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
 * 深海：谷底是开局在后台线程画好的固有色与高度，光照由着色器逐点算——头顶透下一层幽蓝的微光，整片谷底看得清个大概；潜艇门上的灯、艇首的探照灯与队员的头灯照出一圈圈暖白，
 * 光在水里走得越远越只剩青蓝，灯四周罩着一团泛青的光晕；被搅动的浮游生物发出蓝绿的冷光，游过的身体与飞过的子弹身后拖着一道道光痕。
 * 潜艇停在谷底上时贴着地画、压在所有身体后面，门开着时门洞透光、踏板放在谷底上；浮起来按透视越画越大、越往画面外偏，暗下去变淡，
 * 过了身体的头顶就画到身体前面。门口那一片喘得上气的半圆画一道虚线，开走时连同艇身的轮廓画在新落点。气泡像身体一样立着画，离地越高画得越往上；
 * 海雪按透视画。呛水的队员一串串冒泡
 */
export class DeepView extends BoundedView {
  private painter?: DeepPainter
  private relief?: PaintScene
  private ground?: Phaser.GameObjects.Shader
  private readonly u = {
    door: [0, 0, 0, 0],
    lamp: new Float32Array(MAX_LAMPS * 4),
    dir: new Float32Array(MAX_LAMPS * 4),
    count: 0,
  }
  private glow?: { tex: Phaser.Textures.CanvasTexture; img: ImageData; v: Float32Array; n: number }
  private sub?: Phaser.GameObjects.Image
  private door?: Phaser.GameObjects.Image
  private shadow?: Phaser.GameObjects.Image
  private doorGlow?: Phaser.GameObjects.Image
  private zone?: Phaser.GameObjects.Graphics
  private bubbles: Bubble[] = []
  private spare: Phaser.GameObjects.Image[] = []
  private snow: Flake[] = []
  private phase: SubPhase = 'down'
  private exhaleAt = new Map<number, number>()
  private gurgleAt = 0
  private doorDebt = 0
  private ventDebt = 0
  private seepDebt = 0
  /** 这一帧潜艇门上的灯在哪、多亮：单位、气泡与海雪按它分明暗 */
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
    const hull = hullOf(v.def.deep!.sub)
    const art = (key: string, f: SubFrame, draw: (ctx: CanvasRenderingContext2D, h: Hull, f: SubFrame, ppu: number) => void): void => {
      if (!scene.textures.exists(key)) canvasTexture(scene, key, Math.ceil(f.w * SUB_PPU), Math.ceil(f.h * SUB_PPU), (ctx) => draw(ctx, hull, f, SUB_PPU))
    }
    art(SUB_KEY, subFrame(hull), drawSub)
    art(DOOR_KEY, doorFrame(hull), drawDoor)
    art(SHADOW_KEY, shadowFrame(hull), drawSubShadow)
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
            set('uDoor', u.door)
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
    const pin = (key: string, f: SubFrame): Phaser.GameObjects.Image => scene.add.image(0, 0, key).setOrigin(-f.u0 / f.w, -f.v0 / f.h).setScale(UNIT / SUB_PPU)
    this.shadow = pin(SHADOW_KEY, shadowFrame(s.hull)).setDepth(-0.6)
    this.zone = scene.add.graphics().setDepth(-0.5)
    // 停在谷底上的潜艇、门与门口的光画在所有身体后面：艇身只挡住它压着的地方，不挡站在旁边的身体
    this.sub = pin(SUB_KEY, subFrame(s.hull)).setDepth(0.9)
    this.door = pin(DOOR_KEY, doorFrame(s.hull)).setDepth(0.92)
    this.doorGlow = scene.add.image(0, 0, HALO_KEY).setDepth(0.95).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd9a0)
    this.visuals.push(this.shadow, this.zone, this.sub, this.door, this.doorGlow)
    this.phase = s.sub.phase
    this.seedSnow(v)
    v.lens.screen.vignette(0.75, 0.2, 0x03101f)
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
    this.drawSub(s, cfg, eye, now)
    this.drawZone(s, cfg, now)
    this.sounds(s.sub)
    this.emit(v, sim, s, cfg, dt, now, eye)
    this.stepBubbles(dt)
    this.stepSnow(v, dt, eye)
  }

  /**
   * 潜艇门上的灯、艇首的两盏探照灯与队员的头灯：位置、高度、亮度交给着色器。门开着时门上的灯照着门前那一片；
   * 预兆时灯一闪一闪；开走时门上的灯换成艇底的灯，跟着艇照下来，越高越暗
   */
  private lamps(sim: Sim, s: DeepState, cfg: DeepConfig, now: number): void {
    const sub = s.sub
    const h = s.hull
    const floor = seabedM(s.plan, sub.x / UNIT, sub.y / UNIT)
    const flicker = sub.phase === 'warn' ? 0.72 + 0.28 * Math.abs(Math.sin(now / 90)) * (Math.sin(now / 37) > -0.6 ? 1 : 0.4) : 1
    const high = smooth(0, cfg.sub.cruiseM, sub.h)
    const open = breathable(sub)
    const at = open ? fromHull(sub, h.door, h.r + DOOR_LAMP_U) : { x: sub.x, y: sub.y }
    const power = DOOR_LAMP * flicker * (open ? 1 : 0.45 * (1 - 0.6 * high))
    const u = this.u
    u.door[0] = at.x
    u.door[1] = at.y
    u.door[2] = floor + (open ? DOOR_LAMP_M : sub.h + 0.3)
    u.door[3] = power
    this.lit.x = at.x
    this.lit.y = at.y
    this.lit.power = power / DOOR_LAMP
    this.ready = true
    let n = 0
    for (const side of [-1, 1]) {
      const p = fromHull(sub, h.bow + h.r * 0.12, side * h.r * 0.74)
      u.lamp.set([p.x, p.y, floor + sub.h + 1, FLOOD_LAMP * flicker * (1 - 0.7 * high)], n * 4)
      u.dir.set([Math.cos(sub.a), Math.sin(sub.a), 0, 0], n * 4)
      n++
    }
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

  /** 停在谷底上的潜艇贴着地画；浮起来按透视越画越大、越往画面外偏，暗下去变淡，过了身体的头顶就画到身体前面；预兆时艇身一抖一抖。门开着时画门洞与踏板，门口罩一团暖光 */
  private drawSub(s: DeepState, cfg: DeepConfig, eye: Point, now: number): void {
    const sub = s.sub
    const floor = seabedM(s.plan, sub.x / UNIT, sub.y / UNIT)
    const k = (CAM_M - floor) / Math.max(0.5, CAM_M - floor - sub.h)
    const x = eye.x + (sub.x - eye.x) * k
    const y = eye.y + (sub.y - eye.y) * k
    const high = smooth(0, cfg.sub.cruiseM, sub.h)
    const shake = sub.phase === 'warn' ? Math.sin(now / 45) * 0.012 : 0
    const dark = Math.round(255 * (1 - 0.72 * high))
    this.sub!
      .setPosition(x, y)
      .setRotation(sub.a + shake)
      .setScale((UNIT / SUB_PPU) * k)
      .setTint((dark << 16) | (dark << 8) | Math.round(255 * (1 - 0.5 * high)))
      .setAlpha(1 - 0.45 * high)
      .setDepth(grounded(sub) ? 0.9 : 31)
    const open = breathable(sub)
    this.door!.setVisible(open).setPosition(x, y).setRotation(sub.a + shake)
    this.shadow!.setPosition(sub.x, sub.y).setRotation(sub.a).setAlpha(0.55 * (1 - smooth(0, 2.5, sub.h)))
    const glow = fromHull(sub, s.hull.door, s.hull.r + 0.55)
    this.doorGlow!.setVisible(open).setPosition(glow.x, glow.y).setScale((2.6 * UNIT) / 64).setAlpha(0.32 * this.lit.power)
  }

  /** 门口那一片喘得上气的半圆画一道虚线，底下垫一道深色的边，亮处也看得清：停着时画在门口，青色；开走时连同艇身的轮廓画在新落点，黄色闪着 */
  private drawZone(s: DeepState, cfg: DeepConfig, now: number): void {
    const g = this.zone!.clear()
    const open = breathable(s.sub)
    const p: Pose = open ? s.sub : s.sub.to
    const h = s.hull
    const c = fromHull(p, h.door, h.r)
    const face = p.a + Math.PI / 2
    const R = cfg.sub.doorU * UNIT
    const n = 14
    const step = Math.PI / n
    const shift = ((now / (open ? 6000 : 1500)) % 1) * step
    const rim = open ? [] : s.rim.map((q) => fromHull(p, q.u, q.v))
    const dash = 0.32 * UNIT
    const gap = 0.24 * UNIT
    const draw = (): void => {
      for (let i = -1; i < n; i++) {
        const a0 = Math.max(face - Math.PI / 2, face - Math.PI / 2 + i * step + shift)
        const a1 = Math.min(face + Math.PI / 2, face - Math.PI / 2 + i * step + shift + step / 1.8)
        if (a1 <= a0) continue
        g.beginPath()
        g.arc(c.x, c.y, R, a0, a1)
        g.strokePath()
      }
      const period = dash + gap
      const offset = ((now / 1500) % 1) * period
      let s0 = 0
      for (let i = 0; i < rim.length; i++) {
        const a = rim[i]!
        const b = rim[(i + 1) % rim.length]!
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const s1 = s0 + len
        for (let k = Math.floor((s0 - offset) / period); len > 0 && offset + k * period < s1; k++) {
          const d0 = (Math.max(s0, offset + k * period) - s0) / len
          const d1 = (Math.min(s1, offset + k * period + dash) - s0) / len
          if (d1 > d0) g.lineBetween(a.x + (b.x - a.x) * d0, a.y + (b.y - a.y) * d0, a.x + (b.x - a.x) * d1, a.y + (b.y - a.y) * d1)
        }
        s0 = s1
      }
    }
    g.lineStyle(0.15 * UNIT, 0x020c1a, 0.45)
    draw()
    g.lineStyle(0.08 * UNIT, open ? 0x7fe3ff : 0xffd54f, open ? 0.75 + 0.2 * Math.sin(now / 400) : 0.55 + 0.4 * Math.abs(Math.sin(now / 250)))
    draw()
  }

  /** 潜艇每进一段响一声：预兆时声呐一响、艇身一紧；浮起来排出一大团气；落稳时铛的一声 */
  private sounds(sub: Sub): void {
    if (sub.phase === this.phase) return
    this.phase = sub.phase
    if (sub.phase === 'warn') {
      playSfx('sonar')
      playSfx('creak')
    } else if (sub.phase === 'rise') playSfx('bubble')
    else if (sub.phase === 'down') playSfx('clank')
  }

  /**
   * 冒气泡：门口一直漏着一点、预兆时猛冒；预兆时艇背上的排气口喷出一大团，浮起来时艇身四周拖着一串串；门口换气的队员呼出一串；
   * 呛水的一串串往上冒；冷泉冒甲烷
   */
  private emit(v: ViewCtx, sim: Sim, s: DeepState, cfg: DeepConfig, dt: number, now: number, eye: Point): void {
    const sub = s.sub
    const h = s.hull
    const screen = v.lens.screen
    const near = screen.sees(sub.x, sub.y, 8 * UNIT)
    this.doorDebt += breathable(sub) ? (sub.phase === 'warn' ? 12 : 3) * dt : 0
    while (this.doorDebt >= 1) {
      this.doorDebt -= 1
      if (!near) continue
      const p = fromHull(sub, h.door + (Math.random() - 0.5) * 0.8, h.r + 0.05 + Math.random() * 0.3)
      this.spawnBubble(v, p.x, p.y, 0.2 + Math.random() * 0.5, 0.04 + Math.random() * 0.06)
    }
    this.ventDebt += (sub.phase === 'warn' ? 26 : sub.phase === 'rise' ? 14 : 0) * dt
    const floor = seabedM(s.plan, sub.x / UNIT, sub.y / UNIT)
    const k = (CAM_M - floor) / Math.max(0.5, CAM_M - floor - sub.h)
    while (this.ventDebt >= 1) {
      this.ventDebt -= 1
      if (!near) continue
      const q = sub.phase === 'warn' ? { u: h.tail + Math.random() * (h.bow - h.tail), v: (Math.random() - 0.5) * h.r * 0.8 } : s.rim[Math.floor(Math.random() * s.rim.length)]!
      const w = fromHull(sub, q.u, q.v)
      this.spawnBubble(v, eye.x + (w.x - eye.x) * k, eye.y + (w.y - eye.y) * k, 0.3, 0.06 + Math.random() * 0.1)
    }
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      if (breathesAt(cfg, s, x, y)) {
        const at = this.exhaleAt.get(Uid.v[m]!) ?? 0
        if (now < at) continue
        this.exhaleAt.set(Uid.v[m]!, now + 1800 + Math.random() * 1200)
        for (let i = 0; i < 3; i++) this.spawnBubble(v, x + (Math.random() - 0.5) * 8, y, HEAD_U, 0.04 + Math.random() * 0.06)
      } else if (staminaLeft(m) <= 0) {
        if (Math.random() < dt * 9) this.spawnBubble(v, x + (Math.random() - 0.5) * 10, y, HEAD_U, 0.06 + Math.random() * 0.1)
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
      if (screen.sees(x, y, 3 * UNIT)) this.spawnBubble(v, x, y, 0, 0.03 + Math.random() * 0.06)
    }
  }

  /** 在地上 (x, y) 的上方 up 格放一个半径 r 格的气泡；写了 end 就升到那么高散掉，不写就升几格 */
  private spawnBubble(v: ViewCtx, x: number, y: number, up: number, r: number, end?: number): void {
    if (this.bubbles.length >= BUBBLE_MAX) return
    const img = this.spare.pop() ?? v.scene.add.image(0, 0, BUBBLE_KEY).setDepth(32)
    img.setVisible(true)
    const vup = BUBBLE_RISE_U * (0.75 + Math.random() * 0.5) * (0.7 + r * 3)
    this.bubbles.push({ x, y, up, vup, from: up, end: end ?? up + BUBBLE_TOP_U * (0.6 + Math.random() * 0.4), r, phase: Math.random() * 6.28, age: 0, img })
  }

  /** 气泡一边往上升一边左右晃，立着画：升得越高画得越往上、胀大一点，升到头就散了 */
  private stepBubbles(dt: number): void {
    const kept: Bubble[] = []
    for (const q of this.bubbles) {
      q.age += dt
      q.up += q.vup * dt
      q.phase += dt * 7
      q.x += Math.sin(q.phase) * 6 * dt
      if (q.up >= q.end) {
        q.img.setVisible(false)
        this.spare.push(q.img)
        continue
      }
      const size = q.r * 2 * UNIT * (1 + 0.05 * q.up)
      const fade = Math.min(1.2, (q.end - q.from) * 0.5)
      q.img
        .setPosition(q.x, q.y - q.up * UNIT)
        .setDisplaySize(size * (1 + 0.08 * Math.sin(q.phase * 1.7)), size * (1 - 0.08 * Math.sin(q.phase * 1.7)))
        .setAlpha(smooth(0, 0.15, q.age) * (1 - smooth(q.end - fade, q.end, q.up)) * 0.8)
        .setTint(this.lightTint(q.x, q.y))
      kept.push(q)
    }
    this.bubbles = kept
  }

  /** 气泡与海雪被灯照到多少：离潜艇门上的灯近的偏暖白，远的是幽幽的蓝 */
  private lightTint(x: number, y: number): number {
    const l = this.lit
    const d = Math.hypot(x - l.x, y - l.y) / UNIT
    const k = clamp01(l.power * Math.exp(-(d * d) / 40))
    const r = Math.round(90 + 165 * k)
    const g = Math.round(140 + 115 * k)
    const b = Math.round(190 + 65 * k)
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

  /** 立着的身体迎着潜艇门上的灯那一面亮，离得越近明暗越分明，再补一层暖白；离灯远的四面一样亮 */
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
    this.sub = undefined
    this.door = undefined
    this.shadow = undefined
    this.doorGlow = undefined
    this.zone = undefined
    this.glow = undefined
    this.relief = undefined
    this.ready = false
    for (const key of [ALBEDO_KEY, GEO_KEY, NORM_KEY, GLOW_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
