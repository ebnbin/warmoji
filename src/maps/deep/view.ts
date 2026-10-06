import Phaser from 'phaser'
import { query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY, SUN } from '../../data/light'
import { playSfx } from '../../audio/sfx'
import { Alive, ENEMY_SET, Phys, PrevPos, PROJ_SET, Transform, Uid } from '../../ecs/components'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { BoundedView } from '../../ecs/views'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { HEIGHT_RANGE, RELIEF_PPU } from './ground'
import { seabedM } from './layout'
import { DeepPainter } from './painter'
import { ATTENUATION, SEABED_FRAG } from './shader'
import { bellFrame, boatFrame, drawBell, drawBellShadow, drawBoatShadow, drawBubble, drawFish, drawMote, drawMouth, drawSheen, mouthFrame, shadowFrame } from './sprites'
import { breathable, fromShell, shellOf } from './bell'
import { breathesAt, grounded } from './world'
import type { BellFrame } from './sprites'
import type { Bell, BellPhase, Pose, Shell } from './bell'
import type { DeepState } from './world'
import type { DeepConfig } from '../../types/maps'
import type { Sim } from '../../ecs/sim'
import type { Framing } from '../../ecs/lens'
import type { ViewCtx } from '../../ecs/views'
import type { Point } from '../../util/vec'

const BG = 0x2a8a8c
const ALBEDO_KEY = 'deep-albedo'
const GEO_KEY = 'deep-geo'
const NORM_KEY = 'deep-norm'
const TRAIL_KEY = 'deep-trail'
const BELL_KEY = 'deep-bell'
const MOUTH_KEY = 'deep-bell-mouth'
const SHADOW_KEY = 'deep-bell-shadow'
const SHEEN_KEY = 'deep-bell-sheen'
const BOAT_KEY = 'deep-boat-shadow'
const BUBBLE_KEY = 'deep-bubble'
const MOTE_KEY = 'deep-mote'
const FISH_KEY = 'deep-fish'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 透视镜头离开局站位那片沙底多高，米：吊起来的潜水钟与水里的微尘离沙底越高，在画面上越大、越往画面外偏 */
const CAM_M = 16
/** 水面离开局站位那片沙底多高，米 */
const SURF_M = 5
/** 太阳每往下照一米、影子往外偏几米：正午的太阳高，影子短 */
const SUN_TAN = 0.4
/** 着色器用的太阳方向：方位同画面里的太阳，抬到正午的高度 */
const SUN_DIR = (() => {
  const h = Math.hypot(SUN.x, SUN.y)
  const x = (SUN.x / h) * SUN_TAN
  const y = (SUN.y / h) * SUN_TAN
  const l = Math.hypot(x, y, 1)
  return [x / l, y / l, 1 / l] as const
})()
/** 阳光暖白偏金；水里散射回来的光与深处的水色，三色 */
const SUN_COLOR = [1.0, 0.94, 0.8] as const
const SKY = [0.17, 0.52, 0.58] as const
const DEEP = [0.03, 0.22, 0.33] as const
const EXPOSURE = 1.95
/** 潜水钟的贴图每格多少像素；船影晕得很开，用不着那么细 */
const BELL_PPU = 96
const BOAT_PPU = 24
/** 队员的头离脚多高（格）：呼出的气泡从这里冒 */
const HEAD_U = 0.9
/** 细沙与气泡的拖尾：每格几个格子，散掉的时间常数（秒），身体游多快（格/秒）才搅起沙，搅起多少；弹体一路拖出多浓的一串 */
const TRAIL_PPU = 4
const TRAIL_TAU = 0.6
const TRAIL_SPEED_U = 1.4
const TRAIL_BODY = 1.2
const TRAIL_SHOT = 0.16
/** 气泡：最多同时几个，往上升多快（格/秒），最多升多高就散了（格） */
const BUBBLE_MAX = 180
const BUBBLE_RISE_U = 1.2
const BUBBLE_TOP_U = 5
const BUBBLE_TINT = 0xeafcff
/** 水里的微尘：几粒，往下沉多快（米/秒），离沙底多高的范围（米） */
const MOTES = 90
const MOTE_SINK_MS = 0.03
const MOTE_LO_M = 0.3
const MOTE_HI_M = SURF_M - 0.3
/** 鱼群：几群、每群几条，游多快（格/秒），一条鱼的影子多长（格），影子多浓 */
const SCHOOLS = 2
const SCHOOL_FISH = 11
const SCHOOL_SPEED_U = 2.4
const FISH_U = 0.6
const FISH_ALPHA = 0.28
/** 船影与缆绳影子多浓，缆绳多粗（格） */
const BOAT_ALPHA = 0.22
const ROPE_SHADOW_ALPHA = 0.3
const ROPE_U = 0.07
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

interface Mote {
  x: number
  y: number
  h: number
  vx: number
  vy: number
  r: number
  phase: number
  readonly img: Phaser.GameObjects.Image
}

/** 一群鱼：群心在哪（像素）、朝哪游（弧度）、往哪边慢慢拐；每条鱼在群里的位置（格，顺着游的方向为 u） */
interface School {
  x: number
  y: number
  a: number
  turn: number
  t: number
  readonly fish: { readonly u: number; readonly v: number; readonly ph: number; readonly img: Phaser.GameObjects.Image }[]
}

/** 把画布重新传上显卡：重传会按游戏的像素风退回最近邻取样，这几张图都要线性插值 */
function refreshLinear(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 隔着 depth 米海水看过去、阳光走过 down 米，颜色剩多少：按三色的衰减系数算成着色 */
function waterTint(depth: number, down: number): number {
  const ch = (i: number): number => Math.round(255 * clamp01(1.08 * Math.exp(-ATTENUATION[i]! * (Math.max(0, depth) + Math.max(0, down)) * 0.45)))
  return (ch(0) << 16) | (ch(1) << 8) | ch(2)
}

/**
 * 暖海：沙底是开局在后台线程画好的固有色与高度，光照由着色器逐点算——太阳透过水面照下来，白沙上晃着一张张光斑，水面起伏投下大片柔和的明暗，
 * 隔着海水看过去浅处泛青绿、坎外沉成深蓝，斜射进来的光柱一道道地晃；游得快的身体与飞过的子弹身后拖着一溜细沙和气泡。
 * 潜水钟坐在沙底上时贴着地画、压在所有身体后面，钟口外鼓着一团空气；吊起来按透视越画越大、越往画面外偏，出了水就看不见了，过了身体的头顶就画到身体前面。
 * 水面上那条船只画它投在沙上的影子，跟着钟走；缆绳从钟顶往水面拉，沙上也落着它的影子。钟口那一片换得上气的半圆画一道虚线，吊走时连同钟身的轮廓和垂下来的缆绳影子画在新落点。
 * 气泡像身体一样立着画，离地越高画得越往上；水里的微尘按透视画；鱼群的影子不时从沙上掠过。呛水的队员一串串冒泡
 */
export class DeepView extends BoundedView {
  private painter?: DeepPainter
  private ground?: Phaser.GameObjects.Shader
  private readonly u = { time: 0 }
  private trail?: { tex: Phaser.Textures.CanvasTexture; img: ImageData; v: Float32Array; n: number }
  private bell?: Phaser.GameObjects.Image
  private mouth?: Phaser.GameObjects.Image
  private sheen?: Phaser.GameObjects.Image
  private shadow?: Phaser.GameObjects.Image
  private boat?: Phaser.GameObjects.Image
  private rope?: Phaser.GameObjects.Graphics
  private zone?: Phaser.GameObjects.Graphics
  private bubbles: Bubble[] = []
  private spare: Phaser.GameObjects.Image[] = []
  private motes: Mote[] = []
  private schools: School[] = []
  private phase: BellPhase = 'down'
  private exhaleAt = new Map<number, number>()
  private gurgleAt = 0
  private doorDebt = 0
  private ventDebt = 0
  private seepDebt = 0

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    const shell = shellOf(v.def.deep!.bell)
    const art = (key: string, f: BellFrame, ppu: number, draw: (ctx: CanvasRenderingContext2D, f: BellFrame, ppu: number) => void): void => {
      if (!scene.textures.exists(key)) canvasTexture(scene, key, Math.ceil(f.w * ppu), Math.ceil(f.h * ppu), (ctx) => draw(ctx, f, ppu))
    }
    art(BELL_KEY, bellFrame(shell), BELL_PPU, (ctx, f, ppu) => drawBell(ctx, shell, f, ppu))
    art(MOUTH_KEY, mouthFrame(shell), BELL_PPU, (ctx, f, ppu) => drawMouth(ctx, shell, f, ppu))
    art(SHADOW_KEY, shadowFrame(shell), BELL_PPU, (ctx, f, ppu) => drawBellShadow(ctx, shell, f, ppu))
    art(BOAT_KEY, boatFrame(), BOAT_PPU, drawBoatShadow)
    if (!scene.textures.exists(SHEEN_KEY)) canvasTexture(scene, SHEEN_KEY, 128, 128, (ctx) => drawSheen(ctx, 128))
    if (!scene.textures.exists(BUBBLE_KEY)) canvasTexture(scene, BUBBLE_KEY, 32, 32, (ctx) => drawBubble(ctx, 32))
    if (!scene.textures.exists(MOTE_KEY)) canvasTexture(scene, MOTE_KEY, 16, 16, (ctx) => drawMote(ctx, 16))
    if (!scene.textures.exists(FISH_KEY)) canvasTexture(scene, FISH_KEY, 32, 32, (ctx) => drawFish(ctx, 32))
  }

  /** 沙底上的小东西都画进地面里了 */
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
    const n = FRAME_U * TRAIL_PPU
    const trailTex = canvasTexture(scene, TRAIL_KEY, n, n)
    this.trail = { tex: trailTex, img: trailTex.getContext().createImageData(n, n), v: new Float32Array(n * n), n }
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
            set('uTrail', 3)
            set('uRect', rect)
            set('uField0', rect)
            set('uHeight', [HEIGHT_RANGE.lo, HEIGHT_RANGE.span])
            set('uMpp', cfg.meterPerU / UNIT)
            set('uTime', u.time)
            set('uSun', SUN_DIR)
            set('uSunColor', SUN_COLOR)
            set('uSurf', SURF_M)
            set('uDeep', DEEP)
            set('uSky', SKY)
            set('uExposure', EXPOSURE)
          },
        },
        FRAME.x,
        FRAME.y,
        FRAME.w,
        FRAME.h,
        [ALBEDO_KEY, GEO_KEY, NORM_KEY, TRAIL_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(-1)
    this.visuals.push(this.ground)
    const pin = (key: string, f: BellFrame): Phaser.GameObjects.Image => scene.add.image(0, 0, key).setOrigin(-f.u0 / f.w, -f.v0 / f.h).setScale(UNIT / BELL_PPU)
    this.boat = pin(BOAT_KEY, boatFrame()).setScale(UNIT / BOAT_PPU).setDepth(-0.62)
    this.shadow = pin(SHADOW_KEY, shadowFrame(s.shell)).setDepth(-0.6)
    this.zone = scene.add.graphics().setDepth(-0.5)
    // 坐在沙底上的潜水钟、钟口那团空气画在所有身体后面：钟身只挡住它压着的地方，不挡站在旁边的身体
    this.bell = pin(BELL_KEY, bellFrame(s.shell)).setDepth(0.9)
    this.sheen = scene.add.image(0, 0, SHEEN_KEY).setDepth(0.91).setBlendMode(Phaser.BlendModes.ADD)
    this.rope = scene.add.graphics().setDepth(0.92)
    this.mouth = pin(MOUTH_KEY, mouthFrame(s.shell)).setDepth(0.93)
    this.visuals.push(this.boat, this.shadow, this.zone, this.bell, this.sheen, this.rope, this.mouth)
    this.phase = s.bell.phase
    this.seedMotes(v)
    this.seedSchools(v)
    v.lens.screen.vignette(0.82, 0.12, 0x06363a)
  }

  /** 镜头拍到的世界范围的正中，像素：透视从这里往外推 */
  private eye(v: ViewCtx): Point {
    const r = v.lens.screen.view()
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.deep
    if (!s || !this.ground) return
    const cfg = v.def.deep!
    const dt = Math.min(delta, 100) / 1000
    const now = sim.elapsedMs
    const eye = this.eye(v)
    this.u.time += dt
    this.stepTrail(sim, dt)
    this.drawBell(s, cfg, eye, now)
    this.drawZone(s, cfg, now)
    this.sounds(s.bell)
    this.emit(v, sim, s, cfg, dt, now, eye)
    this.stepBubbles(dt)
    this.stepMotes(v, dt, eye)
    this.stepSchools(v, dt)
  }

  /** 细沙与气泡的拖尾：整片按时间常数散掉，游得快的身体与飞过的弹体沿路搅起来 */
  private stepTrail(sim: Sim, dt: number): void {
    const g = this.trail
    if (!g) return
    const n = g.n
    const fade = Math.exp(-dt / TRAIL_TAU)
    const f = g.v
    for (let i = 0; i < f.length; i++) f[i] = f[i]! * fade
    const stamp = (x: number, y: number, amount: number): void => {
      const gx = (x / UNIT) * TRAIL_PPU - 0.5
      const gy = (y / UNIT) * TRAIL_PPU - 0.5
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
    const swim = (eid: number): void => {
      const sp = Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) / UNIT
      if (sp <= TRAIL_SPEED_U) return
      stamp(Transform.x[eid]!, Transform.y[eid]!, Math.min(0.5, (sp - TRAIL_SPEED_U) * TRAIL_BODY * dt))
    }
    for (const m of sim.characters) if (Alive.v[m]) swim(m)
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e]) swim(e)
    for (const p of query(sim.world, PROJ_SET)) {
      const ax = PrevPos.x[p]!
      const ay = PrevPos.y[p]!
      const bx = Transform.x[p]!
      const by = Transform.y[p]!
      const len = Math.hypot(bx - ax, by - ay)
      const k = Math.min(12, Math.ceil(len / (0.2 * UNIT)))
      for (let j = 1; j <= k; j++) stamp(ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k, TRAIL_SHOT / k)
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

  /** 地上 (x, y) 处离地 up 米的一点，在透视镜头里画在哪（像素）；floor 是那里沙底的高 */
  private lift(eye: Point, x: number, y: number, floor: number, up: number): Point {
    const k = (CAM_M - floor) / Math.max(0.5, CAM_M - floor - up)
    return { x: eye.x + (x - eye.x) * k, y: eye.y + (y - eye.y) * k }
  }

  /**
   * 坐在沙底上的潜水钟贴着地画；吊起来按透视越画越大、越往画面外偏，出了水就淡没，过了身体的头顶就画到身体前面；预兆时钟身一晃一晃。
   * 钟身按头顶那层水的深浅染上青绿；钟口开着时外面鼓着一团空气。船影与钟的影子顺着背光的方向落在沙上，缆绳从钟顶往水面拉
   */
  private drawBell(s: DeepState, cfg: DeepConfig, eye: Point, now: number): void {
    const b = s.bell
    const c = cfg.bell
    const mpp = cfg.meterPerU / UNIT
    const floor = seabedM(s.plan, b.x / UNIT, b.y / UNIT)
    const water = SURF_M - floor
    const at = this.lift(eye, b.x, b.y, floor, b.h)
    const k = (CAM_M - floor) / Math.max(0.5, CAM_M - floor - b.h)
    const shake = b.phase === 'warn' ? Math.sin(now / 45) * 0.03 : 0
    const out = smooth(water - c.heightM - 0.6, water - 0.4, b.h)
    const depth = water - b.h - c.heightM
    const tint = waterTint(depth, depth / SUN_DIR[2])
    this.bell!
      .setPosition(at.x, at.y)
      .setRotation(b.a + shake)
      .setScale((UNIT / BELL_PPU) * k)
      .setTint(tint)
      .setAlpha(1 - out)
      .setDepth(grounded(b) ? 0.9 : 31)
    const r = s.shell.r * UNIT * k
    this.sheen!
      .setPosition(at.x, at.y)
      .setDisplaySize(r * 2, r * 2)
      .setAlpha(0.55 * (1 - out) * clamp01(Math.exp(-0.05 * Math.max(0, depth))))
      .setDepth(grounded(b) ? 0.91 : 31.01)
    const open = breathable(b)
    const wob = 1 + 0.05 * Math.sin(now / 260) + (b.phase === 'warn' ? 0.12 * Math.abs(Math.sin(now / 90)) : 0)
    this.mouth!
      .setVisible(open)
      .setPosition(at.x, at.y)
      .setRotation(b.a + shake)
      .setScale((UNIT / BELL_PPU) * k * wob, (UNIT / BELL_PPU) * k)
      .setTint(waterTint(water - 0.5, (water - 0.5) / SUN_DIR[2]))
    const off = (m: number): Point => ({ x: AWAY.x * ((m * SUN_TAN) / mpp), y: AWAY.y * ((m * SUN_TAN) / mpp) })
    const sh = off(b.h + c.heightM * 0.4)
    this.shadow!
      .setPosition(b.x + sh.x, b.y + sh.y)
      .setRotation(b.a)
      .setAlpha(0.42 * (1 - smooth(0, water * 0.7, b.h)))
    const surf = off(water)
    this.boat!.setPosition(b.x + surf.x, b.y + surf.y).setRotation(b.a).setAlpha(BOAT_ALPHA)
    const g = this.rope!.clear()
    const top = b.h + c.heightM
    const tight = b.phase === 'down' ? 0 : 1
    const sway = (1 - tight) * Math.sin(now / 1700) * 0.35 * UNIT
    // 缆绳在沙上的影子：从钟顶的影子拉到水面那一点的影子
    const ts = off(Math.min(top, water))
    if (top < water) {
      g.lineStyle(ROPE_U * UNIT, 0x062f33, ROPE_SHADOW_ALPHA)
      this.cable(g, b.x + ts.x, b.y + ts.y, b.x + surf.x, b.y + surf.y, sway * 0.6)
      // 缆绳本身：钟顶往上直到水面，透视里是一道从钟心往画面外的斜线
      const p0 = this.lift(eye, b.x, b.y, floor, top)
      const p1 = this.lift(eye, b.x, b.y, floor, water)
      g.lineStyle(ROPE_U * UNIT * k * (1 + 0.3 * tight), 0x4a3f30, 0.9)
      this.cable(g, p0.x, p0.y, p1.x, p1.y, sway)
      g.lineStyle(ROPE_U * UNIT * k * 0.35, 0xe8dcc0, 0.55)
      this.cable(g, p0.x, p0.y, p1.x, p1.y, sway)
    }
    g.setDepth(grounded(b) ? 0.92 : 31.02)
  }

  /** 一段缆绳：从 (x0, y0) 到 (x1, y1)，往一侧垂下 sag 像素 */
  private cable(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, sag: number): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const l = Math.hypot(dx, dy) || 1
    const nx = -dy / l
    const ny = dx / l
    g.beginPath()
    g.moveTo(x0, y0)
    const n = 8
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const bow = 4 * t * (1 - t) * sag
      g.lineTo(x0 + dx * t + nx * bow, y0 + dy * t + ny * bow)
    }
    g.strokePath()
  }

  /**
   * 钟口那一片换得上气的半圆画一道虚线，底下垫一道深色的边，亮处也看得清：坐着时画在钟口，白色；
   * 吊走时连同钟身的轮廓、垂下来的缆绳影子画在新落点，黄色闪着
   */
  private drawZone(s: DeepState, cfg: DeepConfig, now: number): void {
    const g = this.zone!.clear()
    const open = breathable(s.bell)
    const p: Pose = open ? s.bell : s.bell.to
    const h: Shell = s.shell
    const c = fromShell(p, 0, h.r)
    const face = p.a + Math.PI / 2
    const R = cfg.bell.doorU * UNIT
    const n = 14
    const step = Math.PI / n
    const shift = ((now / (open ? 6000 : 1500)) % 1) * step
    const rim = open ? [] : s.rim.map((q) => fromShell(p, q.u, q.v))
    const dash = 0.32 * UNIT
    const gap = 0.24 * UNIT
    const mpp = cfg.meterPerU / UNIT
    const floor = seabedM(s.plan, p.x / UNIT, p.y / UNIT)
    const reach = ((SURF_M - floor) * SUN_TAN) / mpp
    const dashed = (pts: readonly Point[], closed: boolean): void => {
      const period = dash + gap
      const offset = ((now / 1500) % 1) * period
      let s0 = 0
      const count = closed ? pts.length : pts.length - 1
      for (let i = 0; i < count; i++) {
        const a = pts[i]!
        const b = pts[(i + 1) % pts.length]!
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
    const draw = (): void => {
      for (let i = -1; i < n; i++) {
        const a0 = Math.max(face - Math.PI / 2, face - Math.PI / 2 + i * step + shift)
        const a1 = Math.min(face + Math.PI / 2, face - Math.PI / 2 + i * step + shift + step / 1.8)
        if (a1 <= a0) continue
        g.beginPath()
        g.arc(c.x, c.y, R, a0, a1)
        g.strokePath()
      }
      dashed(rim, true)
    }
    if (!open) {
      g.lineStyle(ROPE_U * UNIT * 1.2, 0x062f33, 0.3 + 0.2 * Math.abs(Math.sin(now / 250)))
      dashed([{ x: p.x, y: p.y }, { x: p.x + AWAY.x * reach, y: p.y + AWAY.y * reach }], false)
    }
    g.lineStyle(0.15 * UNIT, 0x06343a, 0.45)
    draw()
    g.lineStyle(0.08 * UNIT, open ? 0xffffff : 0xffd54f, open ? 0.75 + 0.2 * Math.sin(now / 400) : 0.55 + 0.4 * Math.abs(Math.sin(now / 250)))
    draw()
  }

  /** 潜水钟每进一段响一声：预兆时缆绳一紧、钟口咕嘟吐出一大团气；落稳时铛的一声 */
  private sounds(bell: Bell): void {
    if (bell.phase === this.phase) return
    this.phase = bell.phase
    if (bell.phase === 'warn') {
      playSfx('creak')
      playSfx('bubble')
    } else if (bell.phase === 'down') playSfx('clank')
  }

  /**
   * 冒气泡：钟口一直漏着一点、预兆时猛地吐出一大团；吊起来时钟身四周拖着一串串；钟口换气的队员呼出一串；
   * 呛水的一串串往上冒；涌泉冒个不停
   */
  private emit(v: ViewCtx, sim: Sim, s: DeepState, cfg: DeepConfig, dt: number, now: number, eye: Point): void {
    const b = s.bell
    const h = s.shell
    const screen = v.lens.screen
    const near = screen.sees(b.x, b.y, 8 * UNIT)
    this.doorDebt += breathable(b) ? (b.phase === 'warn' ? 40 : 3) * dt : 0
    while (this.doorDebt >= 1) {
      this.doorDebt -= 1
      if (!near) continue
      const big = b.phase === 'warn'
      const p = fromShell(b, (Math.random() - 0.5) * (big ? 1.6 : 0.8), h.r + 0.05 + Math.random() * (big ? 1.2 : 0.3))
      this.spawnBubble(v, p.x, p.y, 0.2 + Math.random() * 0.5, big ? 0.06 + Math.random() * 0.16 : 0.04 + Math.random() * 0.06)
    }
    this.ventDebt += (b.phase === 'rise' ? 18 : 0) * dt
    const floor = seabedM(s.plan, b.x / UNIT, b.y / UNIT)
    while (this.ventDebt >= 1) {
      this.ventDebt -= 1
      if (!near || b.h > SURF_M - floor) continue
      const q = s.rim[Math.floor(Math.random() * s.rim.length)]!
      const w = fromShell(b, q.u, q.v)
      const at = this.lift(eye, w.x, w.y, floor, b.h)
      this.spawnBubble(v, at.x, at.y, 0.3, 0.06 + Math.random() * 0.1)
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
    const img = this.spare.pop() ?? v.scene.add.image(0, 0, BUBBLE_KEY).setDepth(32).setTint(BUBBLE_TINT)
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
        .setAlpha(smooth(0, 0.15, q.age) * (1 - smooth(q.end - fade, q.end, q.up)) * 0.85)
      kept.push(q)
    }
    this.bubbles = kept
  }

  /** 微尘：在镜头拍到的那一柱水里撒开，离沙底高高低低 */
  private seedMotes(v: ViewCtx): void {
    const scene = v.scene
    const eye = this.eye(v)
    const view = v.lens.screen.view()
    for (let i = 0; i < MOTES; i++) {
      const img = scene.add.image(0, 0, MOTE_KEY).setDepth(33).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff6dc)
      this.visuals.push(img)
      const f: Mote = { x: 0, y: 0, h: 0, vx: 0, vy: 0, r: 0.03 + Math.random() * 0.04, phase: Math.random() * 6.28, img }
      this.respawnMote(f, eye, view, Math.random())
      this.motes.push(f)
    }
  }

  /** 把一粒微尘放回镜头里：挑屏幕上的一点，按它的高度反推回世界里 */
  private respawnMote(f: Mote, eye: Point, view: { x: number; y: number; w: number; h: number }, height: number): void {
    f.h = MOTE_LO_M + (MOTE_HI_M - MOTE_LO_M) * height
    const k = CAM_M / (CAM_M - f.h)
    const sx = view.x + (Math.random() * 1.2 - 0.1) * view.w
    const sy = view.y + (Math.random() * 1.2 - 0.1) * view.h
    f.x = eye.x + (sx - eye.x) / k
    f.y = eye.y + (sy - eye.y) / k
    f.vx = (0.2 + Math.random() * 0.25) * UNIT
    f.vy = (Math.random() - 0.5) * 0.15 * UNIT
  }

  /** 微尘被潮水带着慢慢漂、一点点往下沉，迎着太阳一闪一闪，按透视画；出了镜头或沉到底就在镜头里别处重新撒 */
  private stepMotes(v: ViewCtx, dt: number, eye: Point): void {
    const view = v.lens.screen.view()
    for (const f of this.motes) {
      f.h -= MOTE_SINK_MS * dt
      f.phase += dt
      f.x += (f.vx + Math.sin(f.phase * 0.7) * 0.08 * UNIT) * dt
      f.y += f.vy * dt
      const k = CAM_M / Math.max(0.5, CAM_M - f.h)
      const sx = eye.x + (f.x - eye.x) * k
      const sy = eye.y + (f.y - eye.y) * k
      if (f.h < MOTE_LO_M || sx < view.x - view.w * 0.15 || sx > view.x + view.w * 1.15 || sy < view.y - view.h * 0.15 || sy > view.y + view.h * 1.15) {
        this.respawnMote(f, eye, view, f.h < MOTE_LO_M ? 1 : Math.random())
        continue
      }
      const size = (f.r / 0.5) * UNIT * 2 * k
      const glint = 0.5 + 0.5 * Math.sin(f.phase * 2.3 + f.r * 90)
      f.img
        .setPosition(sx, sy)
        .setDisplaySize(size, size)
        .setAlpha((0.12 + 0.3 * glint * glint) * smooth(MOTE_LO_M, MOTE_LO_M + 0.5, f.h))
    }
  }

  /** 鱼群：开局各从方框外的一边游进来 */
  private seedSchools(v: ViewCtx): void {
    for (let i = 0; i < SCHOOLS; i++) {
      const fish: School['fish'][number][] = []
      for (let j = 0; j < SCHOOL_FISH; j++) {
        const img = v.scene.add.image(0, 0, FISH_KEY).setDepth(-0.55).setAlpha(FISH_ALPHA)
        this.visuals.push(img)
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random())
        fish.push({ u: Math.cos(a) * d * 1.8, v: Math.sin(a) * d * 1.1, ph: Math.random() * 6.28, img })
      }
      const sc: School = { x: 0, y: 0, a: 0, turn: 0, t: 0, fish }
      this.launch(sc, i === 0 ? 0.3 : 0.75)
      this.schools.push(sc)
    }
  }

  /** 让一群鱼从方框的一边外面游进来：along 是从哪一处（0 到 1）进来 */
  private launch(sc: School, along: number): void {
    const side = Math.floor(Math.random() * 4)
    const t = 0.15 + 0.7 * along
    const pad = 3 * UNIT
    const pts = [
      { x: FRAME.x + FRAME.w * t, y: FRAME.y - pad, a: Math.PI / 2 },
      { x: FRAME.x + FRAME.w + pad, y: FRAME.y + FRAME.h * t, a: Math.PI },
      { x: FRAME.x + FRAME.w * t, y: FRAME.y + FRAME.h + pad, a: -Math.PI / 2 },
      { x: FRAME.x - pad, y: FRAME.y + FRAME.h * t, a: 0 },
    ]
    const p = pts[side]!
    sc.x = p.x
    sc.y = p.y
    sc.a = p.a + (Math.random() - 0.5) * 0.8
    sc.turn = (Math.random() - 0.5) * 0.3
    sc.t = -Math.random() * 3
  }

  /** 鱼群一边游一边慢慢拐，每条鱼在群里摆来摆去；游出方框就隔一阵从别处再游进来 */
  private stepSchools(v: ViewCtx, dt: number): void {
    const view = v.lens.screen.view()
    for (const sc of this.schools) {
      sc.t += dt
      const going = sc.t > 0
      if (going) {
        sc.a += (sc.turn + 0.25 * Math.sin(sc.t * 0.4)) * dt
        sc.x += Math.cos(sc.a) * SCHOOL_SPEED_U * UNIT * dt
        sc.y += Math.sin(sc.a) * SCHOOL_SPEED_U * UNIT * dt
      }
      const pad = 4 * UNIT
      if (going && (sc.x < FRAME.x - pad || sc.x > FRAME.x + FRAME.w + pad || sc.y < FRAME.y - pad || sc.y > FRAME.y + FRAME.h + pad)) this.launch(sc, Math.random())
      const c = Math.cos(sc.a)
      const s = Math.sin(sc.a)
      const seen = going && sc.x > view.x - pad && sc.x < view.x + view.w + pad && sc.y > view.y - pad && sc.y < view.y + view.h + pad
      for (const f of sc.fish) {
        if (!seen) {
          f.img.setVisible(false)
          continue
        }
        const u = f.u + 0.25 * Math.sin(sc.t * 1.3 + f.ph)
        const w = f.v + 0.2 * Math.sin(sc.t * 0.9 + f.ph * 1.7)
        const wig = 0.18 * Math.sin(sc.t * 9 + f.ph * 3)
        f.img
          .setVisible(true)
          .setPosition(sc.x + (u * c - w * s) * UNIT, sc.y + (u * s + w * c) * UNIT)
          .setRotation(sc.a + wig)
          .setDisplaySize(FISH_U * UNIT, FISH_U * UNIT)
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    for (const q of this.bubbles) q.img.destroy()
    for (const img of this.spare) img.destroy()
    this.bubbles = []
    this.spare = []
    this.motes = []
    this.schools = []
    this.exhaleAt.clear()
    this.ground = undefined
    this.bell = undefined
    this.mouth = undefined
    this.sheen = undefined
    this.shadow = undefined
    this.boat = undefined
    this.rope = undefined
    this.zone = undefined
    this.trail = undefined
    for (const key of [ALBEDO_KEY, GEO_KEY, NORM_KEY, TRAIL_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
