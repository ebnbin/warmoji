import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { MAPS, rollDecor } from '../../data/maps'
import { viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { decorSprite } from '../../ecs/decor'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapDef } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import { query } from 'bitecs'
import { Alive, ENEMY_SET, Telegraph, Transform, Uid } from '../../ecs/components'
import { telegraphDef, telegraphEntry } from '../../ecs/store'
import { canvasTexture } from '../textures'
import { castShade, drawBat, drawFlame, drawHalo as drawCaveHalo, drawRim, drawSmoke, encodeField, fieldOf, GLOW_FRAG, heightRange, LIGHT_FRAG, MAX_BLOCKS, MAX_TORCHES, modulateMode, paintSky, RELIEF_PPU, SHADE_BINS, SHADE_ROWS, SKY_PPU } from './render'
import { CavePainter } from './painter'
import { diffuseLux, directLux, heightM, inPool, lightToward, roomOf, torchesLux, torchSpot } from './model'
import type { CaveLayout, CaveState, Toward } from './model'
import { UprightMask } from '../../ecs/render/upright'
import { paintedEmojiOn } from '../../emoji/style'
import { skyColor, sunColor, viewU, visibility } from './sky'
import { GROUND_PPU } from '../../data/texel'
import { charSize } from '../../ecs/systems/shared/scale'
import { playSfx } from '../../audio/sfx'
import type { Framing } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'

const CAVE_BG = 0x050807
const CAVE_ALBEDO_KEY = 'cave-albedo'
const CAVE_GEO_KEY = 'cave-geo'
const CAVE_NORM_KEY = 'cave-norm'
const CAVE_SKY_KEY = 'cave-sky'
const CAVE_FIELD_KEY = 'cave-field'
const CAVE_SHADE_KEY = 'cave-shade'
const CAVE_FLAME_KEY = 'cave-flame'
const CAVE_HALO_KEY = 'cave-halo'
const CAVE_SMOKE_KEY = 'cave-smoke'
const CAVE_BAT_KEY = 'cave-bat'
const CAVE_RIM_KEY = 'cave-rim'
/** 开局最多几个线程分着画地面 */
const CAVE_THREADS = 4
/** 洞里的光压在实体、特效与血条上面，指向箭头与伤害数字下面：那些是给人看的，不该被黑暗吞掉 */
const CAVE_LIGHT_DEPTH = 39
const CAVE_GLOW_DEPTH = 39.1
const CAVE_FLAME_DEPTH = 39.3
/** 镜头与眼睛跟上亮度变化的时间常数，毫秒 */
const CAVE_VIEW_TAU = 700
const CAVE_ADAPT_TAU = 900
const CAVE_TORCH_COLOR = [1, 0.6, 0.28] as const
const CAVE_MOON_COLOR = [0.8, 0.86, 1] as const
/** 石灰岩把光反出来时染上的颜色 */
const CAVE_LIMESTONE = [0.96, 0.99, 1] as const
/** 最暗的地方也留一点冷灰 */
const CAVE_FLOOR = [0.018, 0.024, 0.022] as const
/** 水里的浮游生物在暗处发出的光，叠加到画面上的最大亮度 */
const CAVE_POOL_GLOW = [0.02, 0.2, 0.12] as const
/** 荧光丛两种菌的光晕：薄荷与翡翠 */
const CAVE_GLOW_TINTS = [0x7af5c8, 0x3fe89c] as const
/** 光柱里水雾浮尘把多少直射光散向镜头 */
const CAVE_SCATTER = 0.012
/** 天窗口那圈植物的贴图每格多少像素 */
const CAVE_RIM_PPU = 24
const CAVE_MASK_KEY = 'cave-mask'
/** 立着的东西的遮罩图边长，像素：盖住镜头拍到的范围，四边再各外扩 CAVE_MASK_PAD 倍 */
const CAVE_MASK_PX = 512
const CAVE_MASK_PAD = 0.1
/** 太阳落到这个高度蝙蝠出洞、黎明升到这个高度回洞，度：洞里还看得清，一群黑影预告天要黑了、天快亮了 */
const BAT_OUT_DEG = 1
const BAT_IN_DEG = -1
const BAT_COUNT = 34

/** 一名队员手里的火把在画面上的样子：uid 对不上就是换了人；pop 是刚点着时火光一涨的剩余时间 */
interface TorchFx {
  uid: number
  lit: number
  pop: number
  readonly flame: Phaser.GameObjects.Image
  readonly halo: Phaser.GameObjects.Image
}

/** 一只蝙蝠：出洞的盘旋着朝天窗飞、越飞越高，回洞的从天窗盘旋着落进支洞；alt 是离洞底多高（0–1） */
interface Bat {
  x: number
  y: number
  vx: number
  vy: number
  readonly tx: number
  readonly ty: number
  alt: number
  readonly out: boolean
  readonly spin: number
  readonly flap: number
  readonly img: Phaser.GameObjects.Image
}

/** 水潭或石笋尖上的一滴水溅开的圈 */
interface DripRing {
  readonly x: number
  readonly y: number
  readonly at: number
  readonly r: number
  readonly pool: boolean
}

/**
 * 溶洞：地面是后台线程画的固有色，光照由着色器按正片叠底压在整个画面上——天窗的直射光斑随太阳移动、被石柱石笋挡出影子，
 * 天光与反光从照度场来，火把按点光源照、被岩石挡住；光柱里水雾与浮尘发亮，天窗下的水潭倒映着天。
 * 镜头按洞里的平均照度推拉：亮时拉远看大半个洞，暗时推到火把那一圈；眼睛跟着适应，最暗只适应到 view.brightLux，再暗画面就跟着暗、镜头跟着收。
 * 火把点着、熄灭有火光与声音，冒烟和火星；黑暗里的敌人露出反光的眼睛；荧光丛与水潭在夜里发出翡翠色的光；黄昏蝙蝠出洞、黎明回洞；水滴落进水潭溅开涟漪
 */
export class CaveView extends BoundedView {
  private painter?: CavePainter
  private data?: { field: Phaser.Textures.CanvasTexture; fieldImg: ImageData; shade: Phaser.Textures.CanvasTexture; shadeImg: ImageData; version: number }
  private readonly u = {
    sun: [0, 0, 0, 0],
    sunCol: [1, 1, 1],
    moon: [0, 0, 0, 0],
    moonCol: [...CAVE_MOON_COLOR],
    skyCol: [1, 1, 1],
    bounceCol: [1, 1, 1],
    logAdapt: 2,
    torch: new Float32Array(MAX_TORCHES * 4),
    torchCount: 0,
    block: new Float32Array(MAX_BLOCKS * 4),
    blockCount: 0,
    skyBright: 0,
    time: 0,
    mist: 0,
    day: 1,
    poolGlow: 0,
  }
  private viewU = 0
  private adapt = 1
  private torches = new Map<number, TorchFx>()
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private smoke?: Phaser.GameObjects.Particles.ParticleEmitter
  private eyes: Phaser.GameObjects.Image[] = []
  private glows: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = []
  private bats: Bat[] = []
  private ripples: DripRing[] = []
  private rippleGfx?: Phaser.GameObjects.Graphics
  private dripAt = 0
  private sunDeg = 0
  private vignette?: Phaser.Filters.Vignette
  private mask?: UprightMask
  /** 这一帧洞里的光与点着的火把：单位按它分明暗 */
  private lights?: { s: CaveState; torch: NonNullable<MapDef['cave']>['torch']; spots: Point[]; lits: number[] }
  private readonly toward: Toward = { x: 0, y: 0, e: 0 }

  /** 洞里越亮看得越远：短边看到 viewU 格；洞里的光算出来之前按标准 */
  followZoom(): number {
    return this.viewU > 0 ? Math.min(viewport.logicalWidth, viewport.logicalHeight) / (this.viewU * UNIT) : 1
  }

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, CAVE_BG).setDepth(-2)))
    const scene = v.scene
    if (!scene.textures.exists(CAVE_FLAME_KEY)) canvasTexture(scene, CAVE_FLAME_KEY, 32, 48, (ctx) => drawFlame(ctx, 32, 48))
    if (!scene.textures.exists(CAVE_HALO_KEY)) canvasTexture(scene, CAVE_HALO_KEY, 64, 64, (ctx) => drawCaveHalo(ctx, 64))
    if (!scene.textures.exists(CAVE_SMOKE_KEY)) canvasTexture(scene, CAVE_SMOKE_KEY, 64, 64, (ctx) => drawSmoke(ctx, 64))
    if (!scene.textures.exists(CAVE_BAT_KEY)) canvasTexture(scene, CAVE_BAT_KEY, 64, 32, (ctx) => drawBat(ctx, 64, 32))
  }

  /** 布景要等洞的形状生成以后才撒得下去，见 scatterProps */
  decor(): void {}

  /** 骨头、蛛网、旧矿镐只撒在空着的洞底上：不进岩石、不落水潭、不压天窗下的碎石坡 */
  private scatterProps(v: ViewCtx, atlas: EcsAtlas, L: CaveLayout): void {
    const rng = new Rng(v.run.decorSeed)
    for (const d of rollDecor(v.def.decor, () => rng.next(), Math.round(v.w / UNIT), Math.round(v.h / UNIT))) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomOf(L.rock, x, y) < (d.sizeU / 2 + 0.15) * UNIT || inPool(L, x, y) || L.mounds.some((m) => Math.hypot(x - m.x, y - m.y) < m.r)) continue
      v.decor.push(decorSprite(atlas, d.emoji, x, y, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.cave
    if (!s) return
    const L = s.layout
    const cfg = v.def.cave!
    const scene = v.scene
    const f = fieldOf(L)
    const W = Math.round((f.w / UNIT) * GROUND_PPU)
    const H = Math.round((f.h / UNIT) * GROUND_PPU)
    const RW = Math.round((f.w / UNIT) * RELIEF_PPU)
    const RH = Math.round((f.h / UNIT) * RELIEF_PPU)
    const albedo = canvasTexture(scene, CAVE_ALBEDO_KEY, W, H)
    const geo = canvasTexture(scene, CAVE_GEO_KEY, RW, RH)
    const norm = canvasTexture(scene, CAVE_NORM_KEY, RW, RH)
    const painter = new CavePainter(L, GROUND_PPU, W, H, Math.max(1, Math.min(CAVE_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    await painter.paint(
      RW * RH,
      (r0, r1, pixels) => albedo.getContext().putImageData(new ImageData(pixels, W, r1 - r0), 0, r0),
      (g, n) => {
        geo.getContext().putImageData(new ImageData(g, RW, RH), 0, 0)
        norm.getContext().putImageData(new ImageData(n, RW, RH), 0, 0)
      },
    )
    if (this.painter !== painter) return
    painter.close()
    this.painter = undefined
    refreshLinear(albedo)
    refreshLinear(geo)
    refreshLinear(norm)
    const SW = Math.round((f.w / UNIT) * SKY_PPU)
    const SH = Math.round((f.h / UNIT) * SKY_PPU)
    canvasTexture(scene, CAVE_SKY_KEY, SW, SH, (ctx) => {
      const img = ctx.createImageData(SW, SH)
      paintSky(L, img.data)
      ctx.putImageData(img, 0, 0)
    })
    const field = canvasTexture(scene, CAVE_FIELD_KEY, s.light.cols, s.light.rows)
    const shade = canvasTexture(scene, CAVE_SHADE_KEY, SHADE_BINS, SHADE_ROWS)
    this.data = {
      field,
      fieldImg: field.getContext().createImageData(s.light.cols, s.light.rows),
      shade,
      shadeImg: shade.getContext().createImageData(SHADE_BINS, SHADE_ROWS),
      version: -1,
    }
    this.visuals.push(scene.add.image(f.x0, f.y0, CAVE_ALBEDO_KEY).setOrigin(0, 0).setDisplaySize(f.w, f.h).setDepth(-1))
    if (v.atlas) this.scatterProps(v, v.atlas, L)
    // 天窗口的一圈植物：洞顶的边上长着蕨，树根与藤垂进天窗
    L.openings.forEach((o, i) => {
      const size = Math.ceil(((o.r * 1.6) / UNIT + 1.5) * 2 * CAVE_RIM_PPU)
      const key = `${CAVE_RIM_KEY}-${i}`
      canvasTexture(scene, key, size, size, (ctx) => drawRim(ctx, o, CAVE_RIM_PPU, size, L.seed + i * 131))
      this.visuals.push(scene.add.image(o.x, o.y, key).setDisplaySize((size / CAVE_RIM_PPU) * UNIT, (size / CAVE_RIM_PPU) * UNIT).setDepth(29).setAlpha(0.9))
    })
    // 挡太阳与月光的石头：石柱一直挡，石笋按高矮挡，挑最粗的几块
    const blocks = [...L.columns.map((c) => ({ x: c.x, y: c.y, r: c.r, h: -1 })), ...L.stalagmites.map((st) => ({ x: st.x, y: st.y, r: st.r, h: st.h }))]
      .sort((a, b) => b.r - a.r)
      .slice(0, MAX_BLOCKS)
    blocks.forEach((b, i) => this.u.block.set([b.x, b.y, b.r, b.h], i * 4))
    this.u.blockCount = blocks.length
    const u = this.u
    const fieldRect = [f.x0, f.y0, f.w, f.h]
    const heightLo = heightRange(L)
    const maskTex = scene.textures.addDynamicTexture(CAVE_MASK_KEY, CAVE_MASK_PX, CAVE_MASK_PX)
    if (maskTex && v.atlas) this.mask = new UprightMask(scene, v.world, v.atlas, maskTex)
    const mask = this.mask
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'CaveLight',
            fragmentSource: LIGHT_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uField', 0)
              set('uGeo', 1)
              set('uNorm', 2)
              set('uSky', 3)
              set('uShade', 4)
              set('uRect', fieldRect)
              set('uField0', fieldRect)
              set('uHeight', [heightLo.lo, heightLo.span])
              set('uUnit', UNIT)
              set('uCeil', L.ceilingM)
              set('uSun', u.sun)
              set('uSunCol', u.sunCol)
              set('uMoon', u.moon)
              set('uMoonCol', u.moonCol)
              set('uSkyCol', u.skyCol)
              set('uBounceCol', u.bounceCol)
              set('uTorchCol', CAVE_TORCH_COLOR)
              set('uLogAdapt', u.logAdapt)
              set('uTorch[0]', u.torch)
              set('uTorchCount', u.torchCount)
              set('uBlock[0]', u.block)
              set('uBlockCount', u.blockCount)
              set('uFloor', CAVE_FLOOR)
              set('uMask', 5)
              set('uMask0', mask?.rect ?? [0, 0, 1, 1])
            },
          },
          f.x0,
          f.y0,
          f.w,
          f.h,
          [CAVE_FIELD_KEY, CAVE_GEO_KEY, CAVE_NORM_KEY, CAVE_SKY_KEY, CAVE_SHADE_KEY, CAVE_MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(CAVE_LIGHT_DEPTH)
        .setBlendMode(modulateMode(scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer)),
      scene.add
        .shader(
          {
            name: 'CaveGlow',
            fragmentSource: GLOW_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uGeo', 0)
              set('uSky', 1)
              set('uRect', fieldRect)
              set('uField0', fieldRect)
              set('uHeight', [heightLo.lo, heightLo.span])
              set('uUnit', UNIT)
              set('uCeil', L.ceilingM)
              set('uSun', u.sun)
              set('uSunCol', u.sunCol)
              set('uMoon', u.moon)
              set('uMoonCol', u.moonCol)
              set('uSkyCol', u.skyCol)
              set('uSkyBright', u.skyBright)
              set('uScatter', CAVE_SCATTER)
              set('uTime', u.time)
              set('uMist', u.mist)
              set('uDay', u.day)
              set('uPoolGlow', u.poolGlow)
              set('uPoolCol', CAVE_POOL_GLOW)
            },
          },
          f.x0,
          f.y0,
          f.w,
          f.h,
          [CAVE_GEO_KEY, CAVE_SKY_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(CAVE_GLOW_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD),
    )
    for (const g of L.glows) {
      const img = scene.add
        .image(g.x, g.y, CAVE_HALO_KEY)
        .setDepth(CAVE_FLAME_DEPTH - 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(CAVE_GLOW_TINTS[g.hue < 0.5 ? 0 : 1])
        .setScale((g.r * 3.2) / 64)
        .setAlpha(0)
      this.glows.push({ img, x: g.x, y: g.y, phase: g.hue * 17 })
      this.visuals.push(img)
    }
    this.embers = scene.add
      .particles(0, 0, CAVE_HALO_KEY, {
        lifespan: { min: 500, max: 1100 },
        speedX: { min: -12, max: 12 },
        speedY: { min: -60, max: -25 },
        scale: { start: 0.07, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe08a, 0xffa040, 0xff6a20],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(CAVE_FLAME_DEPTH + 0.05)
    this.smoke = scene.add
      .particles(0, 0, CAVE_SMOKE_KEY, {
        lifespan: { min: 1200, max: 2200 },
        speedX: { min: -8, max: 10 },
        speedY: { min: -34, max: -16 },
        scale: { start: 0.12, end: 0.55 },
        alpha: { start: 0.22, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x33373a, 0x41464a, 0x292c2f],
        emitting: false,
      })
      .setDepth(28)
    this.rippleGfx = scene.add.graphics().setDepth(-0.4)
    this.visuals.push(this.embers, this.smoke, this.rippleGfx)
    this.vignette = v.lens.screen.vignette(0.78, 0.18, 0x030605)
    this.sunDeg = s.sky.sun.elev / DEG_CAVE
    this.viewU = viewU(cfg.view, s.light.hallLux)
    this.adapt = Math.max(cfg.view.brightLux, s.light.hallLux)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.cave
    const d = this.data
    if (!s || !d) return
    const cfg = v.def.cave!
    const L = s.layout
    const now = sim.elapsedMs
    const dt = Math.min(delta, 100)
    if (d.version !== s.light.version) {
      d.version = s.light.version
      encodeField(s.light, d.fieldImg.data)
      d.field.getContext().putImageData(d.fieldImg, 0, 0)
      refreshLinear(d.field)
    }
    // 眼睛按洞里的平均照度适应（对数上平滑地跟），最暗适应到 view.brightLux
    const target = Math.max(cfg.view.brightLux, s.light.hallLux)
    this.adapt = 10 ** (Math.log10(this.adapt) + (Math.log10(target) - Math.log10(this.adapt)) * (1 - Math.exp(-dt / CAVE_ADAPT_TAU)))
    const adapt = this.adapt
    const sky = s.sky
    const sunDeg = sky.sun.elev / DEG_CAVE
    const u = this.u
    u.time = now / 1000
    u.logAdapt = Math.log10(adapt)
    const cot = (e: number): number => Math.cos(e) / Math.max(Math.sin(e), 1e-3)
    u.sun[0] = sky.sun.x
    u.sun[1] = sky.sun.y
    u.sun[2] = cot(sky.sun.elev)
    u.sun[3] = faint(sky.sun.elev > 0 ? sky.sunLux / adapt : 0)
    const sc = sunColor(sunDeg)
    u.sunCol[0] = sc[0]
    u.sunCol[1] = sc[1]
    u.sunCol[2] = sc[2]
    u.moon[0] = sky.moon.x
    u.moon[1] = sky.moon.y
    u.moon[2] = cot(sky.moon.elev)
    u.moon[3] = faint(sky.moon.elev > 0 ? sky.moonLux / adapt : 0)
    const kc = skyColor(sunDeg)
    u.skyCol[0] = kc[0]
    u.skyCol[1] = kc[1]
    u.skyCol[2] = kc[2]
    const sunShare = sky.sunLux * Math.max(0, Math.sin(sky.sun.elev)) / Math.max(1e-9, sky.sunLux * Math.max(0, Math.sin(sky.sun.elev)) + sky.skyLux)
    for (let k = 0; k < 3; k++) u.bounceCol[k] = (sc[k]! * sunShare + kc[k]! * (1 - sunShare)) * CAVE_LIMESTONE[k]!
    const bm = Math.max(u.bounceCol[0]!, u.bounceCol[1]!, u.bounceCol[2]!)
    for (let k = 0; k < 3; k++) u.bounceCol[k] = u.bounceCol[k]! / bm
    u.skyBright = (sky.skyLux + sky.moonSkyLux) / adapt
    u.mist = smoothCave(-6, 4, sunDeg) * (1 - smoothCave(8, 25, sunDeg)) * (sky.hour < 12 ? 1 : 0.4)
    this.stepTorches(v, sim, s, dt, adapt)
    const want = viewU(cfg.view, s.light.hallLux)
    this.viewU += (want - this.viewU) * (1 - Math.exp(-dt / CAVE_VIEW_TAU))
    const dark = 1 - visibility(cfg.view, s.light.hallLux)
    if (this.vignette) this.vignette.strength = 0.18 + 0.22 * dark
    u.day = 1 - dark
    u.poolGlow = dark
    const lights = { s, torch: cfg.torch, ...this.torchLights(sim, s) }
    this.lights = lights
    this.stepEyes(v.scene, sim, s, adapt, lights.spots, lights.lits)
    const view = v.lens.screen.view()
    this.mask?.paint(view.x - view.w * CAVE_MASK_PAD, view.y - view.h * CAVE_MASK_PAD, view.w * (1 + 2 * CAVE_MASK_PAD), view.h * (1 + 2 * CAVE_MASK_PAD), paintedEmojiOn())
    for (const g of this.glows) {
      const x = (diffuseLux(s.light, g.x, g.y) + directLux(L, sky, g.x, g.y, 0)) / adapt
      g.img.setAlpha((0.68 + 0.14 * Math.sin(now / 900 + g.phase)) * (1 - smoothCave(0.04, 0.5, x)))
    }
    this.stepBats(v, s, sunDeg, dt)
    this.stepDrips(v, s, now)
    this.sunDeg = sunDeg
  }

  /** 火把：每名活着的队员按世界里的火把状态画火苗与光晕，点着那一刻火光一涨、呼的一声，熄灭时冒一股烟；把影子图与光照的参数交给着色器 */
  private stepTorches(v: ViewCtx, sim: Sim, s: CaveState, dt: number, adapt: number): void {
    const d = this.data!
    const scene = v.scene
    const cfg = v.def.cave!.torch
    const now = sim.elapsedMs
    let n = 0
    const seen = new Set<number>()
    for (const m of sim.characters) {
      const t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m]) continue
      seen.add(m)
      let fx = this.torches.get(m)
      if (!fx || fx.uid !== t.uid) {
        fx?.flame.destroy()
        fx?.halo.destroy()
        fx = {
          uid: t.uid,
          lit: 0,
          pop: 0,
          flame: scene.add.image(0, 0, CAVE_FLAME_KEY).setDepth(CAVE_FLAME_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.85).setVisible(false),
          halo: scene.add.image(0, 0, CAVE_HALO_KEY).setDepth(CAVE_FLAME_DEPTH - 0.05).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a3c).setVisible(false),
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
      if (!on) continue
      const flicker = 0.9 + 0.06 * Math.sin(now / 47 + m) + 0.05 * Math.sin(now / 113 + m * 3.1)
      const boost = 1 + 0.6 * (fx.pop / 320)
      fx.flame
        .setPosition(spot.x, spot.y)
        .setScale(((0.3 * UNIT) / 32) * t.lit * (0.9 + 0.12 * flicker) * boost, ((0.5 * UNIT) / 48) * t.lit * flicker * boost)
        .setRotation(Math.sin(now / 160 + m) * 0.08)
      fx.halo.setPosition(spot.x, spot.y).setScale(((1.6 * UNIT) / 64) * t.lit * boost).setAlpha(0.32 * flicker)
      if (Math.random() < dt * 0.004 * t.lit) this.embers?.emitParticleAt(spot.x + (Math.random() - 0.5) * 6, spot.y - 8, 1)
      if (Math.random() < dt * 0.003 * t.lit) this.smoke?.emitParticleAt(spot.x, spot.y - 10, 1)
      if (n < MAX_TORCHES) {
        castShade(s.layout.rock, spot.x, spot.y, d.shadeImg.data, n)
        const ground = heightM(s.layout, Transform.x[m]!, Transform.y[m]!)
        this.u.torch.set([spot.x, spot.y, (cfg.candela * t.lit * flicker * boost) / adapt, ground + cfg.heightM], n * 4)
        n++
      }
    }
    for (const [m, fx] of this.torches) {
      if (seen.has(m)) continue
      fx.flame.destroy()
      fx.halo.destroy()
      this.torches.delete(m)
    }
    this.u.torchCount = n
    if (n > 0) {
      d.shade.getContext().putImageData(d.shadeImg, 0, 0)
      refreshLinear(d.shade)
    }
  }

  /** 点着的火把在哪、多亮 */
  private torchLights(sim: Sim, s: CaveState): { spots: Point[]; lits: number[] } {
    const spots: Point[] = []
    const lits: number[] = []
    for (const m of sim.characters) {
      const t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m] || t.lit <= 0) continue
      spots.push(torchSpot(Transform.x[m]!, Transform.y[m]!, charSize(m)))
      lits.push(t.lit)
    }
    return { spots, lits }
  }

  /** 立着的身体朝光多的一侧亮：天光不分方向，直射与火把按迎着它受的照度定方向，有方向的光占得越多明暗越分明 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const c = this.lights
    if (!c) return
    const t = this.toward
    lightToward(c.s.layout, c.s.light, c.s.sky, c.torch, c.spots, c.lits, x, y, t)
    out.kx = t.e > 0 ? t.x / t.e : 0
    out.ky = t.e > 0 ? t.y / t.e : 0
  }

  /** 黑暗里的敌人与快要出来的敌人（在它进场的起点）：被火把照到一点、自己又在暗处时，眼睛把火光反回来，露出一对亮点；偶尔眨一下 */
  private stepEyes(scene: Phaser.Scene, sim: Sim, s: CaveState, adapt: number, spots: readonly Point[], lits: readonly number[]): void {
    const cfg = MAPS[sim.mapId].cave!
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
        const torch = torchesLux(cfg.torch, spots, lits, x, y)
        const e = (diffuseLux(s.light, x, y) + directLux(s.layout, s.sky, x, y, 0) + torch) / adapt
        const shown = (1 - smoothCave(0.06, 0.25, e)) * smoothCave(0.004, 0.05, torch)
        if (shown <= 0.02) continue
        const blink = Math.sin(sim.elapsedMs / 1700 + eid * 1.7) > 0.96 ? 0 : 1
        for (const side of [-1, 1]) {
          let img = this.eyes[used]
          if (!img) {
            img = scene.add.image(0, 0, CAVE_HALO_KEY).setDepth(CAVE_FLAME_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a)
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

  /** 黄昏太阳落到 BAT_OUT_DEG 时一群蝙蝠从支洞里飞出、绕着主天窗盘旋着升出去；黎明升到 BAT_IN_DEG 时从天窗飞回支洞 */
  private stepBats(v: ViewCtx, s: CaveState, sunDeg: number, dt: number): void {
    const L = s.layout
    const main = L.openings[0]
    if (main && this.sunDeg >= BAT_OUT_DEG && sunDeg < BAT_OUT_DEG) this.flock(v, s, true)
    if (main && this.sunDeg <= BAT_IN_DEG && sunDeg > BAT_IN_DEG) this.flock(v, s, false)
    const t = dt / 1000
    const kept: Bat[] = []
    for (const b of this.bats) {
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const dist = Math.hypot(dx, dy) || 1
      const speed = (b.out ? 5.5 : 6.5) * UNIT
      const swirl = b.spin * Math.min(1, dist / (2.5 * UNIT))
      const wantX = (dx / dist) * speed - (dy / dist) * speed * swirl
      const wantY = (dy / dist) * speed + (dx / dist) * speed * swirl
      b.vx += (wantX - b.vx) * Math.min(1, t * 2.5)
      b.vy += (wantY - b.vy) * Math.min(1, t * 2.5)
      b.x += b.vx * t
      b.y += b.vy * t
      if (b.out) b.alt = Math.min(1, b.alt + t * (dist < 3 * UNIT ? 0.55 : 0.08))
      else b.alt = Math.max(0, b.alt - t * (dist < 1.5 * UNIT ? 1.2 : 0.25))
      const gone = b.out ? b.alt >= 1 : b.alt <= 0 && dist < 0.6 * UNIT
      if (gone) {
        b.img.destroy()
        continue
      }
      const flap = 0.55 + 0.45 * Math.abs(Math.sin(this.u.time * 18 + b.flap))
      const size = ((0.7 + b.alt * 0.9) * UNIT) / 64
      b.img
        .setPosition(b.x, b.y)
        .setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2)
        .setScale(size * flap, size)
        .setAlpha(b.out ? 1 - smoothCave(0.75, 1, b.alt) : smoothCave(0, 0.25, b.alt) * 0.7 + 0.3)
      kept.push(b)
    }
    this.bats = kept
  }

  private flock(v: ViewCtx, s: CaveState, out: boolean): void {
    const L = s.layout
    const main = L.openings[0]!
    const homes = L.alcoves.map((a) => a.path[a.path.length - 1]!)
    if (homes.length === 0) return
    playSfx('flutter')
    for (let i = 0; i < BAT_COUNT; i++) {
      const home = homes[i % homes.length]!
      const jx = (Math.random() - 0.5) * 1.2 * UNIT
      const jy = (Math.random() - 0.5) * 1.2 * UNIT
      const a = Math.random() * Math.PI * 2
      const fromX = out ? home.x + jx : main.x + Math.cos(a) * main.r * 0.6
      const fromY = out ? home.y + jy : main.y + Math.sin(a) * main.r * 0.6
      const img = v.scene.add.image(fromX, fromY, CAVE_BAT_KEY).setDepth(29.5).setAlpha(0)
      this.visuals.push(img)
      this.bats.push({
        x: fromX,
        y: fromY,
        vx: 0,
        vy: 0,
        tx: out ? main.x : home.x + jx,
        ty: out ? main.y : home.y + jy,
        alt: out ? 0 : 1,
        out,
        spin: (0.6 + Math.random() * 0.8) * (Math.random() < 0.8 ? 1 : -1),
        flap: Math.random() * 6.28,
        img,
      })
    }
  }

  /** 洞顶的水一滴滴落下：落进水潭溅开两圈涟漪，落在石笋尖上溅开一小圈；镜头里的才响 */
  private stepDrips(v: ViewCtx, s: CaveState, now: number): void {
    const g = this.rippleGfx
    if (!g) return
    const L = s.layout
    const screen = v.lens.screen
    if (now >= this.dripAt) {
      this.dripAt = now + 450 + Math.random() * 900
      const pools = L.pools.length
      const pick = Math.floor(Math.random() * (pools + L.stalagmites.length))
      let x: number
      let y: number
      let pool: boolean
      if (pick < pools) {
        const p = L.pools[pick]!
        const a = Math.random() * Math.PI * 2
        const rr = Math.sqrt(Math.random()) * 0.6
        x = p.x + Math.cos(a) * p.rx * rr
        y = p.y + Math.sin(a) * p.ry * rr
        pool = true
      } else {
        const st = L.stalagmites[pick - pools]!
        x = st.x
        y = st.y
        pool = false
      }
      this.ripples.push({ x, y, at: now, r: (pool ? 0.9 : 0.3) * UNIT, pool })
      if (screen.sees(x, y)) playSfx('drip')
    }
    g.clear()
    this.ripples = this.ripples.filter((r) => now - r.at < 1400)
    for (const r of this.ripples) {
      const k = (now - r.at) / 1400
      for (const lag of r.pool ? [0, 0.28] : [0]) {
        const t = k - lag
        if (t <= 0) continue
        g.lineStyle(0.035 * UNIT, 0xd2f5e6, 0.5 * (1 - t) ** 2)
        g.strokeEllipse(r.x, r.y, r.r * 2 * t, r.r * 2 * t * 0.86)
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.vignette = undefined
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    for (const fx of this.torches.values()) {
      fx.flame.destroy()
      fx.halo.destroy()
    }
    this.torches.clear()
    this.mask?.destroy()
    this.mask = undefined
    this.lights = undefined
    this.data = undefined
    this.eyes = []
    this.glows = []
    this.bats = []
    this.ripples = []
    this.rippleGfx = undefined
    this.embers = undefined
    this.smoke = undefined
    for (const key of [CAVE_ALBEDO_KEY, CAVE_GEO_KEY, CAVE_NORM_KEY, CAVE_SKY_KEY, CAVE_FIELD_KEY, CAVE_SHADE_KEY, CAVE_MASK_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}

/** 重传画布贴图：重传会按游戏的像素风设置退回最近邻取样，溶洞的地面与数据图都要线性插值 */
function refreshLinear(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 直射弱过眼睛适应亮度的这么多倍就当没有：着色器省下挡光的计算 */
const CAVE_FAINT = 0.002
const faint = (x: number): number => (x < CAVE_FAINT ? 0 : x)
const DEG_CAVE = Math.PI / 180

function smoothCave(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
