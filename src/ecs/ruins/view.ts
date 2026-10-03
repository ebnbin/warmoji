import Phaser from 'phaser'
import { removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { MAP, rollDecor } from '../../data/maps'
import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { safeInsets, viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { playSfx } from '../../audio/sfx'
import { loadSettings } from '../../save/settings'
import { browserStorage } from '../../util/storage'
import { spawnDecor } from '../entities/decor'
import { Alive, Transform } from '../components'
import { eyeM } from '../utils/pass'
import { roomAt } from '../worlds/basin'
import { CANOPY_PPU, PAINT_PAD_U, textureSize } from './ground'
import { toLocal, toWorld } from './layout'
import { cellAt, GRAVITY } from './masonry'
import { RuinsPainter } from './painter'
import { drawChip, drawDust, drawPigeon, drawSplinter, SIGHT_BINS, SIGHT_FRAG, SIGHT_RANGE_U, sightRing } from './shader'
import { ruinsOf, ruinsPlanFor } from './world'
import type { PaintPiece, PaintScene, PaintState } from './ground'
import type { RuinsPlan } from './layout'
import type { PaintTask } from './painter'
import type { Collapse, RuinsState } from './world'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'

const BG = 0x15120d
const GROUND_KEY = 'ruins-ground'
const CANOPY_KEY = 'ruins-canopy'
const SIGHT_KEY = 'ruins-sight'
const DUST_KEY = 'ruins-dust'
const CHIP_KEY = 'ruins-chip'
const SPLINTER_KEY = 'ruins-splinter'
const PIGEON_KEY = 'ruins-pigeon'
const PIGEON_PX = 48
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 开局地面按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 墙塌了按这么大（像素）的块补画 */
const TILE_PX = 64
/** 两批补画之间至少隔这么久，毫秒 */
const REPAINT_MS = 200
/** 压在看不见的地方上的颜色：暗一半，偏冷 */
const SIGHT_DIM = [0.64, 0.67, 0.76] as const
/** 风往哪吹，像素/秒：扬尘顺风飘 */
const WIND = { x: 10, y: -4 }
/** 抛起的东西高出地面一米，画面上抬起多少像素 */
const LIFT_PX_PER_M = UNIT * 0.5
/** 视线环所在的深度：盖在身体之上、树冠之上 */
const SIGHT_DEPTH = 25
/** 鸽子停在多高（米）以上的墙头 */
const PERCH_M = 2
const PIGEONS = 9
/** 有身体走到这么近（格），或这么近（格）处塌了墙，鸽子就飞走 */
const SCARE_U = 1.6
const SCARE_COLLAPSE_U = 9

/** 墙塌时飞出去的一块石头：从墙上落到地上，带着影子 */
interface Stone {
  readonly img: Phaser.GameObjects.Image
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly drop: number
  readonly ms: number
  t: number
  readonly spin: number
}

/** 一只鸽子：停在墙头，被惊动就飞起来兜几圈，再落到别的墙头 */
interface Pigeon {
  readonly img: Phaser.GameObjects.Image
  x: number
  y: number
  z: number
  vx: number
  vy: number
  /** 停着时为 null；飞着时要落的墙头与还要飞多久（秒） */
  to: Point | null
  left: number
  flap: number
  scared: number
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const tex = scene.textures.createCanvas(key, w, h)!
  if (draw) draw(tex.getContext())
  upload(tex)
  return tex
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，高分屏开了 pixelArt 就是最近点，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 贴图上换一块像素：画布跟着换（显卡丢了上下文时 Phaser 拿整张画布重建），显卡上只重传这一块 */
function patch(scene: Phaser.Scene, tex: Phaser.Textures.CanvasTexture, img: ImageData, x: number, y: number): void {
  tex.getContext().putImageData(img, x, y)
  const r = scene.renderer
  const gt = tex.source[0]!.glTexture
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !gt || r.gl.isContextLost()) return
  const gl = r.gl
  r.glTextureUnits.bind(gt, 0)
  r.glWrapper.updateTexturing({ texturing: { flipY: gt.flipY, premultiplyAlpha: gt.pma } })
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - img.height : y, gl.RGBA, gl.UNSIGNED_BYTE, img)
}

function snapshot(s: RuinsState): PaintState {
  return { n: s.m.n.slice(), timber: s.m.timber.slice(), rubble: s.m.rubble.slice() }
}

/**
 * 残垣：地面、墙顶与碎石是线程里按砌体画好的贴图，按太阳投下长长的影子；墙一塌，受影响的那几块按新的砌体补画。
 * 队长看不见的地方由着色器按视线环压暗。塌墙时石块从墙上落下、尘土翻滚、墙头的鸽子惊飞；子弹打在墙上崩出碎石，打在木板上溅起木屑。
 * 台地边外是林子，树冠盖在一切之上
 */
export class RuinsView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private decorEids: number[] = []
  private plan?: RuinsPlan
  private painter?: RuinsPainter
  private ground?: { tex: Phaser.Textures.CanvasTexture; seen: Uint8Array; seenT: Uint8Array; dirty: Uint8Array; cols: number; rows: number; busy: boolean }
  private sight?: { tex: Phaser.Textures.CanvasTexture; img: ImageData }
  private readonly u = { eye: [0, 0] }
  private repaintAt = 0
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter
  private chips?: Phaser.GameObjects.Particles.ParticleEmitter
  private splinters?: Phaser.GameObjects.Particles.ParticleEmitter
  private stoneGfx?: Phaser.GameObjects.Graphics
  private stones: Stone[] = []
  private pigeons: Pigeon[] = []
  private perches: Point[] = []
  private shake = true

  private planOf(v: ViewCtx): RuinsPlan {
    if (!this.plan) this.plan = ruinsPlanFor(v.def.ruins!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.w * UNIT, h: p.h * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, BG)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    const scene = v.scene
    if (!scene.textures.exists(DUST_KEY)) canvasTexture(scene, DUST_KEY, 64, 64, (ctx) => drawDust(ctx, 64))
    if (!scene.textures.exists(CHIP_KEY)) canvasTexture(scene, CHIP_KEY, 24, 24, (ctx) => drawChip(ctx, 24))
    if (!scene.textures.exists(SPLINTER_KEY)) canvasTexture(scene, SPLINTER_KEY, 32, 12, (ctx) => drawSplinter(ctx, 32, 12))
    if (!scene.textures.exists(PIGEON_KEY)) {
      const tex = canvasTexture(scene, PIGEON_KEY, PIGEON_PX * 3, PIGEON_PX, (ctx) => drawPigeon(ctx, PIGEON_PX, PIGEON_PX))
      for (let k = 0; k < 3; k++) tex.add(k, 0, k * PIGEON_PX, 0, PIGEON_PX, PIGEON_PX)
    }
    this.shake = loadSettings(browserStorage()).hitShake
  }

  /** 镜头最多看到地图外多远：默认边距，再加上这一边的设备安全区 */
  camera(v: ViewCtx): void {
    const cam = v.scene.cameras.main
    const m = MAP.cameraMargin * UNIT
    const s = safeInsets
    cam.setZoom(viewport.renderScale)
    cam.setBounds(-m - s.left, -m - s.top, v.w + m * 2 + s.left + s.right, v.h + m * 2 + s.top + s.bottom)
    cam.startFollow(v.anchor)
  }

  /** 野花与蘑菇只撒在台地上空着的地面：不压墙、不压木板与厚碎石 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const rng = new Rng(v.run.decorSeed)
    for (const d of rollDecor(v.def.decor, () => rng.next(), Math.round(v.w / UNIT), Math.round(v.h / UNIT))) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomAt(plan.basin, x, y) < 0.5 * UNIT) continue
      const l = toLocal(plan.frame, d.xU, d.yU)
      const i = cellAt(plan.grid, l.u, l.v)
      if (i >= 0 && (plan.n[i]! > 0 || plan.timber[i]! > 0 || plan.rubble[i]! > 0.05 || plan.sid[i]! > 0)) continue
      this.decorEids.push(spawnDecor(v.world, atlas, { id: d.emoji, outline: 'player', x, y, size: d.sizeU * UNIT, rot: d.rotation, alpha: d.alpha, z: 1 }))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = ruinsOf(sim)
    const plan = s.plan
    const cfg = v.def.ruins!
    const scene = v.scene
    const sc: PaintScene = { cfg, w: plan.w, h: plan.h, frame: plan.frame, grid: plan.grid, structures: plan.structures, sid: plan.sid, spaces: plan.spaces, doors: plan.doors, fallen: plan.fallen, basin: plan.basin, trees: plan.trees, seed: plan.seed }
    const gs = textureSize(sc, 'ground')
    const cs = textureSize(sc, 'canopy')
    const ground = canvasTexture(scene, GROUND_KEY, gs.w, gs.h)
    const canopy = canvasTexture(scene, CANOPY_KEY, cs.w, cs.h)
    const painter = new RuinsPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (let y = 0; y < cs.h; y += STRIP_PX) tasks.push({ layer: 'canopy', rect: { x0: 0, y0: y, x1: cs.w, y1: Math.min(cs.h, y + STRIP_PX) } })
    for (let y = 0; y < gs.h; y += STRIP_PX) tasks.push({ layer: 'ground', rect: { x0: 0, y0: y, x1: gs.w, y1: Math.min(gs.h, y + STRIP_PX) } })
    const state = snapshot(s)
    const put = (p: PaintPiece): void => {
      const tex = p.layer === 'ground' ? ground : canopy
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    await painter.paint(tasks, state, put)
    if (this.painter !== painter) return
    painter.trim(1)
    upload(ground)
    upload(canopy)
    const x0 = -PAINT_PAD_U * UNIT
    const y0 = -PAINT_PAD_U * UNIT
    this.visuals.push(scene.add.image(x0, y0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((gs.w / GROUND_PPU) * UNIT, (gs.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.visuals.push(scene.add.image(x0, y0, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((cs.w / CANOPY_PPU) * UNIT, (cs.h / CANOPY_PPU) * UNIT).setDepth(20))
    const cols = Math.ceil(gs.w / TILE_PX)
    const rows = Math.ceil(gs.h / TILE_PX)
    this.ground = { tex: ground, seen: state.n, seenT: state.timber, dirty: new Uint8Array(cols * rows), cols, rows, busy: false }
    this.sightLayer(v, plan)
    this.effects(v)
    this.roost(v, s)
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.74, 0.22, 0x000000)
  }

  /** 视线环：一行像素的贴图喂给压暗的着色器 */
  private sightLayer(v: ViewCtx, plan: RuinsPlan): void {
    const scene = v.scene
    const tex = canvasTexture(scene, SIGHT_KEY, SIGHT_BINS, 1)
    this.sight = { tex, img: tex.getContext().createImageData(SIGHT_BINS, 1) }
    const u = this.u
    const x0 = -PAINT_PAD_U * UNIT
    const y0 = -PAINT_PAD_U * UNIT
    const w = (plan.w + PAINT_PAD_U * 2) * UNIT
    const h = (plan.h + PAINT_PAD_U * 2) * UNIT
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'RuinsSight',
            fragmentSource: SIGHT_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uSight', 0)
              set('uRect', [x0, y0, w, h])
              set('uEye', u.eye)
              set('uRange', SIGHT_RANGE_U * UNIT)
              set('uSoft', 0.14 * UNIT)
              set('uDim', SIGHT_DIM)
            },
          },
          x0,
          y0,
          w,
          h,
          [SIGHT_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(SIGHT_DEPTH)
        .setBlendMode(Phaser.BlendModes.MULTIPLY),
    )
  }

  /** 扬尘、碎石与木屑的粒子，落石的影子 */
  private effects(v: ViewCtx): void {
    const scene = v.scene
    this.dust = scene.add
      .particles(0, 0, DUST_KEY, {
        lifespan: { min: 3200, max: 6000 },
        speedX: { min: WIND.x * 0.3 - 10, max: WIND.x * 1.2 + 10 },
        speedY: { min: WIND.y - 14, max: WIND.y + 8 },
        scale: { start: 0.9, end: 3.2 },
        alpha: { start: 0.36, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0xb9ab90, 0xa89a80, 0xc6b9a0, 0x9c8f78],
        emitting: false,
      })
      .setDepth(33)
    this.chips = scene.add
      .particles(0, 0, CHIP_KEY, {
        lifespan: { min: 280, max: 620 },
        speed: { min: 40, max: 170 },
        scale: { start: 0.42, end: 0.18 },
        alpha: { start: 1, end: 0.4 },
        rotate: { min: 0, max: 360 },
        gravityY: 260,
        emitting: false,
      })
      .setDepth(32)
    this.splinters = scene.add
      .particles(0, 0, SPLINTER_KEY, {
        lifespan: { min: 300, max: 700 },
        speed: { min: 50, max: 190 },
        scale: { start: 0.55, end: 0.3 },
        alpha: { start: 1, end: 0.3 },
        rotate: { min: 0, max: 360 },
        gravityY: 220,
        emitting: false,
      })
      .setDepth(32)
    this.stoneGfx = scene.add.graphics().setDepth(1.8)
    this.visuals.push(this.dust, this.chips, this.splinters, this.stoneGfx)
  }

  /** 鸽子：停在够高的墙头上 */
  private roost(v: ViewCtx, s: RuinsState): void {
    this.perches = this.perchesOf(s)
    const rng = new Rng(v.run.decorSeed ^ 0xb1d)
    for (let k = 0; k < PIGEONS && this.perches.length > 0; k++) {
      const p = this.perches[Math.floor(rng.next() * this.perches.length)]!
      const img = v.scene.add.image(p.x, p.y, PIGEON_KEY, 0).setScale((0.55 * UNIT) / PIGEON_PX).setRotation(rng.next() * Math.PI * 2).setDepth(12)
      this.pigeons.push({ img, x: p.x, y: p.y, z: 0, vx: 0, vy: 0, to: null, left: 0, flap: rng.next(), scared: 0 })
      this.visuals.push(img)
    }
  }

  /** 墙头上能停鸽子的地方：高过 PERCH_M 的砌体格，隔开挑 */
  private perchesOf(s: RuinsState): Point[] {
    const m = s.m
    const g = m.grid
    const out: Point[] = []
    for (let j = 1; j < g.rows; j += 3) {
      for (let i = 1; i < g.cols; i += 3) {
        const k = j * g.cols + i
        if (m.n[k]! * m.courseM < PERCH_M) continue
        const w = toWorld(s.plan.frame, g.u0 + (i + 0.5) * g.cell, g.v0 + (j + 0.5) * g.cell)
        out.push({ x: w.x * UNIT, y: w.y * UNIT })
      }
    }
    return out
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    if (!this.ground) return
    const s = ruinsOf(sim)
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    this.markDirty(v, s)
    this.repaint(v, s, now)
    for (const c of s.collapses) this.collapse(v, c)
    s.collapses.length = 0
    for (const im of s.impacts) {
      if (im.material === 'timber') {
        this.splinters?.explode(5, im.x, im.y)
        playSfx('splinter')
      } else if (im.material === 'masonry') {
        this.chips?.explode(4, im.x, im.y)
        playSfx('chip')
      }
    }
    s.impacts.length = 0
    this.stepStones(dt)
    this.stepSight(v, sim, s)
    this.stepPigeons(sim, s, dt)
  }

  /** 砌体改动过的格子：它所在的块与四周一圈要补画，原来或现在的墙有多高，背着太阳那边影子能拖到的块也要补画 */
  private markDirty(v: ViewCtx, s: RuinsState): void {
    const gr = this.ground!
    if (s.changed.length === 0) return
    const m = s.m
    const g = m.grid
    const f = s.plan.frame
    const hc = m.courseM
    const mpu = v.def.ruins!.meterPerU
    const lx = -SUN.x / Math.hypot(SUN.x, SUN.y)
    const ly = -SUN.y / Math.hypot(SUN.x, SUN.y)
    const perM = Math.hypot(SUN.x, SUN.y) / SUN.z
    const mark = (x: number, y: number): void => {
      const tx = Math.floor(((x + PAINT_PAD_U) * GROUND_PPU) / TILE_PX)
      const ty = Math.floor(((y + PAINT_PAD_U) * GROUND_PPU) / TILE_PX)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = tx + dx
          const cy = ty + dy
          if (cx >= 0 && cy >= 0 && cx < gr.cols && cy < gr.rows) gr.dirty[cy * gr.cols + cx] = 1
        }
      }
    }
    const tileU = TILE_PX / GROUND_PPU
    for (const i of s.changed) {
      const ci = i % g.cols
      const p = toWorld(f, g.u0 + (ci + 0.5) * g.cell, g.v0 + ((i - ci) / g.cols + 0.5) * g.cell)
      const h = Math.max(gr.seen[i]!, m.n[i]!, gr.seenT[i]!, m.timber[i]!) * hc
      gr.seen[i] = m.n[i]!
      gr.seenT[i] = m.timber[i]!
      const reach = (h * perM) / mpu
      for (let t = 0; t <= reach + tileU * 0.5; t += tileU * 0.5) mark(p.x + lx * t, p.y + ly * t)
    }
    s.changed.length = 0
  }

  /** 上一批补画完了、隔够了时间，就把记下的块整批交出去按此刻的砌体重画，画好一块重传一块 */
  private repaint(v: ViewCtx, s: RuinsState, now: number): void {
    const gr = this.ground!
    const painter = this.painter
    if (!painter || gr.busy || now < this.repaintAt) return
    const tasks: PaintTask[] = []
    const W = gr.tex.width
    const H = gr.tex.height
    for (let k = 0; k < gr.dirty.length; k++) {
      if (!gr.dirty[k]) continue
      gr.dirty[k] = 0
      const x0 = (k % gr.cols) * TILE_PX
      const y0 = Math.floor(k / gr.cols) * TILE_PX
      tasks.push({ layer: 'ground', rect: { x0, y0, x1: Math.min(W, x0 + TILE_PX), y1: Math.min(H, y0 + TILE_PX) } })
    }
    if (tasks.length === 0) return
    this.repaintAt = now + REPAINT_MS
    gr.busy = true
    void painter
      .paint(tasks, snapshot(s), (p) => {
        if (this.ground !== gr) return
        patch(v.scene, gr.tex, new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
      })
      .then(() => {
        gr.busy = false
      })
  }

  /** 塌墙：轰隆一声，大的震一下；尘土翻滚，石块从墙上落下，附近墙头的鸽子惊飞 */
  private collapse(v: ViewCtx, c: Collapse): void {
    const scene = v.scene
    if (c.volume > 0.02) playSfx('crumble')
    if (c.timber > 0) {
      this.splinters?.explode(Math.min(24, 6 + Math.round(c.timber * 400)), c.x, c.y)
      playSfx('splinter')
    }
    if (this.shake && c.volume > 0.6) scene.cameras.main.shake(260 + Math.min(500, c.volume * 120), Math.min(0.006, 0.0015 + c.volume * 0.0012))
    const puffs = Math.min(60, Math.round(4 + c.volume * 22))
    const spread = v.def.ruins!.dust.spreadU * UNIT * 0.6
    for (let k = 0; k < puffs; k++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * spread
      this.dust?.emitParticleAt(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 1)
    }
    for (const st of c.stones) {
      const size = Math.min(1.1, 0.35 + Math.cbrt(st.volume) * 1.4)
      const img = scene.add.image(st.x0, st.y0, CHIP_KEY).setScale(size).setDepth(34).setRotation(Math.random() * Math.PI * 2)
      this.stones.push({ img, x0: st.x0, y0: st.y0, x1: st.x, y1: st.y, drop: st.drop, ms: Math.sqrt((2 * Math.max(0.2, st.drop)) / GRAVITY) * 1000, t: 0, spin: (Math.random() * 2 - 1) * 9 })
    }
    for (const p of this.pigeons) if (Math.hypot(p.x - c.x, p.y - c.y) < SCARE_COLLAPSE_U * UNIT) p.scared = 1
  }

  /** 落石：按自由落体从墙上的高度落下，横着飞到落点；地上的影子随高度变淡；落地崩起碎石和一小团土 */
  private stepStones(dt: number): void {
    const g = this.stoneGfx
    if (!g) return
    g.clear()
    const kept: Stone[] = []
    for (const st of this.stones) {
      st.t += dt * 1000
      const k = Math.min(1, st.t / st.ms)
      const x = st.x0 + (st.x1 - st.x0) * k
      const y = st.y0 + (st.y1 - st.y0) * k
      const z = st.drop * (1 - k * k)
      if (k >= 1) {
        this.chips?.explode(2, x, y)
        this.dust?.emitParticleAt(x, y, 1)
        playSfx('thud')
        st.img.destroy()
        continue
      }
      kept.push(st)
      st.img.setPosition(x, y - z * LIFT_PX_PER_M).setRotation(st.img.rotation + st.spin * dt)
      const r = st.img.displayWidth * 0.4
      g.fillStyle(0x000000, 0.28 * (1 - Math.min(0.7, z / 4)))
      g.fillEllipse(x, y, r * 2.2, r * 1.1)
    }
    this.stones = kept
  }

  /** 视线环：从队长的眼睛看出去，写进贴图喂给着色器 */
  private stepSight(v: ViewCtx, sim: Sim, s: RuinsState): void {
    const sg = this.sight
    if (!sg) return
    const lx = Transform.x[sim.leader]!
    const ly = Transform.y[sim.leader]!
    sightRing(s.m, s.dust, v.def.ruins!.dust.opaqueTau, s.plan.frame, lx / UNIT, ly / UNIT, eyeM(sim.world, sim.leader), sg.img.data)
    sg.tex.getContext().putImageData(sg.img, 0, 0)
    upload(sg.tex)
    this.u.eye[0] = lx
    this.u.eye[1] = ly
  }

  /**
   * 鸽子：停着时偶尔转转身；有身体走近、附近塌了墙或脚下的墙头没了就扑棱棱飞起来，往高处兜几圈再落到别的墙头。
   * 飞着的画在树冠之上，地上跟着一个影子
   */
  private stepPigeons(sim: Sim, s: RuinsState, dt: number): void {
    if (this.pigeons.length === 0) return
    const m = s.m
    const hc = m.courseM
    const lift = LIFT_PX_PER_M
    let scaredAny = false
    for (const p of this.pigeons) {
      if (!p.to) {
        const l = toLocal(s.plan.frame, p.x / UNIT, p.y / UNIT)
        const i = cellAt(m.grid, l.u, l.v)
        if (i < 0 || m.n[i]! * hc < PERCH_M) p.scared = 1
        if (p.scared === 0) {
          for (const e of sim.characters) {
            if (Alive.v[e] && Math.hypot(Transform.x[e]! - p.x, Transform.y[e]! - p.y) < SCARE_U * UNIT) p.scared = 1
          }
        }
        if (p.scared > 0) {
          p.scared = 0
          const away = Math.random() * Math.PI * 2
          p.vx = Math.cos(away) * 4 * UNIT
          p.vy = Math.sin(away) * 4 * UNIT
          p.left = 4 + Math.random() * 5
          p.to = this.perches.length > 0 ? this.perches[Math.floor(Math.random() * this.perches.length)]! : null
          if (!p.to) p.to = { x: p.x, y: p.y }
          p.img.setDepth(36)
          scaredAny = true
        } else if (Math.random() < dt * 0.2) p.img.setRotation(p.img.rotation + (Math.random() - 0.5) * 1.2)
        continue
      }
      p.left -= dt
      p.flap += dt * 9
      const tx = p.to.x
      const ty = p.to.y
      const dx = tx - p.x
      const dy = ty - p.y
      const d = Math.hypot(dx, dy)
      if (p.left > 0) {
        const a = Math.atan2(p.vy, p.vx) + dt * 1.1
        const sp = 4.2 * UNIT
        p.vx = Math.cos(a) * sp
        p.vy = Math.sin(a) * sp
        p.z = Math.min(5, p.z + dt * 3)
      } else {
        const sp = Math.min(4.2 * UNIT, d * 2.5)
        p.vx += ((dx / (d || 1)) * sp - p.vx) * Math.min(1, dt * 4)
        p.vy += ((dy / (d || 1)) * sp - p.vy) * Math.min(1, dt * 4)
        p.z = Math.max(0, p.z - dt * 2.5)
        if (d < 0.15 * UNIT && p.z <= 0.05) {
          const l = toLocal(s.plan.frame, tx / UNIT, ty / UNIT)
          const i = cellAt(m.grid, l.u, l.v)
          if (i >= 0 && m.n[i]! * hc >= PERCH_M) {
            p.to = null
            p.x = tx
            p.y = ty
            p.z = 0
            p.img.setFrame(0).setDepth(12).setPosition(tx, ty)
            continue
          }
          this.perches = this.perchesOf(s)
          p.to = this.perches.length > 0 ? this.perches[Math.floor(Math.random() * this.perches.length)]! : { x: p.x, y: p.y }
          p.left = 2
        }
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      const frame = p.z < 0.2 && p.left <= 0 ? 1 : Math.floor(p.flap) % 2 === 0 ? 1 : 2
      p.img
        .setFrame(frame)
        .setPosition(p.x, p.y - p.z * lift)
        .setRotation(Math.atan2(p.vy, p.vx) + Math.PI / 2)
    }
    if (scaredAny) playSfx('flutter')
    const g = this.stoneGfx
    if (!g) return
    for (const p of this.pigeons) {
      if (!p.to || p.z <= 0.05) continue
      const sx = p.x - (SUN.x / SUN.z) * p.z * lift * 0.6
      const sy = p.y - (SUN.y / SUN.z) * p.z * lift * 0.6
      g.fillStyle(0x000000, 0.18)
      g.fillEllipse(sx, sy, 0.4 * UNIT, 0.2 * UNIT)
    }
  }

  resize(v: ViewCtx): void {
    this.camera(v)
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    for (const st of this.stones) st.img.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
    this.stones = []
    this.pigeons = []
    this.perches = []
    this.ground = undefined
    this.sight = undefined
    for (const key of [GROUND_KEY, CANOPY_KEY, SIGHT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
