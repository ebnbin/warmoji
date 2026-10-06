import Phaser from 'phaser'
import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { decorSprite } from '../../ecs/decor'
import { roomAt } from '../basin'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import { UprightMask } from '../../ecs/render/upright'
import { paintedEmojiOn } from '../../emoji/style'
import { charSize } from '../../ecs/systems/shared/scale'
import { playSfx } from '../../audio/sfx'
import { Alive, ENEMY_SET, Telegraph, Transform, Uid } from '../../ecs/components'
import { telegraphDef, telegraphEntry } from '../../ecs/store'
import { clockSec } from '../../ecs/fight/clock'
import { gatesNow } from '../../ecs/worlds/gates'
import { debrisAt, lowAt } from './layout'
import { diffuseAt, directAt, facingAt, reliefAt, torchesAt } from './light'
import { blankSky, clarity, skyAt, skyTint, spanAt, sunTint } from './sky'
import { AmethystPainter } from './painter'
import { FACE_PPU, heightSpan, RELIEF_PPU, ROCK_BG } from './ground'
import { blendLux, castShade, doubleMultiply, encodeLux, LIGHT_FRAG, luxShot, MAX_TORCHES, SHADE_BINS, SHADE_ROWS, SHINE_FRAG, shootLux } from './shader'
import { drawBat, drawFlame, drawGlow, drawMoth, drawSmoke } from './sprites'
import { LIGHT_MS, torchLights, torchSpot } from './world'
import type { AmethystLayout } from './layout'
import type { Facing } from './light'
import type { LuxShot } from './shader'
import type { AmethystState } from './world'
import type { EcsAtlas } from '../../ecs/atlas'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import type { Framing } from '../../ecs/lens'
import type { ViewCtx } from '../../ecs/views'
import type { AmethystConfig } from '../../types/maps'

const BG = (ROCK_BG[0] << 16) | (ROCK_BG[1] << 8) | ROCK_BG[2]
const ALBEDO_KEY = 'amethyst-albedo'
const FACE_KEY = 'amethyst-face'
const GEO_KEY = 'amethyst-geo'
const LUX_KEY = 'amethyst-lux'
const SHADE_KEY = 'amethyst-shade'
const MASK_KEY = 'amethyst-mask'
const FLAME_KEY = 'amethyst-flame'
const GLOW_KEY = 'amethyst-glow'
const SMOKE_KEY = 'amethyst-smoke'
const MOTH_KEY = 'amethyst-moth'
const BAT_KEY = 'amethyst-bat'
/** 开局最多几个线程分着画地面 */
const THREADS = 4
/** 洞里的光压在实体、特效与血条上面，指向箭头与伤害数字下面；晶面的闪光叠在光上；火苗自己发光，画在最上面 */
const LIGHT_DEPTH = 39
const SHINE_DEPTH = 39.1
const FLAME_DEPTH = 39.3
/** 飞蛾在光下面：近火处才亮 */
const MOTH_DEPTH = 35
/** 蝙蝠飞在单位与飞蛾上面、光下面：飞进暗处就看不见 */
const BAT_DEPTH = 36
/** 镜头与眼睛跟上亮度变化的时间常数，毫秒 */
const VIEW_TAU = 700
const ADAPT_TAU = 900
/** 火光照在东西上的颜色：眼睛适应了火光，看上去几乎是白的，只带一点暖 */
const TORCH_COLOR = [1, 0.9, 0.82] as const
const MOON_COLOR = [0.78, 0.84, 1] as const
/** 晶壁把光反出来时染上的紫 */
const CRYSTAL_TINT = [0.84, 0.6, 1] as const
/** 火光在晶壁之间来回反射三次以后的颜色：反一次染一次紫 */
const TORCH_BOUNCE_COLOR = (() => {
  const c = TORCH_COLOR.map((v, k) => v * CRYSTAL_TINT[k]! ** 3)
  const m = Math.max(...c)
  return c.map((v) => v / m)
})()
/** 最暗的地方也留一点紫黑 */
const FLOOR = [0.07, 0.026, 0.11] as const
/** 月光画面上提亮多少倍：真实的月光太暗、眼睛又只适应到 brightLux，不提亮就看不见；只是画面，刷怪与点火把按真实的照度 */
const MOON_GAIN = 30
/** 光柱里浮尘把多少直射光散向镜头 */
const SCATTER = 0.012
/** 立着的东西的遮罩图边长，像素：盖住镜头拍到的范围，四边再各外扩 MASK_PAD 倍 */
const MASK_PX = 512
const MASK_PAD = 0.1
/** 每支火把边上绕着几只飞蛾 */
const MOTHS = 3
/** 太阳落到这个高度晶体开始遇冷，一直响到它落到负的这么多度，度 */
const CHILL_DEG = 2
/** 黄昏太阳落到这个高度一群蝙蝠从暗道里飞出去，黎明升到这个高度飞回来，度：出洞比晶体遇冷早两度，先看到蝙蝠出洞，晶体再叮响 */
const BAT_OUT_DEG = CHILL_DEG + 2
const BAT_IN_DEG = -2
/** 一群几只，一只接一只动身的间隔，毫秒 */
const BATS = 30
const BAT_GAP_MS = 110
/** 飞多快，格每秒；离下一处这么近就转向再下一处，格 */
const BAT_SPEED_U = 5.5
const BAT_REACH_U = 0.7
/** 贴着洞底与飞到洞顶时翼展多宽，格：越高离镜头越近、看着越大 */
const BAT_LOW_U = 0.9
const BAT_HIGH_U = 2
const RAD = Math.PI / 180

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function ease(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/**
 * 一只蝙蝠：沿 route 上的点一处处飞过去，leg 是正飞向第几处；出洞的从暗道尽头飞到塌顶下，绕着它盘旋着升出去，回洞的反过来；
 * alt 是离洞底多高（0 到 1），wait 是还要等多久才动身，毫秒；spin 是绕圈的方向与松紧
 */
interface Bat {
  x: number
  y: number
  vx: number
  vy: number
  leg: number
  alt: number
  wait: number
  readonly route: readonly Point[]
  readonly out: boolean
  readonly spin: number
  readonly phase: number
  readonly img: Phaser.GameObjects.Image
}

/** 一名队员手里的火把在画面上的样子：uid 对不上就是换了人；pop 是刚点着时火光一涨的剩余时间，毫秒 */
interface TorchFx {
  uid: number
  lit: number
  pop: number
  readonly flame: Phaser.GameObjects.Image
  readonly halo: Phaser.GameObjects.Image
  readonly moths: Phaser.GameObjects.Image[]
}

/** 重传画布贴图：重传会按游戏的像素风设置退回最近邻取样，地面与数据图都要线性插值 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 直射弱过眼睛适应亮度的这么多倍就当没有：着色器省下挡光的计算 */
const faint = (x: number): number => (x < 0.002 ? 0 : x)

/**
 * 紫水晶洞穴：地面是后台线程画的固有色与晶面朝向，光照由着色器按 2 倍调制压在整个画面上——开口下的光斑随太阳移动、被洞壁与晶体挡出影子，
 * 天光与紫色的反光从照度场来，火把按点光源照、被洞壁与高大的晶体挡住；晶面朝着反射方向时闪一下，光柱里晶尘浮动。
 * 镜头按洞里的平均照度推拉：亮时拉远看大半个洞，暗时推到火把那一圈；眼睛跟着适应，最暗只适应到 view.brightLux。
 * 火把点着、熄灭有火光与声音，冒烟和火星，夜里飞蛾绕着火飞；黑暗里的敌人露出反光的眼睛；黄昏一群蝙蝠从暗道里飞出、绕着塌顶盘旋着飞走，黎明飞回暗道；
 * 黄昏时晶体遇冷，叮的一声闪一下；子弹敲在晶体上迸出碎晶
 */
export class AmethystView extends BoundedView {
  private painter?: AmethystPainter
  /** 照度图在两次算光之间从 from 过渡到 to，to 是 at 时刻（模拟的毫秒）算出来的；shown 是图上此刻过渡到哪了 */
  private data?: {
    lux: Phaser.Textures.CanvasTexture
    luxImg: ImageData
    from: LuxShot
    to: LuxShot
    at: number
    shown: number
    shade: Phaser.Textures.CanvasTexture
    shadeImg: ImageData
    version: number
  }
  /** 画面上的天：太阳与月亮每帧按此刻现算，光斑才跟得上；洞里的光每 LIGHT_MS 才算一次 */
  private readonly sky = blankSky()
  private readonly u = {
    sun: [0, 0, 0, 0],
    sunCol: [1, 1, 1],
    moon: [0, 0, 0, 0],
    skyCol: [1, 1, 1],
    bounceCol: [1, 1, 1],
    logAdapt: 2,
    torch: new Float32Array(MAX_TORCHES * 4),
    torchCount: 0,
    time: 0,
    mist: 0,
  }
  private span = 0
  private adapt = 1
  private sunDeg = 90
  private chillAt = 0
  private torches = new Map<number, TorchFx>()
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private smoke?: Phaser.GameObjects.Particles.ParticleEmitter
  private shards?: Phaser.GameObjects.Particles.ParticleEmitter
  private eyes: Phaser.GameObjects.Image[] = []
  private flashes: { img: Phaser.GameObjects.Image; at: number }[] = []
  private bats: Bat[] = []
  private vignette?: Phaser.Filters.Vignette
  private mask?: UprightMask
  /** 这一帧洞里的光与点着的火把：单位按它分明暗 */
  private lights?: { s: AmethystState; cfg: AmethystConfig; spots: Point[]; lits: number[] }
  private readonly facing: Facing = { x: 0, y: 0, e: 0 }

  /** 洞里越亮看得越远：短边看到 span 格；洞里的光算出来之前按标准 */
  followZoom(): number {
    return this.span > 0 ? Math.min(viewport.logicalWidth, viewport.logicalHeight) / (this.span * UNIT) : 1
  }

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    if (!scene.textures.exists(FLAME_KEY)) canvasTexture(scene, FLAME_KEY, 32, 48, (ctx) => drawFlame(ctx, 32, 48))
    if (!scene.textures.exists(GLOW_KEY)) canvasTexture(scene, GLOW_KEY, 64, 64, (ctx) => drawGlow(ctx, 64))
    if (!scene.textures.exists(SMOKE_KEY)) canvasTexture(scene, SMOKE_KEY, 64, 64, (ctx) => drawSmoke(ctx, 64))
    if (!scene.textures.exists(MOTH_KEY)) canvasTexture(scene, MOTH_KEY, 48, 40, (ctx) => drawMoth(ctx, 48, 40))
    if (!scene.textures.exists(BAT_KEY)) canvasTexture(scene, BAT_KEY, 64, 40, (ctx) => drawBat(ctx, 64, 40))
  }

  /** 布景要等洞的形状生成以后才撒得下去，见 scatter */
  decor(): void {}

  /** 旧矿镐、骨头、碎石只撒在空着的洞底上：不进岩体与晶体，不落在碎晶坡上 */
  private scatter(v: ViewCtx, atlas: EcsAtlas, L: AmethystLayout): void {
    const rng = new Rng(v.run.decorSeed)
    for (const d of rollDecor(v.def.decor, () => rng.next(), Math.round(v.w / UNIT), Math.round(v.h / UNIT))) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomAt(L.basin, x, y) < (d.sizeU / 2 + 0.15) * UNIT || debrisAt(L, x, y) > 0 || lowAt(L, x, y) > 0) continue
      v.decor.push(decorSprite(atlas, d.emoji, x, y, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.amethyst
    if (!s) return
    const L = s.layout
    const f = L.field
    const cfg = v.def.amethyst!
    const scene = v.scene
    const W = Math.round((f.w / UNIT) * FACE_PPU)
    const H = Math.round((f.h / UNIT) * FACE_PPU)
    const RW = Math.round((f.w / UNIT) * RELIEF_PPU)
    const RH = Math.round((f.h / UNIT) * RELIEF_PPU)
    const albedo = canvasTexture(scene, ALBEDO_KEY, W, H)
    const face = canvasTexture(scene, FACE_KEY, W, H)
    const geo = canvasTexture(scene, GEO_KEY, RW, RH)
    const seams = gatesNow(sim)
      .filter((g) => g.def.at.kind === 'nooks')
      .map((g) => ({ x: g.ax, y: g.ay, nx: g.nx, ny: g.ny }))
    const painter = new AmethystPainter(L, seams, FACE_PPU, W, H, Math.max(1, Math.min(THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    await painter.paint(
      RW * RH,
      (r0, r1, a, n) => {
        albedo.getContext().putImageData(new ImageData(a, W, r1 - r0), 0, r0)
        face.getContext().putImageData(new ImageData(n, W, r1 - r0), 0, r0)
      },
      (g) => geo.getContext().putImageData(new ImageData(g, RW, RH), 0, 0),
    )
    if (this.painter !== painter) return
    painter.close()
    this.painter = undefined
    upload(albedo)
    upload(face)
    upload(geo)
    const lt = s.light
    const lux = canvasTexture(scene, LUX_KEY, lt.cols, lt.rows)
    const shade = canvasTexture(scene, SHADE_KEY, SHADE_BINS, SHADE_ROWS)
    this.data = {
      lux,
      luxImg: lux.getContext().createImageData(lt.cols, lt.rows),
      from: luxShot(lt.cols * lt.rows),
      to: luxShot(lt.cols * lt.rows),
      at: 0,
      shown: -1,
      shade,
      shadeImg: shade.getContext().createImageData(SHADE_BINS, SHADE_ROWS),
      version: -1,
    }
    this.visuals.push(scene.add.image(f.x, f.y, ALBEDO_KEY).setOrigin(0, 0).setDisplaySize(f.w, f.h).setDepth(-1))
    if (v.atlas) this.scatter(v, v.atlas, L)
    const maskTex = scene.textures.addDynamicTexture(MASK_KEY, MASK_PX, MASK_PX)
    // 高分屏开了 pixelArt，缺省的最近点取样会让单位轮廓边上的明暗起一格格的锯齿
    maskTex?.setFilter(Phaser.Textures.FilterMode.LINEAR)
    if (maskTex && v.atlas) this.mask = new UprightMask(scene, v.world, v.atlas, maskTex)
    const mask = this.mask
    const u = this.u
    const fieldRect = [f.x, f.y, f.w, f.h]
    const frameRect = [FRAME.x, FRAME.y, FRAME.w, FRAME.h]
    const h = heightSpan(L)
    const common = (set: (name: string, value: unknown) => void): void => {
      set('uRect', frameRect)
      set('uField', fieldRect)
      set('uHeight', [h.lo, h.span])
      set('uUnit', UNIT)
      set('uCeil', L.ceilingM)
      set('uSun', u.sun)
      set('uMoon', u.moon)
      set('uSunCol', u.sunCol)
      set('uMoonCol', MOON_COLOR)
      set('uTorchCol', TORCH_COLOR)
      set('uTorch[0]', u.torch)
      set('uTorchCount', u.torchCount)
    }
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'AmethystLight',
            fragmentSource: LIGHT_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uLux', 0)
              set('uGeo', 1)
              set('uFace', 2)
              set('uShade', 3)
              set('uMask', 4)
              common(set)
              set('uSkyCol', u.skyCol)
              set('uBounceCol', u.bounceCol)
              set('uLogAdapt', u.logAdapt)
              set('uFloor', FLOOR)
              set('uTorchBounce', TORCH_BOUNCE_COLOR)
              set('uMask0', mask?.rect ?? [0, 0, 1, 1])
            },
          },
          FRAME.x,
          FRAME.y,
          FRAME.w,
          FRAME.h,
          [LUX_KEY, GEO_KEY, FACE_KEY, SHADE_KEY, MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(LIGHT_DEPTH)
        .setBlendMode(doubleMultiply(scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer)),
      scene.add
        .shader(
          {
            name: 'AmethystShine',
            fragmentSource: SHINE_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uGeo', 0)
              set('uFace', 1)
              set('uShade', 2)
              common(set)
              set('uTime', u.time)
              set('uScatter', SCATTER)
              set('uMist', u.mist)
            },
          },
          FRAME.x,
          FRAME.y,
          FRAME.w,
          FRAME.h,
          [GEO_KEY, FACE_KEY, SHADE_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(SHINE_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD),
    )
    this.embers = scene.add
      .particles(0, 0, GLOW_KEY, {
        lifespan: { min: 450, max: 1000 },
        speedX: { min: -14, max: 14 },
        speedY: { min: -64, max: -26 },
        scale: { start: 0.07, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe08a, 0xffa040, 0xff6a20],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(FLAME_DEPTH + 0.05)
    this.smoke = scene.add
      .particles(0, 0, SMOKE_KEY, {
        lifespan: { min: 1100, max: 2000 },
        speedX: { min: -8, max: 10 },
        speedY: { min: -32, max: -14 },
        scale: { start: 0.12, end: 0.5 },
        alpha: { start: 0.22, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x3b3342, 0x4a4252, 0x2f2936],
        emitting: false,
      })
      .setDepth(28)
    this.shards = scene.add
      .particles(0, 0, GLOW_KEY, {
        lifespan: { min: 280, max: 650 },
        speed: { min: 60, max: 210 },
        gravityY: 260,
        scale: { start: 0.09, end: 0.02 },
        scaleY: { start: 0.035, end: 0.01 },
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        tint: [0xc9a6ff, 0x9a6ae0, 0xefe2ff, 0x7b4fd0],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(FLAME_DEPTH)
    this.visuals.push(this.embers, this.smoke, this.shards)
    this.vignette = v.lens.screen.vignette(0.8, 0.18, 0x0a0410)
    this.sunDeg = s.sky.sun.elev / RAD
    this.span = spanAt(cfg.view, s.light.hallLux)
    this.adapt = Math.max(cfg.view.brightLux, s.light.hallLux)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.amethyst
    const d = this.data
    if (!s || !d) return
    const cfg = v.def.amethyst!
    const now = sim.elapsedMs
    const dt = Math.min(delta, 100)
    // 洞里的光隔一阵才算一次：画面上从上一次的样子平滑过渡到新算的，上一段没走完就从走到的地方接着走
    if (d.version !== s.light.version) {
      blendLux(d.from, d.to, d.version < 0 ? 1 : clamp01((now - d.at) / LIGHT_MS))
      shootLux(s.light, d.to)
      if (d.version < 0) blendLux(d.from, d.to, 1)
      d.version = s.light.version
      d.at = now
      d.shown = -1
    }
    const fade = clamp01((now - d.at) / LIGHT_MS)
    if (fade !== d.shown) {
      d.shown = fade
      encodeLux(d.from, d.to, fade, d.luxImg.data)
      d.lux.getContext().putImageData(d.luxImg, 0, 0)
      upload(d.lux)
    }
    // 眼睛按洞里的平均照度适应（对数上平滑地跟），最暗适应到 view.brightLux
    const target = Math.max(cfg.view.brightLux, s.light.hallLux)
    this.adapt = 10 ** (Math.log10(this.adapt) + (Math.log10(target) - Math.log10(this.adapt)) * (1 - Math.exp(-dt / ADAPT_TAU)))
    const adapt = this.adapt
    const sky = skyAt(cfg.sky, clockSec(sim), s.age0, this.sky)
    const sunDeg = sky.sun.elev / RAD
    const u = this.u
    u.time = now / 1000
    u.logAdapt = Math.log10(adapt)
    const cot = (e: number): number => Math.cos(e) / Math.max(Math.sin(e), 1e-3)
    u.sun[0] = sky.sun.x
    u.sun[1] = sky.sun.y
    u.sun[2] = cot(sky.sun.elev)
    u.sun[3] = faint(sky.sun.elev > 0 ? sky.sunLux / adapt : 0)
    u.moon[0] = sky.moon.x
    u.moon[1] = sky.moon.y
    u.moon[2] = cot(sky.moon.elev)
    u.moon[3] = faint(sky.moon.elev > 0 ? (sky.moonLux * MOON_GAIN) / adapt : 0)
    const sc = sunTint(sunDeg)
    const kc = skyTint(sunDeg)
    u.sunCol[0] = sc[0]
    u.sunCol[1] = sc[1]
    u.sunCol[2] = sc[2]
    u.skyCol[0] = kc[0]
    u.skyCol[1] = kc[1]
    u.skyCol[2] = kc[2]
    // 反光：直射与天光按各占的份混成的光，再被晶壁染紫
    const beam = sky.sunLux * Math.max(0, Math.sin(sky.sun.elev))
    const share = beam / Math.max(1e-9, beam + sky.skyLux)
    for (let k = 0; k < 3; k++) u.bounceCol[k] = (sc[k]! * share + kc[k]! * (1 - share)) * CRYSTAL_TINT[k]!
    const bm = Math.max(u.bounceCol[0]!, u.bounceCol[1]!, u.bounceCol[2]!)
    for (let k = 0; k < 3; k++) u.bounceCol[k] = u.bounceCol[k]! / bm
    u.mist = ease(-6, 4, sunDeg) * (1 - ease(8, 25, sunDeg)) * (sky.hour < 12 ? 1 : 0.4)
    this.stepTorches(v, sim, s, cfg, dt, adapt)
    const want = spanAt(cfg.view, s.light.hallLux)
    this.span += (want - this.span) * (1 - Math.exp(-dt / VIEW_TAU))
    if (this.vignette) this.vignette.strength = 0.18 + 0.24 * (1 - clarity(cfg.view, s.light.hallLux))
    const lights = { s, cfg, ...torchLights(sim, s) }
    this.lights = lights
    this.stepEyes(v.scene, sim, s, cfg, adapt, lights.spots, lights.lits)
    const view = v.lens.screen.view()
    this.mask?.paint(view.x - view.w * MASK_PAD, view.y - view.h * MASK_PAD, view.w * (1 + 2 * MASK_PAD), view.h * (1 + 2 * MASK_PAD), paintedEmojiOn())
    this.stepImpacts(v, s)
    this.stepChill(v, s, sunDeg, now)
    this.stepBats(v, s, sunDeg, dt)
    this.sunDeg = sunDeg
  }

  /** 火把：每名队员按世界里的火把状态画火苗与光晕，点着那一刻火光一涨、呼的一声，熄灭时冒一股烟；夜里几只飞蛾绕着火飞；把影子图与光照的参数交给着色器 */
  private stepTorches(v: ViewCtx, sim: Sim, s: AmethystState, cfg: AmethystConfig, dt: number, adapt: number): void {
    const d = this.data!
    const scene = v.scene
    const now = sim.elapsedMs
    let n = 0
    const seen = new Set<number>()
    for (const m of sim.characters) {
      const t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m]) continue
      seen.add(m)
      let fx = this.torches.get(m)
      if (!fx || fx.uid !== t.uid) {
        this.drop(fx)
        fx = {
          uid: t.uid,
          lit: 0,
          pop: 0,
          flame: scene.add.image(0, 0, FLAME_KEY).setDepth(FLAME_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.85).setVisible(false),
          halo: scene.add.image(0, 0, GLOW_KEY).setDepth(FLAME_DEPTH - 0.05).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa04a).setVisible(false),
          moths: Array.from({ length: MOTHS }, () => scene.add.image(0, 0, MOTH_KEY).setDepth(MOTH_DEPTH).setVisible(false)),
        }
        this.torches.set(m, fx)
      }
      const size = charSize(m)
      const spot = torchSpot(Transform.x[m]!, Transform.y[m]!, size)
      if (t.lit > 0 && fx.lit <= 0) {
        fx.pop = 320
        playSfx('ignite')
        this.embers?.explode(8, spot.x, spot.y)
      } else if (t.lit <= 0 && fx.lit > 0) {
        playSfx('snuff')
        this.smoke?.explode(5, spot.x, spot.y)
      }
      fx.lit = t.lit
      fx.pop = Math.max(0, fx.pop - dt)
      const on = t.lit > 0
      fx.flame.setVisible(on)
      fx.halo.setVisible(on)
      fx.moths.forEach((moth, i) => this.flutter(moth, spot, t.lit, now, m * 7 + i))
      if (!on) continue
      const flicker = 0.9 + 0.06 * Math.sin(now / 47 + m) + 0.05 * Math.sin(now / 113 + m * 3.1)
      const boost = 1 + 0.6 * (fx.pop / 320)
      fx.flame
        .setPosition(spot.x, spot.y)
        .setScale(((0.3 * UNIT) / 32) * t.lit * (0.9 + 0.12 * flicker) * boost, ((0.5 * UNIT) / 48) * t.lit * flicker * boost)
        .setRotation(Math.sin(now / 160 + m) * 0.08)
      fx.halo.setPosition(spot.x, spot.y).setScale(((1.9 * UNIT) / 64) * t.lit * boost).setAlpha(0.3 * flicker)
      if (Math.random() < dt * 0.004 * t.lit) this.embers?.emitParticleAt(spot.x + (Math.random() - 0.5) * 6, spot.y - 8, 1)
      if (Math.random() < dt * 0.003 * t.lit) this.smoke?.emitParticleAt(spot.x, spot.y - 10, 1)
      if (n >= MAX_TORCHES) continue
      const z = reliefAt(s.light, Transform.x[m]!, Transform.y[m]!) + cfg.torch.heightM
      castShade(s.light, spot.x, spot.y, z, d.shadeImg.data, n)
      this.u.torch.set([spot.x, spot.y, (cfg.torch.candela * t.lit * flicker * boost) / adapt, z], n * 4)
      n++
    }
    for (const [m, fx] of this.torches) {
      if (seen.has(m)) continue
      this.drop(fx)
      this.torches.delete(m)
    }
    this.u.torchCount = n
    if (n > 0) {
      d.shade.getContext().putImageData(d.shadeImg, 0, 0)
      upload(d.shade)
    }
  }

  /** 一只飞蛾绕着火苗打转：忽远忽近、忽高忽低，翅膀一开一合；火把灭了就散了 */
  private flutter(moth: Phaser.GameObjects.Image, spot: Point, lit: number, now: number, seed: number): void {
    if (lit < 0.5) {
      moth.setVisible(false)
      return
    }
    const t = now / 1000
    const k = (seed * 0.618034) % 1
    const a = t * (2.2 + 1.4 * k) * (seed % 2 === 0 ? 1 : -1) + k * 6.283
    const r = (0.32 + 0.22 * Math.sin(t * (1.3 + k) + seed)) * UNIT
    const x = spot.x + Math.cos(a) * r
    const y = spot.y - 0.25 * UNIT + Math.sin(a) * r * 0.55 + Math.sin(t * 3.1 + seed) * 0.08 * UNIT
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 26 + seed))
    const size = (0.24 * UNIT) / 48
    moth
      .setVisible(true)
      .setPosition(x, y)
      .setRotation(a + (seed % 2 === 0 ? Math.PI : 0))
      .setScale(size * flap, size)
      .setAlpha(0.85 * (lit - 0.5) * 2)
  }

  private drop(fx: TorchFx | undefined): void {
    if (!fx) return
    fx.flame.destroy()
    fx.halo.destroy()
    for (const m of fx.moths) m.destroy()
  }

  /** 立着的身体朝光多的一侧亮：天光与反光不分方向，直射与火把按迎着它受的照度定方向，有方向的光占得越多明暗越分明 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const c = this.lights
    if (!c) return
    const t = this.facing
    facingAt(c.s.light, c.s.layout.ceilingM, this.sky, c.cfg.torch, c.spots, c.lits, x, y, t)
    out.kx = t.e > 0 ? t.x / t.e : 0
    out.ky = t.e > 0 ? t.y / t.e : 0
  }

  /** 黑暗里的敌人与快要出来的敌人（在它进场的起点）：被火把照到一点、自己又在暗处时，眼睛把火光反回来，露出一对亮点；偶尔眨一下 */
  private stepEyes(scene: Phaser.Scene, sim: Sim, s: AmethystState, cfg: AmethystConfig, adapt: number, spots: readonly Point[], lits: readonly number[]): void {
    let used = 0
    if (spots.length > 0) {
      const view = sim.view
      // 从上面落下来的还不在地上
      const lurking = [...query(sim.world, [Telegraph, Transform])]
        .filter((t) => telegraphEntry[t]?.enter !== 'drop')
        .map((t) => ({ eid: t, x: telegraphEntry[t]?.sx ?? Transform.x[t]!, y: telegraphEntry[t]?.sy ?? Transform.y[t]!, h: telegraphDef[t]!.size * (Telegraph.boss[t] ? 0.2 : 0.3) }))
      const bodies = [...query(sim.world, ENEMY_SET)].filter((eid) => Alive.v[eid]).map((eid) => ({ eid, x: Transform.x[eid]!, y: Transform.y[eid]!, h: Transform.h[eid]! }))
      for (const { eid, x, y, h } of [...bodies, ...lurking]) {
        if (x < view.x || x > view.right || y < view.y || y > view.bottom) continue
        const torch = torchesAt(cfg.torch, spots, lits, x, y)
        const e = (diffuseAt(s.light, x, y) + directAt(s.light, s.layout.ceilingM, this.sky, x, y) + torch) / adapt
        const shown = (1 - ease(0.06, 0.25, e)) * ease(0.004, 0.05, torch)
        if (shown <= 0.02) continue
        const blink = Math.sin(sim.elapsedMs / 1700 + eid * 1.7) > 0.96 ? 0 : 1
        for (const side of [-1, 1]) {
          let img = this.eyes[used]
          if (!img) {
            img = scene.add.image(0, 0, GLOW_KEY).setDepth(FLAME_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd98a)
            this.eyes.push(img)
            this.visuals.push(img)
          }
          img
            .setVisible(true)
            .setPosition(x + side * h * 0.1, y - h * 0.12)
            .setScale(((0.16 + 0.04 * Math.min(1, h / UNIT)) * UNIT) / 64)
            .setAlpha(shown * blink * 0.9)
          used++
        }
      }
    }
    for (let i = used; i < this.eyes.length; i++) this.eyes[i]!.setVisible(false)
  }

  /** 子弹与出手敲在晶体上：迸出几片碎晶，镜头里的叮一声 */
  private stepImpacts(v: ViewCtx, s: AmethystState): void {
    if (s.impacts.length === 0) return
    for (const p of s.impacts) {
      if (!v.lens.screen.sees(p.x, p.y, UNIT)) continue
      this.shards?.explode(4, p.x, p.y)
      playSfx('tink')
    }
    s.impacts.length = 0
  }

  /** 黄昏太阳落到地平线上下时晶体遇冷：镜头里随机一丛晶簇叮的一声、闪一下，隔一两秒一回 */
  private stepChill(v: ViewCtx, s: AmethystState, sunDeg: number, now: number): void {
    for (const f of this.flashes) {
      const k = (now - f.at) / 700
      f.img.setAlpha(k < 1 ? 0.8 * Math.sin(Math.PI * k) : 0).setVisible(k < 1)
    }
    const cooling = sunDeg < CHILL_DEG && sunDeg > -CHILL_DEG && sunDeg < this.sunDeg
    if (!cooling || now < this.chillAt) return
    this.chillAt = now + 900 + Math.random() * 1400
    const near = s.layout.clusters.filter((c) => v.lens.screen.sees(c.x, c.y, -UNIT))
    const c = near[Math.floor(Math.random() * near.length)]
    if (!c) return
    const q = c.prisms[c.prisms.length - 1]!
    const x = q.x + Math.cos(q.dir) * q.reach
    const y = q.y + Math.sin(q.dir) * q.reach
    let f = this.flashes.find((e) => now - e.at >= 700)
    if (!f) {
      f = { img: v.scene.add.image(0, 0, GLOW_KEY).setDepth(FLAME_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd9bfff), at: 0 }
      this.flashes.push(f)
      this.visuals.push(f.img)
    }
    f.at = now
    f.img.setPosition(x, y).setScale((0.7 * UNIT) / 64)
    playSfx('tink')
  }

  /** 太阳落过 BAT_OUT_DEG 时一群蝙蝠从暗道里动身出洞，升过 BAT_IN_DEG 时从塌顶飞回来；每只沿自己的路线飞，忽左忽右地扑，到了终点就不见了 */
  private stepBats(v: ViewCtx, s: AmethystState, sunDeg: number, dt: number): void {
    if (this.sunDeg >= BAT_OUT_DEG && sunDeg < BAT_OUT_DEG) this.flock(v, s, true)
    if (this.sunDeg <= BAT_IN_DEG && sunDeg > BAT_IN_DEG) this.flock(v, s, false)
    const t = dt / 1000
    const speed = BAT_SPEED_U * UNIT
    const reach = BAT_REACH_U * UNIT
    const kept: Bat[] = []
    for (const b of this.bats) {
      if (b.wait > 0) {
        b.wait -= dt
        kept.push(b)
        continue
      }
      const goal = b.route[b.leg]!
      const last = b.leg === b.route.length - 1
      const dx = goal.x - b.x
      const dy = goal.y - b.y
      const dist = Math.hypot(dx, dy) || 1
      // 侧着拐的分量：出洞的到了塌顶下就绕着它打转，越近转得越紧；一路上忽左忽右地扑
      const side = (b.out && last ? b.spin * Math.min(2.5, (2 * UNIT) / dist) : 0) + 0.35 * Math.sin(this.u.time * 7 + b.phase)
      const n = dist * Math.hypot(1, side)
      const k = Math.min(1, t * 4)
      b.vx += (((dx - dy * side) / n) * speed - b.vx) * k
      b.vy += (((dy + dx * side) / n) * speed - b.vy) * k
      b.x += b.vx * t
      b.y += b.vy * t
      if (b.out && last) b.alt = Math.min(1, b.alt + t * (dist < 2.5 * UNIT ? 0.5 : 0.12))
      if (!b.out) b.alt = Math.max(0, b.alt - t * 0.55)
      if (!last && dist < reach) b.leg++
      if (b.out ? b.alt >= 1 : last && dist < reach) {
        b.img.destroy()
        continue
      }
      const span = ((BAT_LOW_U + (BAT_HIGH_U - BAT_LOW_U) * b.alt) * UNIT) / 64
      b.img
        .setVisible(true)
        .setPosition(b.x, b.y)
        .setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2)
        .setScale(span * (0.55 + 0.45 * Math.abs(Math.sin(this.u.time * 15 + b.phase))), span)
        .setAlpha(1 - ease(0.7, 1, b.alt))
      kept.push(b)
    }
    this.bats = kept
  }

  /** 一群蝙蝠轮流分到各条暗道：出洞的从尽头沿暗道飞到洞口，再飞向离洞口最近的塌顶；回洞的从塌顶落下来，反着飞回暗道尽头 */
  private flock(v: ViewCtx, s: AmethystState, out: boolean): void {
    const L = s.layout
    if (L.tunnels.length === 0 || L.breaches.length === 0) return
    playSfx('flutter')
    const spin = Math.random() < 0.5 ? 1 : -1
    const spread = (p: Point, r: number): Point => ({ x: p.x + (Math.random() - 0.5) * r, y: p.y + (Math.random() - 0.5) * r })
    for (let i = 0; i < BATS; i++) {
      const tn = L.tunnels[i % L.tunnels.length]!
      const mouth = tn.path[0]!
      let sky = L.breaches[0]!
      for (const b of L.breaches) if (Math.hypot(b.x - mouth.x, b.y - mouth.y) < Math.hypot(sky.x - mouth.x, sky.y - mouth.y)) sky = b
      // 暗道里从尽头到洞口的几处，各自错开一点
      const inside = tn.path
        .slice()
        .reverse()
        .map((p, k) => spread(p, k === 0 ? tn.pocket : tn.half))
      const a = Math.random() * Math.PI * 2
      const top = { x: sky.x + Math.cos(a) * sky.r * 0.4, y: sky.y + Math.sin(a) * sky.r * 0.4 }
      const route = out ? [...inside, top] : [top, ...inside.reverse()]
      const from = route[0]!
      this.bats.push({
        x: from.x,
        y: from.y,
        vx: 0,
        vy: 0,
        leg: 1,
        alt: out ? 0 : 1,
        wait: i * BAT_GAP_MS * (0.5 + Math.random()),
        route,
        out,
        spin: spin * (0.8 + 0.4 * Math.random()) * (Math.random() < 0.85 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        img: v.scene.add.image(from.x, from.y, BAT_KEY).setDepth(BAT_DEPTH).setVisible(false),
      })
    }
  }

  destroy(v: ViewCtx): void {
    this.vignette = undefined
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    for (const fx of this.torches.values()) this.drop(fx)
    this.torches.clear()
    this.mask?.destroy()
    this.mask = undefined
    this.lights = undefined
    this.data = undefined
    this.eyes = []
    this.flashes = []
    for (const b of this.bats) b.img.destroy()
    this.bats = []
    this.embers = undefined
    this.smoke = undefined
    this.shards = undefined
    for (const key of [ALBEDO_KEY, FACE_KEY, GEO_KEY, LUX_KEY, SHADE_KEY, MASK_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
