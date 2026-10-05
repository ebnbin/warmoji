import Phaser from 'phaser'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { keepDecor } from '../../ecs/decor'
import type { Point } from '../../util/vec'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import { drawBomb, encodeLava, GROUND_TILE, groundPpc, LAVA_FRAG, lavaShown, markGround } from './render'
import { canvasTexture, drawPuff, drawSpark } from '../textures'
import type { CellRect, GroundPiece, LavaShown } from './render'
import { GroundPainter } from './painter'
import { effusion } from './model'
import { roomAt } from '../basin'
import { gatesNow } from '../../ecs/worlds/gates'
import { AWAY } from '../../data/light'
import type { EruptionPhase, VolcanoState } from './model'
import { bilinear } from '../grid'
import { playSfx } from '../../audio/sfx'
import { loadSettings } from '../../save/settings'
import { browserStorage } from '../../util/storage'
import type { Framing, Rect } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView, setOverlayFill } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'

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
/** 风把烟和灰往哪吹，像素/秒 */
const WIND = { x: 22, y: -9 }
/** 火山弹往下落的重力加速度，米/秒² */
const VOLCANO_GRAVITY = 9.81
/** 熔岩映在身体上的补光：光色，最浓叠到多少；辉光场的值（喷发时按两倍算）到 span 时叠到最浓的六成多 */
const LAVA_ON_BODY = { color: 0xffa45c, max: 0.55, span: 0.2 } as const

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
 * 火山：盆地的边不画线，靠崖壁、高地与岩壁脚下的碎石看出来；地表按高度场打光，熔岩由着色器按每格的厚度、温度画出结壳与流动；
 * 火山口冒着烟，熔岩上飘火星，天上落灰，喷气孔冒蒸汽。预兆时浓烟翻滚、地面抖动、天色发红，
 * 喷发时熔岩湖涨过口沿，火山弹随流量从火山口飞出，画面一闪一震。
 */
export class VolcanoView extends BoundedView {
  private painter?: GroundPainter
  private ground?: { tex: Phaser.Textures.CanvasTexture; ppc: number; seen: Float32Array; dirty: Uint8Array; busy: boolean }
  private data?: { field: VolcanoState['field']; lava: Phaser.Textures.CanvasTexture; aux: Phaser.Textures.CanvasTexture; lavaImg: ImageData; auxImg: ImageData; glow: Float32Array; soft: Float32Array; shown: LavaShown }
  private repaintAt = 0
  private readonly u = { time: 0, erupt: 0, warn: 0 }
  private plume?: Phaser.GameObjects.Particles.ParticleEmitter
  private column?: Phaser.GameObjects.Particles.ParticleEmitter
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private ash?: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter
  private bombGfx?: Phaser.GameObjects.Graphics
  private splatGfx?: Phaser.GameObjects.Graphics
  private light?: Phaser.GameObjects.Rectangle
  private vignette?: Phaser.Filters.Vignette
  private bombs: Bomb[] = []
  private spare: Bomb[] = []
  private splats: Splat[] = []
  private bombAcc = 0
  private emberAcc = 0
  private phase: EruptionPhase = 'dormant'
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
    const painter = new GroundPainter(field, cfg, { vents, caves }, ppc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    const u = this.u
    const crater = [(f.craterX - f.x0) / f.cell, (f.craterY - f.y0) / f.cell, (cfg.cone.craterU * UNIT) / f.cell]
    const shader = scene.add
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
            set('uWarn', u.warn)
            set('uErupt', u.erupt)
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
    this.visuals.push(shader)
    keepDecor(v.decor, (s) => roomAt(f.basin, s.x, s.y) >= 0.5 * UNIT)
    this.plume = scene.add
      .particles(f.craterX, f.craterY, PUFF_KEY, {
        lifespan: { min: 3000, max: 4800 },
        frequency: 120,
        speedX: { min: WIND.x * 0.5, max: WIND.x * 1.3 },
        speedY: { min: WIND.y * 1.4 - 14, max: WIND.y * 0.6 - 5 },
        scale: { start: 0.7, end: 2.8 },
        alpha: { start: 0.3, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x959a9e, 0xa9adb2, 0x83878c],
      })
      .setDepth(35)
    this.column = scene.add
      .particles(f.craterX, f.craterY, PUFF_KEY, {
        lifespan: { min: 1800, max: 3000 },
        frequency: 55,
        speedX: { min: WIND.x * 0.8, max: WIND.x * 2 },
        speedY: { min: -70, max: -30 },
        scale: { start: 0.8, end: 3.2 },
        alpha: { start: 0.42, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x5a5e62, 0x6e7276, 0x9a4a2c],
        emitting: false,
      })
      .setDepth(36)
    this.embers = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 700, max: 1700 },
        speedX: { min: -14, max: 18 },
        speedY: { min: -70, max: -25 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffe082, 0xffa726, 0xff5722],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(37)
    const screen = v.lens.screen
    this.ash = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: 7000,
        frequency: 70,
        speedX: { min: WIND.x * 0.8, max: WIND.x * 1.6 },
        speedY: { min: 8, max: 22 },
        scale: { min: 0.18, max: 0.42 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xaaafb3, 0x84898d, 0xccd1d6],
        emitZone: {
          type: 'random',
          source: {
            getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
              const view = screen.view()
              p.x = (Math.random() - 0.5) * view.w * 1.4
              p.y = (Math.random() - 0.5) * view.h * 1.4
            },
          },
        },
      })
      .setDepth(38)
    this.sparks = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 300, max: 800 },
        speed: { min: 60, max: 220 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe082, 0xff9800, 0xff3d00],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(37)
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
    this.trail = scene.add
      .particles(0, 0, PUFF_KEY, {
        lifespan: { min: 500, max: 900 },
        speedX: { min: -8, max: 8 },
        speedY: { min: -14, max: -4 },
        scale: { start: 0.18, end: 0.6 },
        alpha: { start: 0.4, end: 0 },
        tint: [0x383c40, 0x4d5155],
        emitting: false,
      })
      .setDepth(33)
    this.bombGfx = scene.add.graphics().setDepth(1.7)
    this.splatGfx = scene.add.graphics().setDepth(1.6).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.plume, this.column, this.embers, this.ash, this.sparks, this.trail, this.bombGfx, this.splatGfx)
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

  /** 新凝固的岩石改变了地表：把受影响的块记下，上一批补画完了就把记下的块整批交出去重画，画好一块重传一块 */
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
  }


  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.volcano
    if (!s || !this.data) return
    const cfg = v.def.volcano!
    const f = s.field
    const now = sim.elapsedMs
    this.encode(v, s, now)
    this.repaintRock(v, s, now)
    const e = cfg.eruption
    const warn = s.phase === 'warn' ? Math.min(1, (now - s.since) / e.warnMs) : 0
    const erupt = s.phase === 'erupt' ? effusion(e, now - s.since) / e.rate : 0
    this.u.time = now / 1000
    this.u.warn = warn
    this.u.erupt = erupt
    if (s.phase !== this.phase) this.enterPhase(v, s)
    this.phase = s.phase
    const view = v.lens.screen.view()
    if (s.phase === 'warn' && this.shake && now >= this.shakeAt) {
      this.shakeAt = now + 280
      v.lens.screen.shake(300, 0.0005 + 0.0022 * warn)
    }
    if (this.light) {
      const a = s.phase === 'warn' ? warn * (0.03 + 0.02 * Math.sin(now / 90)) : s.phase === 'erupt' ? 0.02 + 0.06 * erupt * (0.8 + 0.2 * Math.sin(now / 70)) : 0
      setOverlayFill(this.light, 0xff4a1a, a)
    }
    if (this.vignette) this.vignette.strength = 0.22 + 0.1 * Math.max(warn, erupt)
    this.emitEmbers(f, view, delta)
    this.ash?.setPosition(view.x + view.w / 2, view.y + view.h / 2)
    this.stepBombs(v, s, delta, now)
  }

  /** 熔岩把单位朝着它的一侧映亮：按脚下一带的辉光，朝辉光变强的方向打 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const d = this.data
    if (!d) return
    const f = d.field
    const k = LAVA_ON_BODY.max * (1 - Math.exp((-glowAt(f, d.glow, x, y) * (1 + this.u.erupt)) / LAVA_ON_BODY.span))
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

  /** 换阶段时改烟和灰的密度：发射频率一改就从头计时，所以只在这时改 */
  private enterPhase(v: ViewCtx, s: VolcanoState): void {
    this.plume?.setFrequency(s.phase === 'dormant' ? 110 : s.phase === 'warn' ? 45 : 30)
    this.ash?.setFrequency(s.phase === 'erupt' ? 18 : 70)
    if (s.phase === 'warn') playSfx('rumble')
    if (s.phase === 'erupt') {
      playSfx('erupt')
      v.lens.screen.flash(260, 255, 150, 70)
      if (this.shake) v.lens.screen.shake(750, 0.007)
      this.column?.start()
      this.sparks?.explode(40, s.field.craterX, s.field.craterY)
      this.bombAcc = 6
    }
    if (s.phase === 'dormant') this.column?.stop()
  }

  /** 镜头里随机挑几处热熔岩冒火星：每秒按镜头面积撒点，落在越热的熔岩上越容易冒 */
  private emitEmbers(f: VolcanoState['field'], view: Rect, delta: number): void {
    const em = this.embers
    if (!em) return
    this.emberAcc += (delta / 1000) * ((view.w * view.h) / (UNIT * UNIT)) * 0.35
    for (; this.emberAcc >= 1; this.emberAcc--) {
      const x = view.x + Math.random() * view.w
      const y = view.y + Math.random() * view.h
      const cx = Math.floor((x - f.x0) / f.cell)
      const cy = Math.floor((y - f.y0) / f.cell)
      if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) continue
      const i = cy * f.cols + cx
      if (f.lava[i]! > 0.01 && Math.random() < f.heat[i]! ** 3 * 0.6) em.emitParticleAt(x, y, 1)
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

  /** 火山弹：喷发时从火山口抛出，按重力画弧，影子背着太阳落在地上；落地溅起火星，砸出一小片渐暗的红光 */
  private stepBombs(v: ViewCtx, s: VolcanoState, delta: number, now: number): void {
    const g = this.bombGfx
    const sg = this.splatGfx
    if (!g || !sg) return
    const f = s.field
    const dt = delta / 1000
    const reach = v.def.light?.shadow?.length ?? 0
    if (s.phase === 'erupt') {
      this.bombAcc += dt * 13 * this.u.erupt
      while (this.bombAcc >= 1) {
        this.bombAcc -= 1
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
    this.bombs = []
    this.spare = []
    this.splats = []
    for (const key of [GROUND_KEY, LAVA_KEY, AUX_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
