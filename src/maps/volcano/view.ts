import Phaser from 'phaser'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { keepDecor } from '../../ecs/decor'
import type { Point } from '../../util/vec'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import { clamp01, drawBomb, encodeLava, GROUND_TILE, groundPpc, LAVA_FRAG, lavaShown, markGround, smooth, WIND } from './render'
import { canvasTexture, drawPuff, drawSpark } from '../textures'
import type { CellRect, GroundMarks, GroundPiece, LavaShown } from './render'
import { GroundPainter } from './painter'
import { cellAt, effusion } from './model'
import { roomAt } from '../basin'
import { gatesNow } from '../../ecs/worlds/gates'
import { AWAY } from '../../data/light'
import type { EruptionPhase, LavaField, VolcanoState } from './model'
import { bilinear } from '../grid'
import { playSfx } from '../../audio/sfx'
import { loadSettings } from '../../save/settings'
import { browserStorage } from '../../util/storage'
import type { Framing, Rect } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView, setOverlayFill } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'
import type { VolcanoConfig } from '../../types/maps'
import { encodeSnow, makeSnow, punchSnow, SHINE_PPC, shineSnow, SNOW_FRAG, stepSnow } from './snow'
import type { CraterHeat, Snow } from './snow'

const VOLCANO_BG = 0x150d0b
const PUFF_KEY = 'volcano-puff'
const SPARK_KEY = 'volcano-spark'
const BOMB_KEY = 'volcano-bomb'
/** 火山弹落地后那块发红的地面多久暗下去 */
const SPLAT_MS = 2600
const GROUND_KEY = 'volcano-ground'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 岩石新凝固后至少隔这么久才交一批补画，毫秒 */
const REPAINT_MS = 500
const LAVA_KEY = 'volcano-lava'
const AUX_KEY = 'volcano-aux'
const SNOW_KEY = 'volcano-snow'
const SHINE_KEY = 'volcano-shine'
/** 火山弹往下落的重力加速度，米/秒² */
const VOLCANO_GRAVITY = 9.81
/** 熔岩映在身体上的补光：光色，最浓叠到多少；辉光场的值（喷发时按两倍算）到 span 时叠到最浓的六成多 */
const LAVA_ON_BODY = { color: 0xffa45c, max: 0.55, span: 0.2 } as const
/** 喷完以后火山口里的熔岩多久结满壳、暗下去，毫秒 */
const SETTLE_MS = 30000
/** 熔岩喷泉喷得最猛时每秒抛出几块岩浆 */
const FOUNTAIN_RATE = 160
/** 按镜头撒点，每格²每秒撒几处：落在雪区里按雪下得多大飘雪，雪区外偶尔扬起一点灰，喷发前后下风落灰 */
const AIR_RATE = 0.8
const DUST_SHARE = 0.06
/** 按镜头找冒汽的地方，每格²每秒看几处 */
const STEAM_RATE = 4

interface Bomb {
  x: number
  y: number
  vx: number
  vy: number
  /** 离地多高，米；vz 是往上的速度，米/秒 */
  z: number
  vz: number
  r: number
  spin: number
  rock: Phaser.GameObjects.Image
  glow: Phaser.GameObjects.Image
}

interface Splat {
  x: number
  y: number
  r: number
  at: number
}

/** 火山口此刻的样子，和它带出来的东西 */
interface Crater {
  /** 给熔岩着色器的 uPool：口里熔岩漫到口沿的几成、温度、喷涌的劲、口底裂缝透出的红光 */
  readonly pool: readonly [number, number, number, number]
  /** 预兆走到几成 */
  readonly warn: number
  /** 喷涌的劲：流量占峰值的几成 */
  readonly vigor: number
  /** 火山口一带受热化雪 */
  readonly melt: CraterHeat
  /** 雪上每秒落多少灰，再乘落灰的扇子 */
  readonly ash: number
  /** 空中飘的灰有多密，0 到 1 */
  readonly fallout: number
  /** 火山口每秒冒几团白汽、几团灰烟、几团喷发的灰柱 */
  readonly breath: number
  readonly plume: number
  readonly column: number
}

/**
 * 火山口此刻的样子：平时口底黑着，只冒一缕白汽；预兆时口底的裂缝透红，熔岩从通道里涌上来，口沿的雪被烤化，白汽变浓、冒起灰烟；
 * 喷发时熔岩漫过口沿，随流量变小凉下来、结出硬壳，灰柱冲起，下风落灰；喷完口里的熔岩结满壳、暗下去，汽慢慢小下去
 */
function craterNow(cfg: VolcanoConfig, s: VolcanoState, now: number): Crater {
  const e = cfg.eruption
  const rimU = cfg.cone.craterU
  const t = now - s.since
  if (s.phase === 'warn') {
    const w = Math.min(1, t / e.warnMs)
    return {
      pool: [0.45 * smooth(0.55, 1, w), 0.55 + 0.35 * w, 0, smooth(0, 0.6, w)],
      warn: w,
      vigor: 0,
      melt: { reachU: rimU + 0.1 + 0.5 * w, heat: w },
      ash: 0.03 * w,
      fallout: 0.15 * w,
      breath: 1.5 + 4 * w,
      plume: 3.5 * smooth(0.3, 1, w),
      column: 0,
    }
  }
  if (s.phase === 'erupt') {
    const vigor = effusion(e, t) / e.rate
    return {
      pool: [0.45 + 0.67 * Math.min(1, t / e.peakMs), 0.6 + 0.4 * vigor, vigor, 1],
      warn: 0,
      vigor,
      melt: { reachU: rimU + 1.5 + 0.8 * vigor, heat: 1 },
      ash: 0.02 + 0.25 * vigor,
      fallout: 0.25 + 0.75 * vigor,
      breath: 1,
      plume: 3 + 4 * vigor,
      column: 5 + 14 * vigor,
    }
  }
  const k = s.count > 0 ? clamp01(1 - t / SETTLE_MS) : 0
  return { pool: [k > 0 ? 1.12 : 0, 0.6 * k, 0, k], warn: 0, vigor: 0, melt: { reachU: rimU + 1.5 * k, heat: k }, ash: 0.02 * k, fallout: 0.25 * k, breath: 0.8 + 2.5 * k, plume: 2.5 * k, column: 0 }
}

/** 从 (x, y) 周围 spread 像素以内随机几处各冒一团，冒 n 的整数部分那么多团，返回剩下的零头 */
function puffAt(em: Phaser.GameObjects.Particles.ParticleEmitter | undefined, n: number, x: number, y: number, spread: number): number {
  for (; n >= 1; n--) {
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * spread
    em?.emitParticleAt(x + Math.cos(a) * d, y + Math.sin(a) * d, 1)
  }
  return n
}

/** 粒子出生后先淡入、临死淡出，最浓到 peak */
function fadeInOut(peak: number): Phaser.Types.GameObjects.Particles.EmitterOpCustomUpdateConfig {
  return { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.min(1, t * 5, (1 - t) * 3) * peak }
}

/** 熔岩的辉光场在 (x, y) 像素处的值 */
function glowAt(f: VolcanoState['field'], glow: Float32Array, x: number, y: number): number {
  return bilinear(glow, f.cols, f.rows, f.cell, f.x0, f.y0, x, y, 0)
}

/** 画好的一块地面的像素，和它在地面贴图上的左上角 */
function pieceImage(p: GroundPiece, ppc: number): { img: ImageData; x: number; y: number } {
  return { img: new ImageData(p.pixels, (p.rect.c1 - p.rect.c0) * ppc, (p.rect.r1 - p.rect.r0) * ppc), x: p.rect.c0 * ppc, y: p.rect.r0 * ppc }
}

/** 贴图上换一块像素：画布跟着换（显卡丢了上下文时 Phaser 拿整张画布重建），显卡上只重传这一块 */
function patchTexture(scene: Phaser.Scene, tex: Phaser.Textures.CanvasTexture, img: ImageData, x: number, y: number): void {
  tex.getContext().putImageData(img, x, y)
  const r = scene.renderer
  const gt = tex.source[0]!.glTexture
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !gt || r.gl.isContextLost()) return
  const gl = r.gl
  r.glTextureUnits.bind(gt, 0)
  r.glWrapper.updateTexturing({ texturing: { flipY: gt.flipY, premultiplyAlpha: gt.pma } })
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - img.height : y, gl.RGBA, gl.UNSIGNED_BYTE, img)
}

/**
 * 火山：盆地的边不画线，靠崖壁、高地与岩壁脚下的碎石看出来；地表按高度场打光，熔岩由着色器按每格的厚度、温度画出结壳与流动。
 * 火山连同周围一大片盖着雪，积雪是叠在地面上的一层着色器，按每格的积雪量涨落：熔岩盖过的地方雪没了，凝成的岩石凉透后雪又慢慢积回来；
 * 雪区里一直飘着雪，雪区外偶尔被风扬起一点灰，喷气孔冒白汽。平时火山口黑着，只冒一缕白汽；预兆时地震渐强，口底透红、口沿的雪化开，冒起灰烟；
 * 喷发时熔岩从口里翻涌着漫过口沿，熔岩喷泉一股股往上喷，灰柱冲起、下风落灰把雪染脏，火山弹随流量飞出，画面一闪一震；熔岩边化雪冒汽。
 */
export class VolcanoView extends BoundedView {
  private painter?: GroundPainter
  private ground?: { tex: Phaser.Textures.CanvasTexture; ppc: number; seen: Float32Array; dirty: Uint8Array; busy: boolean }
  private data?: { field: VolcanoState['field']; lava: Phaser.Textures.CanvasTexture; aux: Phaser.Textures.CanvasTexture; lavaImg: ImageData; auxImg: ImageData; glow: Float32Array; soft: Float32Array; shown: LavaShown }
  private snow?: { state: Snow; tex: Phaser.Textures.CanvasTexture; img: ImageData; shine: Phaser.Textures.CanvasTexture; shineImg: ImageData }
  private repaintAt = 0
  /** 上一步的模拟时刻：积雪按模拟走过的时间变 */
  private simAt = 0
  private readonly u = { time: 0, vigor: 0, pool: [0, 0, 0, 0], craterGlow: 0 }
  private breath?: Phaser.GameObjects.Particles.ParticleEmitter
  private plume?: Phaser.GameObjects.Particles.ParticleEmitter
  private column?: Phaser.GameObjects.Particles.ParticleEmitter
  private fountain?: Phaser.GameObjects.Particles.ParticleEmitter
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private flakes?: Phaser.GameObjects.Particles.ParticleEmitter
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter
  private fallout?: Phaser.GameObjects.Particles.ParticleEmitter
  private steam?: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter
  private bombGfx?: Phaser.GameObjects.Graphics
  private splatGfx?: Phaser.GameObjects.Graphics
  private light?: Phaser.GameObjects.Rectangle
  private vignette?: Phaser.Filters.Vignette
  private bombs: Bomb[] = []
  private spare: Bomb[] = []
  private splats: Splat[] = []
  /** 各样东西攒着没冒出来的零头 */
  private readonly acc = { breath: 0, plume: 0, column: 0, fountain: 0, air: 0, steam: 0, ember: 0, bomb: 0 }
  private phase: EruptionPhase = 'dormant'
  /** 这次预兆的第二声闷雷响过没有 */
  private rumbled = false
  private shakeAt = 0
  private shake = true

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, VOLCANO_BG).setDepth(-2)))
    if (!v.scene.textures.exists(PUFF_KEY)) canvasTexture(v.scene, PUFF_KEY, 64, 64, (ctx) => drawPuff(ctx, 64))
    if (!v.scene.textures.exists(SPARK_KEY)) canvasTexture(v.scene, SPARK_KEY, 16, 16, (ctx) => drawSpark(ctx, 16))
    if (!v.scene.textures.exists(BOMB_KEY)) canvasTexture(v.scene, BOMB_KEY, 32, 32, (ctx) => drawBomb(ctx, 32))
    this.light = v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, 0xff4a1a, 0).setDepth(85).setVisible(false))
    this.visuals.push(this.light)
    this.shake = loadSettings(browserStorage()).hitShake
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.volcano
    if (!s) return
    const f = s.field
    const cfg = v.def.volcano!
    const scene = v.scene
    const vents = s.vents
    const ppc = groundPpc(cfg)
    const field = { basin: f.basin, cols: f.cols, rows: f.rows, cell: f.cell, x0: f.x0, y0: f.y0, ground: f.ground, rockAt: f.rockAt, craterX: f.craterX, craterY: f.craterY, seed: f.seed }
    const caves = gatesNow(sim)
      .filter((g) => g.def.at.kind === 'nooks')
      .map((g) => ({ x: g.ax, y: g.ay, nx: g.nx, ny: g.ny, r: g.r }))
    const marks: GroundMarks = { vents, caves }
    const painter = new GroundPainter(field, cfg, marks, ppc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tex = canvasTexture(scene, GROUND_KEY, f.cols * ppc, f.rows * ppc)
    const rows = Array.from({ length: f.rows }, (_, r): CellRect => ({ c0: 0, r0: r, c1: f.cols, r1: r + 1 }))
    await painter.paint(rows, f.ground.slice(), f.rockAt.slice(), (p) => {
      const { img, x, y } = pieceImage(p, ppc)
      tex.getContext().putImageData(img, x, y)
    })
    if (this.painter !== painter) return
    tex.refresh()
    painter.trim(1)
    this.visuals.push(scene.add.image(f.x0, f.y0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(f.cols * f.cell, f.rows * f.cell).setDepth(-1))
    const dirty = new Uint8Array(Math.ceil(f.cols / GROUND_TILE) * Math.ceil(f.rows / GROUND_TILE))
    this.ground = { tex, ppc, seen: f.rockAt.slice(), dirty, busy: false }
    const lava = canvasTexture(scene, LAVA_KEY, f.cols, f.rows)
    const aux = canvasTexture(scene, AUX_KEY, f.cols, f.rows)
    this.data = {
      field: f,
      lava,
      aux,
      lavaImg: lava.getContext().createImageData(f.cols, f.rows),
      auxImg: aux.getContext().createImageData(f.cols, f.rows),
      glow: new Float32Array(f.cols * f.rows),
      soft: new Float32Array(f.cols * f.rows),
      shown: lavaShown(f, sim.elapsedMs),
    }
    this.encode(v, s, sim.elapsedMs)
    const snowTex = canvasTexture(scene, SNOW_KEY, f.cols, f.rows)
    const shine = canvasTexture(scene, SHINE_KEY, f.cols * SHINE_PPC, f.rows * SHINE_PPC)
    const snow = {
      state: makeSnow(f, cfg, marks, sim.elapsedMs),
      tex: snowTex,
      img: snowTex.getContext().createImageData(f.cols, f.rows),
      shine,
      shineImg: shine.getContext().createImageData(f.cols * SHINE_PPC, f.rows * SHINE_PPC),
    }
    shineSnow(f, cfg, snow.shineImg.data, { c0: 0, r0: 0, c1: f.cols, r1: f.rows })
    shine.getContext().putImageData(snow.shineImg, 0, 0)
    shine.refresh()
    encodeSnow(snow.state, f.cols, f.rows, snow.img.data)
    snowTex.getContext().putImageData(snow.img, 0, 0)
    snowTex.refresh()
    this.snow = snow
    this.simAt = sim.elapsedMs
    const u = this.u
    const crater = [(f.craterX - f.x0) / f.cell, (f.craterY - f.y0) / f.cell, (cfg.cone.craterU * UNIT) / f.cell]
    const wind = Math.hypot(WIND.x, WIND.y)
    const snowShader = scene.add
      .shader(
        {
          name: 'VolcanoSnow',
          fragmentSource: SNOW_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uSnow', 0)
            set('uShine', 1)
            set('uAux', 2)
            set('uTime', u.time)
            set('uGrid', [f.cols, f.rows])
            set('uWind', [WIND.x / wind, WIND.y / wind])
            set('uCrater', crater)
            set('uCraterGlow', u.craterGlow)
          },
        },
        f.x0,
        f.y0,
        f.cols * f.cell,
        f.rows * f.cell,
        [SNOW_KEY, SHINE_KEY, AUX_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(1.4)
    const lavaShader = scene.add
      .shader(
        {
          name: 'VolcanoLava',
          fragmentSource: LAVA_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uLava', 0)
            set('uAux', 1)
            set('uTime', u.time)
            set('uGrid', [f.cols, f.rows])
            set('uCrater', crater)
            set('uPool', u.pool)
          },
        },
        f.x0,
        f.y0,
        f.cols * f.cell,
        f.rows * f.cell,
        [LAVA_KEY, AUX_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(1.5)
    this.visuals.push(snowShader, lavaShader)
    keepDecor(v.decor, (s) => roomAt(f.basin, s.x, s.y) >= 0.5 * UNIT)
    const puff = (depth: number, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Phaser.GameObjects.Particles.ParticleEmitter =>
      scene.add.particles(0, 0, PUFF_KEY, { rotate: { min: 0, max: 360 }, emitting: false, ...config }).setDepth(depth)
    const dots = (depth: number, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Phaser.GameObjects.Particles.ParticleEmitter =>
      scene.add.particles(0, 0, SPARK_KEY, { emitting: false, ...config }).setDepth(depth)
    this.breath = puff(35, {
      lifespan: { min: 3200, max: 5200 },
      speedX: { min: WIND.x * 0.35, max: WIND.x * 0.9 },
      speedY: { min: WIND.y * 1.2 - 18, max: WIND.y * 0.6 - 8 },
      scale: { start: 0.35, end: 2 },
      alpha: { start: 0.22, end: 0 },
      tint: [0xf3f5f7, 0xe5e9ec, 0xdde1e4],
    })
    this.plume = puff(35.5, {
      lifespan: { min: 2800, max: 4600 },
      speedX: { min: WIND.x * 0.5, max: WIND.x * 1.3 },
      speedY: { min: WIND.y * 1.4 - 16, max: WIND.y * 0.6 - 6 },
      scale: { start: 0.6, end: 2.8 },
      alpha: { start: 0.34, end: 0 },
      tint: [0x8c9094, 0xa0a4a8, 0x777b80],
    })
    this.column = puff(36, {
      lifespan: { min: 2000, max: 3400 },
      speedX: { min: WIND.x * 0.8, max: WIND.x * 2 },
      speedY: { min: -85, max: -35 },
      scale: { start: 0.9, end: 3.6 },
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.min(1, t * 5) * (1 - t) * 0.6 },
      tint: [0x4c5054, 0x5f6367, 0x3e4145, 0x7a4630],
    })
    const g = VOLCANO_GRAVITY * LIFT_PER_M
    this.fountain = dots(36.5, {
      lifespan: 1000,
      gravityY: g,
      scale: { start: 1.4, end: 0.6 },
      color: [0xfff1b8, 0xffbe45, 0xff7a1f, 0xd8360c, 0x6a1d0c],
      blendMode: Phaser.BlendModes.ADD,
      emitCallback: (p: Phaser.GameObjects.Particles.Particle) => {
        const vz = (6 + Math.random() * 9) * (0.55 + 0.45 * this.u.vigor)
        const a = Math.random() * Math.PI * 2
        const h = Math.random() * Math.random() * 0.9 * UNIT
        p.velocityX = Math.cos(a) * h
        p.velocityY = Math.sin(a) * h * 0.8 - vz * LIFT_PER_M
        p.life = p.lifeCurrent = ((2 * vz) / VOLCANO_GRAVITY) * 1000
      },
    })
    this.embers = dots(37, {
      lifespan: { min: 700, max: 1700 },
      speedX: { min: -14, max: 18 },
      speedY: { min: -70, max: -25 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffe082, 0xffa726, 0xff5722],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.flakes = dots(38, {
      lifespan: { min: 3000, max: 5000 },
      speedX: { min: WIND.x * 0.5, max: WIND.x * 1.1 },
      speedY: { min: 14, max: 32 },
      accelerationX: { onEmit: () => 0, onUpdate: (p, _k, t) => Math.sin(t * 9 + p.x * 0.02) * 26 },
      scale: { min: 0.3, max: 0.65 },
      alpha: fadeInOut(0.9),
      tint: [0xffffff, 0xf5f8fc, 0xe8eff7],
    })
    this.dust = dots(38, {
      lifespan: { min: 1400, max: 2600 },
      speedX: { min: WIND.x * 1.8, max: WIND.x * 3.2 },
      speedY: { min: WIND.y * 0.6, max: WIND.y * 0.1 },
      scale: { min: 0.14, max: 0.3 },
      alpha: fadeInOut(0.4),
      tint: [0x9a9ea2, 0x85898d, 0xb0b4b8],
    })
    this.fallout = dots(38, {
      lifespan: { min: 3200, max: 5200 },
      speedX: { min: WIND.x * 0.7, max: WIND.x * 1.5 },
      speedY: { min: 10, max: 26 },
      scale: { min: 0.2, max: 0.45 },
      alpha: fadeInOut(0.7),
      tint: [0x46494c, 0x55595c, 0x393c3f],
    })
    this.steam = puff(34, {
      lifespan: { min: 1400, max: 2600 },
      speedX: { min: WIND.x * 0.2, max: WIND.x * 0.7 },
      speedY: { min: -34, max: -12 },
      scale: { start: 0.3, end: 1.6 },
      alpha: { start: 0.42, end: 0 },
      tint: [0xf4f6f8, 0xe4e8ec],
    })
    this.sparks = dots(37, {
      lifespan: { min: 300, max: 800 },
      speed: { min: 60, max: 220 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffe082, 0xff9800, 0xff3d00],
      blendMode: Phaser.BlendModes.ADD,
    })
    for (const p of vents) {
      this.visuals.push(
        scene.add
          .particles(p.x, p.y, PUFF_KEY, {
            lifespan: { min: 1600, max: 2600 },
            frequency: 260,
            speedX: { min: WIND.x * 0.3, max: WIND.x * 0.8 },
            speedY: { min: -26, max: -12 },
            scale: { start: 0.2, end: 0.9 },
            alpha: { start: 0.32, end: 0 },
            tint: [0xf2eee6, 0xe0dccf],
          })
          .setDepth(34),
      )
    }
    this.trail = puff(33, {
      lifespan: { min: 500, max: 900 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -14, max: -4 },
      scale: { start: 0.18, end: 0.6 },
      alpha: { start: 0.4, end: 0 },
      tint: [0x383c40, 0x4d5155],
    })
    this.bombGfx = scene.add.graphics().setDepth(1.7)
    this.splatGfx = scene.add.graphics().setDepth(1.6).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.breath, this.plume, this.column, this.fountain, this.embers, this.flakes, this.dust, this.fallout, this.steam, this.sparks, this.trail, this.bombGfx, this.splatGfx)
    this.vignette = v.lens.screen.vignette(0.7, 0.22, 0x000000)
  }

  /** 把熔岩场编码进两张数据图 */
  private encode(v: ViewCtx, s: VolcanoState, now: number): void {
    const d = this.data
    if (!d) return
    encodeLava(s.field, v.def.volcano!, now, d.shown, d.lavaImg.data, d.auxImg.data, d.glow, d.soft)
    d.lava.getContext().putImageData(d.lavaImg, 0, 0)
    d.lava.refresh()
    d.aux.getContext().putImageData(d.auxImg, 0, 0)
    d.aux.refresh()
  }

  /** 积雪按模拟走过的时间涨落，编码进数据图 */
  private driftSnow(cfg: VolcanoConfig, s: VolcanoState, c: Crater, now: number, dtMs: number): void {
    const sn = this.snow
    const d = this.data
    if (!sn || !d) return
    stepSnow(sn.state, s.field, cfg, d.shown.on, d.glow, c.melt, c.ash, now, dtMs)
    encodeSnow(sn.state, s.field.cols, s.field.rows, sn.img.data)
    sn.tex.getContext().putImageData(sn.img, 0, 0)
    sn.tex.refresh()
  }

  /** 新凝固的岩石改变了地表：把受影响的块记下，上一批补画完了就把记下的块整批交出去重画，画好一块重传一块；雪面的光照跟着重算这几块 */
  private repaintRock(v: ViewCtx, s: VolcanoState, now: number): void {
    const g = this.ground
    const painter = this.painter
    if (!g || !painter) return
    const f = s.field
    const cfg = v.def.volcano!
    for (let i = 0; i < f.rockAt.length; i++) {
      if (f.rockAt[i] === g.seen[i]) continue
      g.seen[i] = f.rockAt[i]!
      markGround(f, cfg, i, g.dirty)
    }
    if (g.busy || now < this.repaintAt) return
    const tiles = Math.ceil(f.cols / GROUND_TILE)
    const rects: CellRect[] = []
    for (let k = 0; k < g.dirty.length; k++) {
      if (!g.dirty[k]) continue
      g.dirty[k] = 0
      const c0 = (k % tiles) * GROUND_TILE
      const r0 = Math.floor(k / tiles) * GROUND_TILE
      rects.push({ c0, r0, c1: Math.min(f.cols, c0 + GROUND_TILE), r1: Math.min(f.rows, r0 + GROUND_TILE) })
    }
    if (rects.length === 0) return
    this.repaintAt = now + REPAINT_MS
    g.busy = true
    void painter
      .paint(rects, f.ground.slice(), f.rockAt.slice(), (p) => {
        const { img, x, y } = pieceImage(p, g.ppc)
        if (this.ground === g) patchTexture(v.scene, g.tex, img, x, y)
      })
      .then(() => {
        g.busy = false
      })
    const sn = this.snow
    if (!sn) return
    for (const r of rects) shineSnow(f, cfg, sn.shineImg.data, r)
    sn.shine.getContext().putImageData(sn.shineImg, 0, 0)
    sn.shine.refresh()
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.volcano
    if (!s || !this.data || !this.snow) return
    const cfg = v.def.volcano!
    const f = s.field
    const now = sim.elapsedMs
    const c = craterNow(cfg, s, now)
    this.encode(v, s, now)
    this.driftSnow(cfg, s, c, now, Math.max(0, now - this.simAt))
    this.simAt = now
    this.repaintRock(v, s, now)
    this.u.time = now / 1000
    this.u.vigor = c.vigor
    for (let k = 0; k < 4; k++) this.u.pool[k] = c.pool[k]!
    this.u.craterGlow = Math.max(c.pool[3] * 0.5, c.pool[0] * c.pool[1])
    if (s.phase !== this.phase) this.enterPhase(v, s)
    this.phase = s.phase
    if (s.phase === 'warn') {
      if (this.shake && c.warn > 0.2 && now >= this.shakeAt) {
        this.shakeAt = now + 260 + Math.random() * 500 * (1 - c.warn)
        v.lens.screen.shake(300, 0.0004 + 0.0026 * c.warn * c.warn)
      }
      if (!this.rumbled && c.warn > 0.55) {
        this.rumbled = true
        playSfx('rumble')
      }
    }
    if (this.light) {
      const a = s.phase === 'warn' ? c.warn * c.warn * (0.012 + 0.008 * Math.sin(now / 90)) : s.phase === 'erupt' ? 0.012 + 0.035 * c.vigor * (0.8 + 0.2 * Math.sin(now / 70)) : 0
      setOverlayFill(this.light, 0xff4a1a, a)
    }
    if (this.vignette) this.vignette.strength = 0.22 + 0.1 * Math.max(c.warn, c.vigor)
    const view = v.lens.screen.view()
    this.emitCrater(f, cfg, c, now, delta)
    this.emitAir(f, this.snow.state, view, c, delta)
    this.emitSteam(f, this.snow.state, view, delta)
    this.emitEmbers(f, view, delta)
    this.stepBombs(v, s, delta, now)
  }

  /** 熔岩把单位朝着它的一侧映亮：按脚下一带的辉光，朝辉光变强的方向打 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const d = this.data
    if (!d) return
    const f = d.field
    const k = LAVA_ON_BODY.max * (1 - Math.exp((-glowAt(f, d.glow, x, y) * (1 + this.u.vigor)) / LAVA_ON_BODY.span))
    if (k <= 0) return
    const gx = glowAt(f, d.glow, x + f.cell, y) - glowAt(f, d.glow, x - f.cell, y)
    const gy = glowAt(f, d.glow, x, y + f.cell) - glowAt(f, d.glow, x, y - f.cell)
    const g = Math.hypot(gx, gy)
    if (g > 0) {
      out.fx = gx / g
      out.fy = gy / g
    }
    out.color = LAVA_ON_BODY.color
    out.fill = k
  }

  /** 换阶段的那一下：预兆起闷雷；喷发时一声爆响、闪一下、震一下，火星炸开，火山弹先攒几块 */
  private enterPhase(v: ViewCtx, s: VolcanoState): void {
    if (s.phase === 'warn') {
      this.rumbled = false
      playSfx('rumble')
    }
    if (s.phase !== 'erupt') return
    playSfx('erupt')
    v.lens.screen.flash(220, 255, 170, 90)
    if (this.shake) v.lens.screen.shake(750, 0.007)
    this.sparks?.explode(40, s.field.craterX, s.field.craterY)
    this.acc.bomb = 6
  }

  /** 火山口冒的东西：白汽、灰烟、喷发的灰柱，和一股股往上喷、落回口沿四周的熔岩喷泉 */
  private emitCrater(f: LavaField, cfg: VolcanoConfig, c: Crater, now: number, delta: number): void {
    const dt = delta / 1000
    const r = cfg.cone.craterU * UNIT
    const acc = this.acc
    acc.breath = puffAt(this.breath, acc.breath + dt * c.breath, f.craterX, f.craterY, r * 0.6)
    acc.plume = puffAt(this.plume, acc.plume + dt * c.plume, f.craterX, f.craterY, r * 0.7)
    acc.column = puffAt(this.column, acc.column + dt * c.column, f.craterX, f.craterY - r * 0.8, r * 0.5)
    const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(now / 170 + Math.sin(now / 610) * 2.2))
    acc.fountain = puffAt(this.fountain, acc.fountain + dt * FOUNTAIN_RATE * c.vigor * pulse, f.craterX, f.craterY, r * 0.35)
  }

  /** 按镜头撒点：落在雪区里按雪下得多大飘雪；喷发前后落在下风那片按落灰的多少飘灰；雪区外偶尔被风扬起一点灰 */
  private emitAir(f: LavaField, sn: Snow, view: Rect, c: Crater, delta: number): void {
    this.acc.air += (delta / 1000) * ((view.w * view.h * 1.44) / (UNIT * UNIT)) * AIR_RATE
    for (; this.acc.air >= 1; this.acc.air--) {
      const x = view.x + (Math.random() * 1.2 - 0.1) * view.w
      const y = view.y + (Math.random() * 1.2 - 0.1) * view.h
      const i = cellAt(f, x, y)
      if (i < 0) continue
      const fall = sn.fall[i]!
      if (Math.random() < fall) this.flakes?.emitParticleAt(x, y, 1)
      else if (Math.random() < sn.fan[i]! * c.fallout) this.fallout?.emitParticleAt(x, y, 1)
      else if (Math.random() < (1 - fall) * DUST_SHARE) this.dust?.emitParticleAt(x, y, 1)
    }
  }

  /** 熔岩四周化雪、雪落在没凉透的岩石上，冒起白汽：按镜头撒点，冒汽越强越容易冒 */
  private emitSteam(f: LavaField, sn: Snow, view: Rect, delta: number): void {
    this.acc.steam += (delta / 1000) * ((view.w * view.h) / (UNIT * UNIT)) * STEAM_RATE
    for (; this.acc.steam >= 1; this.acc.steam--) {
      const x = view.x + Math.random() * view.w
      const y = view.y + Math.random() * view.h
      const i = cellAt(f, x, y)
      if (i >= 0 && Math.random() < sn.steam[i]! * 0.8) this.steam?.emitParticleAt(x, y, 1)
    }
  }

  /** 镜头里随机挑几处热熔岩冒火星：每秒按镜头面积撒点，落在越热的熔岩上越容易冒 */
  private emitEmbers(f: LavaField, view: Rect, delta: number): void {
    const em = this.embers
    if (!em) return
    this.acc.ember += (delta / 1000) * ((view.w * view.h) / (UNIT * UNIT)) * 0.35
    for (; this.acc.ember >= 1; this.acc.ember--) {
      const x = view.x + Math.random() * view.w
      const y = view.y + Math.random() * view.h
      const i = cellAt(f, x, y)
      if (i >= 0 && f.lava[i]! > 0.01 && Math.random() < f.heat[i]! ** 3 * 0.6) em.emitParticleAt(x, y, 1)
    }
  }

  private bomb(scene: Phaser.Scene): Bomb {
    const b = this.spare.pop()
    if (b) {
      b.rock.setVisible(true)
      b.glow.setVisible(true)
      return b
    }
    const glow = scene.add.image(0, 0, SPARK_KEY).setDepth(34).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a1a)
    const rock = scene.add.image(0, 0, BOMB_KEY).setDepth(34.1)
    this.visuals.push(glow, rock)
    return { x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, r: 0, spin: 0, rock, glow }
  }

  /** 火山弹：喷发时从火山口抛出，按重力画弧，影子背着太阳落在地上；落地溅起火星，砸出一小片渐暗的红光，砸在雪上还砸出一个冒汽的坑 */
  private stepBombs(v: ViewCtx, s: VolcanoState, delta: number, now: number): void {
    const g = this.bombGfx
    const sg = this.splatGfx
    if (!g || !sg) return
    const f = s.field
    const dt = delta / 1000
    const reach = v.def.light?.shadow?.length ?? 0
    if (s.phase === 'erupt') {
      this.acc.bomb += dt * 13 * this.u.vigor
      while (this.acc.bomb >= 1) {
        this.acc.bomb -= 1
        const b = this.bomb(v.scene)
        const a = Math.atan2(f.inY, f.inX) + (Math.random() * 2 - 1) * 2.2
        const sp = (1.2 + Math.random() * 3.6) * UNIT
        b.x = f.craterX + (Math.random() - 0.5) * UNIT
        b.y = f.craterY + (Math.random() - 0.5) * UNIT
        b.vx = Math.cos(a) * sp
        b.vy = Math.sin(a) * sp
        b.z = 0.4
        b.vz = 6 + Math.random() * 4
        b.r = 7 + Math.random() * 9
        b.spin = (Math.random() * 2 - 1) * 8
        b.rock.setRotation(Math.random() * Math.PI * 2)
        this.bombs.push(b)
      }
    }
    g.clear()
    const kept: Bomb[] = []
    for (const b of this.bombs) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vz -= VOLCANO_GRAVITY * dt
      b.z += b.vz * dt
      if (b.z <= 0) {
        const i = cellAt(f, b.x, b.y)
        const snow = this.snow
        if (snow && i >= 0 && snow.state.cover[i]! > 0.2) {
          punchSnow(snow.state, f, b.x, b.y, b.r * 2.5)
          this.steam?.explode(4, b.x, b.y)
        }
        this.sparks?.explode(10, b.x, b.y)
        this.trail?.explode(3, b.x, b.y)
        this.splats.push({ x: b.x, y: b.y, r: b.r * 1.6, at: now })
        b.rock.setVisible(false)
        b.glow.setVisible(false)
        this.spare.push(b)
        continue
      }
      kept.push(b)
      const high = Math.min(1, b.z / 4)
      const lift = b.z * LIFT_PER_M
      const scale = (b.r * 2 * (1 + high * 0.5)) / 32
      g.fillStyle(0x000000, 0.3 * (1 - high * 0.55))
      g.fillEllipse(b.x + AWAY.x * reach * lift, b.y + AWAY.y * reach * lift, b.r * 2.4 * (1 - high * 0.3), b.r * 1.2 * (1 - high * 0.3))
      b.rock.setPosition(b.x, b.y - lift).setScale(scale).setRotation(b.rock.rotation + b.spin * dt)
      b.glow.setPosition(b.x, b.y - lift).setScale(scale * 2.6).setAlpha(0.55)
      if (Math.random() < dt * 30) this.trail?.emitParticleAt(b.x, b.y - lift, 1)
    }
    this.bombs = kept
    sg.clear()
    this.splats = this.splats.filter((p) => now - p.at < SPLAT_MS)
    for (const p of this.splats) {
      const k = 1 - (now - p.at) / SPLAT_MS
      for (let i = 0; i < 5; i++) {
        const a = p.r * 7.3 + i * 2.4
        const d = p.r * (0.2 + ((i * 0.37 + p.r) % 1) * 0.8)
        sg.fillStyle(i === 0 ? 0xffb040 : 0xff5a14, 0.55 * k * k)
        sg.fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, (i === 0 ? 0.32 : 0.16) * p.r * (0.6 + 0.4 * k))
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.vignette = undefined
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    this.ground = undefined
    this.data = undefined
    this.snow = undefined
    this.bombs = []
    this.spare = []
    this.splats = []
    for (const key of [GROUND_KEY, LAVA_KEY, AUX_KEY, SNOW_KEY, SHINE_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
