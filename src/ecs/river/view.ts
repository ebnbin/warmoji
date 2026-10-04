import Phaser from 'phaser'
import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { MAP, rollDecor } from '../../data/maps'
import { SUN } from '../../data/light'
import { safeInsets, viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { playSfx } from '../../audio/sfx'
import { fbm } from '../../util/noise'
import { spawnDecor } from '../entities/decor'
import { Airborne, Alive, Phys, Pickup, Radius, Shard, Transform } from '../components'
import { roomAt } from '../worlds/basin'
import { CANOPY_PPU, textureSize } from './ground'
import { RiverPainter } from './painter'
import { encodeWater, WATER_FRAG, Z_MIN, Z_SPAN } from './shader'
import { flowAt } from './water'
import { riverOf, riverPlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintPiece } from './ground'
import type { Flow, Water } from './water'
import type { RiverPlan } from './layout'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'

const GROUND_KEY = 'river-ground'
const CANOPY_KEY = 'river-canopy'
const BED_KEY = 'river-bed'
const LEVEL_KEY = 'river-level'
const FLOW_KEY = 'river-flow'
const MIST_KEY = 'river-mist'
const PETAL_KEY = 'river-petal'
const KOI_KEY = 'river-koi'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 地面按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 水上漂着几片花瓣 */
const AFLOAT = 160
/** 花瓣在水上漂这么久（秒）还没漂走就换一片 */
const PETAL_LIFE_S = 45
/** 同时有几片花瓣正从树上往下飘 */
const FALLING = 40
/** 落在地上的花瓣停这么久（秒）淡掉 */
const LANDED_S = 3
/** 深潭里游着几条锦鲤 */
const KOI = 4
/** 崖顶溪边的鸟居多高（格）：底座落在它站的地方 */
const SHRINE_U = 2.4
/** 风往哪吹，像素/秒：雾气顺风飘 */
const WIND = { x: 16, y: -6 }

/** 水上漂着的一片花瓣 */
interface Afloat {
  x: number
  y: number
  rot: number
  spin: number
  age: number
  readonly img: Phaser.GameObjects.Image
}

/** 从树上飘下来的一片花瓣：在空中按 life 秒飘完，落进水里就并进水上的花瓣，落在地上停一会儿淡掉 */
interface Falling {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  sway: number
  phase: number
  rot: number
  spin: number
  landed: boolean
  readonly img: Phaser.GameObjects.Image
}

/** 一条锦鲤：绕着深潭中心转圈，半径慢慢起伏 */
interface Koi {
  a: number
  readonly w: number
  readonly r: number
  readonly swing: number
  readonly phase: number
  readonly img: Phaser.GameObjects.Image
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

/** 一团水雾：边沿被噪声扰得参差，里面一絮一絮的浓淡；贴图边上一定透明 */
function drawMist(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c
      const d = r * (1 + (0.5 - fbm(x / 10, y / 10, 29, 4)) * 0.9)
      const a = Math.min(1, Math.max(0, 1 - d) ** 1.1 * (0.55 + 0.6 * fbm(x / 6, y / 6, 33, 3))) * Math.min(1, Math.max(0, 1 - r) * 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一片樱花瓣：窄的一头连着花托、宽的一头有个小缺口，花托那头粉得深；几种粉排成一行，按帧取 */
function drawPetals(ctx: CanvasRenderingContext2D, size: number, colors: readonly (readonly [string, string])[]): void {
  colors.forEach(([tip, base], k) => {
    const cx = k * size + size / 2
    const cy = size / 2
    const s = size * 0.46
    const grad = ctx.createLinearGradient(cx - s, cy, cx + s, cy)
    grad.addColorStop(0, base)
    grad.addColorStop(0.55, tip)
    grad.addColorStop(1, tip)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(cx - s, cy)
    ctx.bezierCurveTo(cx - s * 0.4, cy - s * 0.62, cx + s * 0.75, cy - s * 0.78, cx + s, cy - s * 0.18)
    ctx.lineTo(cx + s * 0.72, cy)
    ctx.lineTo(cx + s, cy + s * 0.18)
    ctx.bezierCurveTo(cx + s * 0.75, cy + s * 0.78, cx - s * 0.4, cy + s * 0.62, cx - s, cy)
    ctx.fill()
    ctx.strokeStyle = 'rgba(214,120,160,0.35)'
    ctx.lineWidth = size * 0.035
    ctx.stroke()
  })
}

const PETAL_COLORS = [
  ['#fff4f8', '#f9c2d6'],
  ['#fde3ed', '#f4a9c6'],
  ['#fbd2e1', '#ef97b9'],
  ['#ffffff', '#fbd0df'],
] as const
const PETAL_PX = 32

/** 一条锦鲤：头朝右，分叉的尾鳍、两片胸鳍，身上按花色点几块斑；红白、丹顶、黄金、樱色排成一行，按帧取 */
function drawKoi(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  KOI_COATS.forEach(([body, fin, spots], k) => {
    ctx.save()
    ctx.translate(k * w, 0)
    const cy = h / 2
    ctx.fillStyle = fin
    ctx.beginPath()
    ctx.moveTo(w * 0.24, cy)
    ctx.quadraticCurveTo(w * 0.1, cy - h * 0.06, w * 0.03, cy - h * 0.34)
    ctx.quadraticCurveTo(w * 0.12, cy, w * 0.03, cy + h * 0.34)
    ctx.quadraticCurveTo(w * 0.1, cy + h * 0.06, w * 0.24, cy)
    ctx.fill()
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(w * 0.64, cy + side * h * 0.2, w * 0.07, h * 0.1, side * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(w * 0.95, cy)
    ctx.bezierCurveTo(w * 0.92, cy - h * 0.24, w * 0.5, cy - h * 0.26, w * 0.2, cy - h * 0.06)
    ctx.lineTo(w * 0.2, cy + h * 0.06)
    ctx.bezierCurveTo(w * 0.5, cy + h * 0.26, w * 0.92, cy + h * 0.24, w * 0.95, cy)
    ctx.fill()
    ctx.clip()
    for (const [x, y, rx, ry, color] of spots) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(w * x, cy + h * y, w * rx, h * ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  })
}

/** 锦鲤的花色：身子、鳍，身上的斑（相对位置与半径、颜色） */
const KOI_COATS: readonly (readonly [string, string, readonly (readonly [number, number, number, number, string])[]])[] = [
  ['#fffaf6', 'rgba(255,250,246,0.8)', [[0.72, -0.08, 0.12, 0.16, '#ff6b45'], [0.45, 0.06, 0.1, 0.14, '#ff6b45']]],
  ['#fffaf8', 'rgba(255,250,248,0.8)', [[0.84, 0, 0.06, 0.12, '#ff4f63']]],
  ['#ffd76e', 'rgba(255,236,170,0.85)', []],
  ['#ffeaf2', 'rgba(255,224,236,0.85)', [[0.62, -0.06, 0.13, 0.15, '#ff9fc2'], [0.35, 0.05, 0.08, 0.1, '#ff9fc2']]],
]
const KOI_W = 64
const KOI_H = 32

/**
 * 河流：地面与树冠是线程里按高度场画好的贴图，水面由着色器按解出来的水深与流速画：浅处透底、深处发暗，细浪顺水漂，急处翻白；
 * 进水口的崖上挂着水帘、崖脚砸起白沫和水雾，崖顶立着鸟居，深潭里游着锦鲤；出水口的水从断崖边落进深谷，谷里升起水雾。
 * 樱花瓣从树上飘下来，落进水里就跟着水流走、在缓处聚成一片片，落在地上停一会儿淡掉；
 * 站在水里的身体脚下一圈水线，迎水的一面推起浪、背水的一面拖出两道尾迹；随水漂着的身体周围翻着白沫。树冠盖在一切之上，飘落的花瓣又在树冠之上
 */
export class RiverView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private decorEids: number[] = []
  private plan?: RiverPlan
  private painter?: RiverPainter
  private readonly u = { time: 0 }
  private afloat: Afloat[] = []
  private falling: Falling[] = []
  private koi: Koi[] = []
  private ripples?: Phaser.GameObjects.Graphics
  private spots: Point[] = []
  /** 上一帧随水漂着的身体：新落水的哗啦一声 */
  private wading = new Set<number>()
  private readonly flow: Flow = { h: 0, u: 0, v: 0 }

  private planOf(v: ViewCtx): RiverPlan {
    if (!this.plan) this.plan = riverPlanFor(v.def.river!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.w * UNIT, h: p.h * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, v.def.palette.map)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    if (!v.scene.textures.exists(MIST_KEY)) canvasTexture(v.scene, MIST_KEY, 64, 64, (ctx) => drawMist(ctx, 64))
    if (!v.scene.textures.exists(PETAL_KEY)) {
      const tex = canvasTexture(v.scene, PETAL_KEY, PETAL_PX * PETAL_COLORS.length, PETAL_PX, (ctx) => drawPetals(ctx, PETAL_PX, PETAL_COLORS))
      PETAL_COLORS.forEach((_, k) => tex.add(k, 0, k * PETAL_PX, 0, PETAL_PX, PETAL_PX))
    }
    if (!v.scene.textures.exists(KOI_KEY)) {
      const tex = canvasTexture(v.scene, KOI_KEY, KOI_W * KOI_COATS.length, KOI_H, (ctx) => drawKoi(ctx, KOI_W, KOI_H))
      KOI_COATS.forEach((_, k) => tex.add(k, 0, k * KOI_W, 0, KOI_W, KOI_H))
    }
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

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    for (const d of rollDecor(v.def.decor, () => rng.next(), Math.round(v.w / UNIT), Math.round(v.h / UNIT))) {
      this.decorEids.push(spawnDecor(v.world, atlas, { id: d.emoji, outline: 'player', x: d.xU * UNIT, y: d.yU * UNIT, size: d.sizeU * UNIT, rot: d.rotation, alpha: d.alpha, z: 1 }))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = riverOf(sim)
    const plan = s.plan
    const cfg = v.def.river!
    const scene = v.scene
    const t = plan.terrain
    const g = textureSize(t, 'ground')
    const c = textureSize(t, 'canopy')
    const ground = canvasTexture(scene, GROUND_KEY, g.w, g.h)
    const canopy = canvasTexture(scene, CANOPY_KEY, c.w, c.h)
    const painter = new RiverPainter({ cfg, terrain: t, trees: plan.trees, seed: plan.shape.seed }, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (let y = 0; y < c.h; y += STRIP_PX) tasks.push({ layer: 'canopy', rect: { x0: 0, y0: y, x1: c.w, y1: Math.min(c.h, y + STRIP_PX) } })
    for (let y = 0; y < g.h; y += STRIP_PX) tasks.push({ layer: 'ground', rect: { x0: 0, y0: y, x1: g.w, y1: Math.min(g.h, y + STRIP_PX) } })
    const put = (p: PaintPiece): void => {
      const tex = p.layer === 'ground' ? ground : canopy
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    await Promise.all([painter.paint(tasks, put), s.ready])
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    const water = s.water
    if (!water) return
    upload(ground)
    upload(canopy)
    const x0 = t.x0 * UNIT
    const y0 = t.y0 * UNIT
    const wPx = t.cols * t.cell * UNIT
    const hPx = t.rows * t.cell * UNIT
    this.visuals.push(scene.add.image(x0, y0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(wPx, hPx).setDepth(-1))
    this.visuals.push(scene.add.image(x0, y0, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((c.w / CANOPY_PPU) * UNIT, (c.h / CANOPY_PPU) * UNIT).setDepth(20))
    this.water(v, plan, water)
    this.decorEids = this.decorEids.filter((eid) => {
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      const keep = roomAt(plan.basin, x, y) >= 0.5 * UNIT && flowAt(water, x / UNIT, y / UNIT, this.flow).h <= 0
      if (!keep) removeEntity(v.world, eid)
      return keep
    })
    const inl = plan.inlet
    if (v.atlas) {
      const up = cfg.falls.cliffU + 0.6
      const side = inl.lip + 1.4
      const x = inl.x - inl.nx * up - inl.ny * side
      const y = inl.y - inl.ny * up + inl.nx * side
      this.decorEids.push(spawnDecor(v.world, v.atlas, { id: cfg.shrine, outline: 'player', x: x * UNIT, y: (y - SHRINE_U * 0.42) * UNIT, size: SHRINE_U * UNIT, z: 4 }))
    }
    this.mist(v, plan)
    for (let i = 0; i < water.h.length; i++) if (water.h[i]! > 0.05 && water.sink[i]! < 0) this.spots.push({ x: ((i % water.cols) + 0.5) * water.cell, y: (Math.floor(i / water.cols) + 0.5) * water.cell })
    const rng = new Rng(v.run.decorSeed ^ 0x1eaf)
    for (let k = 0; k < AFLOAT; k++) {
      const img = scene.add.image(0, 0, PETAL_KEY, k % PETAL_COLORS.length).setDepth(1.6).setScale((0.2 * UNIT) / PETAL_PX)
      const petal: Afloat = { x: 0, y: 0, rot: 0, spin: 0, age: 0, img }
      this.drop(petal, rng.next())
      petal.age = rng.next() * PETAL_LIFE_S
      this.afloat.push(petal)
      this.visuals.push(img)
    }
    for (let k = 0; k < FALLING; k++) {
      const img = scene.add.image(0, 0, PETAL_KEY, k % PETAL_COLORS.length).setDepth(21)
      const f: Falling = { x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, sway: 0, phase: 0, rot: 0, spin: 0, landed: false, img }
      this.blossom(f, plan, scene.cameras.main.worldView)
      f.t = rng.next() * f.life
      this.falling.push(f)
      this.visuals.push(img)
    }
    for (let k = 0; k < KOI; k++) {
      const img = scene.add.image(0, 0, KOI_KEY, k % KOI_COATS.length).setDepth(1.55).setScale((0.9 * UNIT) / KOI_W).setAlpha(0.85)
      const speed = (rng.next() < 0.5 ? -1 : 1) * (0.45 + 0.3 * rng.next())
      this.koi.push({ a: rng.next() * Math.PI * 2, w: speed, r: inl.poolR * (0.35 + 0.25 * rng.next()), swing: inl.poolR * 0.12, phase: rng.next() * 10, img })
      this.visuals.push(img)
    }
    this.ripples = scene.add.graphics().setDepth(2)
    this.visuals.push(this.ripples)
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.8, 0.18, 0xffd9e6)
  }

  /** 水面：三张数据图喂给着色器 */
  private water(v: ViewCtx, plan: RiverPlan, water: Water): void {
    const cfg = v.def.river!
    const scene = v.scene
    const img = encodeWater(cfg, plan, water)
    const put = (key: string, data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): void => {
      canvasTexture(scene, key, w, h, (ctx) => ctx.putImageData(new ImageData(data, w, h), 0, 0))
    }
    put(BED_KEY, img.bed, img.bedCols, img.bedRows)
    put(LEVEL_KEY, img.level, img.cols, img.rows)
    put(FLOW_KEY, img.flow, img.cols, img.rows)
    const t = plan.terrain
    const [a, b] = plan.outlets as [RiverPlan['outlets'][0], RiverPlan['outlets'][0]]
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const u = this.u
    const inl = plan.inlet
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'RiverWater',
            fragmentSource: WATER_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uBed', 0)
              set('uLevel', 1)
              set('uFlow', 2)
              set('uTime', u.time)
              set('uArea', [t.x0, t.y0, t.cols * t.cell, t.rows * t.cell])
              set('uCode', [Z_MIN, Z_SPAN, cfg.meterPerU])
              set('uOut0', [a.x, a.y, a.nx, a.ny])
              set('uOut1', [b.x, b.y, b.nx, b.ny])
              set('uOutHalf', [a.half, b.half])
              set('uIn', [inl.poolX, inl.poolY, inl.nx, inl.ny])
              set('uInSize', [inl.lip, inl.half, cfg.falls.cliffU, Math.hypot(inl.x - inl.poolX, inl.y - inl.poolY)])
              set('uSun', [SUN.x / sunLen, SUN.y / sunLen, SUN.z / sunLen])
            },
          },
          t.x0 * UNIT,
          t.y0 * UNIT,
          t.cols * t.cell * UNIT,
          t.rows * t.cell * UNIT,
          [BED_KEY, LEVEL_KEY, FLOW_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(1.5),
    )
  }

  /** 水雾：瀑布砸进深潭的地方一大团，两个断崖边下的深谷里各一团，顺风飘散 */
  private mist(v: ViewCtx, plan: RiverPlan): void {
    const scene = v.scene
    const inl = plan.inlet
    const at = (x: number, y: number, w: number, d: number, nx: number, ny: number, rate: number, big: number): Phaser.GameObjects.Particles.ParticleEmitter =>
      scene.add
        .particles(0, 0, MIST_KEY, {
          lifespan: { min: 2400, max: 4200 },
          frequency: rate,
          speedX: { min: WIND.x * 0.4, max: WIND.x * 1.2 },
          speedY: { min: WIND.y - 22, max: WIND.y - 8 },
          scale: { start: 0.5 * big, end: 2.2 * big },
          alpha: { start: 0.5, end: 0 },
          rotate: { min: 0, max: 360 },
          tint: [0xffffff, 0xffeef4, 0xfbe0eb],
          emitZone: {
            type: 'random',
            source: {
              getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
                const s = (Math.random() * 2 - 1) * w
                const a = Math.random() * d
                p.x = (x + nx * a - ny * s) * UNIT
                p.y = (y + ny * a + nx * s) * UNIT
              },
            },
          },
        })
        .setDepth(34)
    this.visuals.push(at(inl.x, inl.y, inl.half, 1.6, inl.nx, inl.ny, 55, 1.3))
    for (const o of plan.outlets) this.visuals.push(at(o.x + o.nx * 0.6, o.y + o.ny * 0.6, o.half, 2.8, o.nx, o.ny, 80, 1.2))
  }

  /** 花瓣落在水上随便一处 */
  private drop(petal: Afloat, r: number): void {
    const p = this.spots[Math.floor(r * this.spots.length)]
    if (!p) return
    petal.x = (p.x + (Math.random() - 0.5) * 0.4) * UNIT
    petal.y = (p.y + (Math.random() - 0.5) * 0.4) * UNIT
    petal.rot = Math.random() * Math.PI * 2
    petal.spin = (Math.random() * 2 - 1) * 0.8
    petal.age = 0
  }

  /** 一片花瓣从镜头里（没有就随便）一棵樱花的树冠上飘下来：慢慢往画面下方落，一边左右摇、一边翻 */
  private blossom(f: Falling, plan: RiverPlan, view: Phaser.Geom.Rectangle): void {
    const m = 2 * UNIT
    const seen = plan.trees.filter((t) => t.x * UNIT > view.x - m && t.x * UNIT < view.right + m && t.y * UNIT > view.y - m && t.y * UNIT < view.bottom + m)
    const pool = seen.length > 0 ? seen : plan.trees
    const tr = pool[Math.floor(Math.random() * pool.length)]
    if (!tr) return
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * tr.r * 0.9
    const dir = Math.random() * Math.PI * 2
    const sp = (0.1 + Math.random() * 0.25) * UNIT
    f.x = (tr.x + Math.cos(a) * d) * UNIT
    f.y = (tr.y + Math.sin(a) * d) * UNIT
    f.vx = Math.cos(dir) * sp
    f.vy = Math.sin(dir) * sp + 0.3 * UNIT
    f.t = 0
    f.life = 2.6 + Math.random() * 2.4
    f.sway = (0.15 + Math.random() * 0.25) * UNIT
    f.phase = Math.random() * Math.PI * 2
    f.rot = Math.random() * Math.PI * 2
    f.spin = (Math.random() * 2 - 1) * 2.5
    f.landed = false
    f.img.setFrame(Math.floor(Math.random() * PETAL_COLORS.length)).setDepth(21)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = riverOf(sim)
    const water = s.water
    if (!water || !this.ripples) return
    const cfg = v.def.river!
    const dt = Math.min(delta, 50) / 1000
    this.u.time = sim.elapsedMs / 1000
    const toPx = UNIT / cfg.meterPerU
    const f = this.flow
    for (const p of this.afloat) {
      flowAt(water, p.x / UNIT, p.y / UNIT, f)
      p.age += dt
      const gone = f.h < 0.02 || p.age > PETAL_LIFE_S || s.plan.outlets.some((o) => (p.x / UNIT - o.x) * o.nx + (p.y / UNIT - o.y) * o.ny > 0)
      if (gone) this.drop(p, Math.random())
      p.x += f.u * toPx * dt
      p.y += f.v * toPx * dt
      p.rot += p.spin * dt * (0.3 + Math.hypot(f.u, f.v))
      const fade = Math.min(1, p.age / 1.5)
      p.img.setPosition(p.x, p.y).setRotation(p.rot).setAlpha(0.95 * fade)
    }
    const size = (0.22 * UNIT) / PETAL_PX
    for (const p of this.falling) {
      p.t += dt
      if (p.landed) {
        p.img.setAlpha(Math.min(1, (LANDED_S - p.t) / 1.2))
        if (p.t >= LANDED_S) this.blossom(p, s.plan, v.scene.cameras.main.worldView)
        continue
      }
      const x = p.x + p.vx * p.t + Math.sin(p.phase + p.t * 2.2) * p.sway
      const y = p.y + p.vy * p.t
      const k = p.t / p.life
      const flip = 0.35 + 0.65 * Math.abs(Math.cos(p.phase + p.t * 3.1))
      p.img.setPosition(x, y).setRotation(p.rot + p.spin * p.t).setScale(size * (1.15 - 0.3 * k), size * (1.15 - 0.3 * k) * flip).setAlpha(Math.min(1, p.t / 0.4))
      if (p.t < p.life) continue
      flowAt(water, x / UNIT, y / UNIT, f)
      if (f.h > 0.05) {
        let oldest = this.afloat[0]
        for (const q of this.afloat) if (oldest && q.age > oldest.age) oldest = q
        if (oldest) {
          oldest.x = x
          oldest.y = y
          oldest.rot = p.rot + p.spin * p.t
          oldest.age = 1.5
          oldest.img.setFrame(p.img.frame.name)
        }
        this.blossom(p, s.plan, v.scene.cameras.main.worldView)
        continue
      }
      p.landed = true
      p.t = 0
      p.img.setDepth(1.2).setScale(size * 0.85)
    }
    const inl = s.plan.inlet
    for (const k of this.koi) {
      const r = k.r + Math.sin(this.u.time * 0.35 + k.phase) * k.swing
      k.a += (k.w / r) * dt
      const head = k.a + (Math.sign(k.w) * Math.PI) / 2 + Math.sin(this.u.time * 7 + k.phase) * 0.12
      k.img.setPosition((inl.poolX + Math.cos(k.a) * r) * UNIT, (inl.poolY + Math.sin(k.a) * r) * UNIT).setRotation(head)
    }
    const g = this.ripples
    g.clear()
    const swimming = s.swimming
    for (const eid of swimming.keys()) if (!this.wading.has(eid)) playSfx('wash')
    this.wading = new Set(swimming.keys())
    for (const eid of query(sim.world, [Phys, Transform, Radius])) {
      if (!Alive.v[eid] || hasComponent(sim.world, eid, Airborne) || hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Shard)) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      flowAt(water, x / UNIT, y / UNIT, f)
      if (f.h < cfg.body.wetM) continue
      const r = Radius.v[eid]!
      const deep = Math.min(1, f.h / 0.4)
      const fx = x
      const fy = y + r * 0.45
      const rx = f.u * toPx - Phys.vx[eid]!
      const ry = f.v * toPx - Phys.vy[eid]!
      const rel = Math.hypot(rx, ry)
      const push = Math.min(1, rel / (2.5 * UNIT))
      if (swimming.has(eid)) {
        for (let k = 0; k < 6; k++) {
          const a = k * 1.05 + this.u.time * (2 + (eid % 3))
          const d = r * (0.7 + 0.3 * Math.sin(this.u.time * 5 + k * 2.1 + eid))
          g.fillStyle(0xfff2f7, 0.35 + 0.25 * Math.sin(this.u.time * 7 + k))
          g.fillCircle(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.55, r * (0.18 + 0.08 * Math.sin(k + this.u.time * 4)))
        }
        g.lineStyle(0.06 * UNIT, 0xfff6fa, 0.5)
        g.strokeEllipse(fx, fy, r * 2.4, r * 1.3)
        continue
      }
      const pulse = 1 + 0.06 * Math.sin(this.u.time * 3 + eid)
      g.lineStyle(0.045 * UNIT, 0xffecf3, 0.22 + 0.25 * deep)
      g.strokeEllipse(fx, fy, r * 2.1 * pulse, r * 1.05 * pulse)
      if (rel < 0.25 * UNIT) continue
      const ux = rx / rel
      const uy = ry / rel
      const a = Math.atan2(-uy, -ux * 0.5)
      g.lineStyle(0.07 * UNIT * (0.6 + push), 0xfff8fb, 0.3 + 0.5 * push * deep)
      g.beginPath()
      for (let k = 0; k <= 8; k++) {
        const t = a - 1.2 + (2.4 * k) / 8
        const px = fx + Math.cos(t) * r * 1.05
        const py = fy + Math.sin(t) * r * 0.55
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
      const len = r * (0.7 + 1.5 * push)
      for (const side of [-1, 1]) {
        let px = fx - uy * side * r * 0.95
        let py = fy + ux * side * r * 0.5
        const dx = ux - uy * side * 0.45
        const dy = (uy + ux * side * 0.45) * 0.6
        for (let k = 0; k < 4; k++) {
          const nx = px + (dx * len) / 4
          const ny = py + (dy * len) / 4
          g.lineStyle(0.05 * UNIT * (1 - k * 0.18), 0xfff0f6, (0.12 + 0.35 * push * deep) * (1 - k / 4))
          g.lineBetween(px, py, nx, ny)
          px = nx
          py = ny
        }
      }
    }
  }

  resize(v: ViewCtx): void {
    this.camera(v)
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
    this.afloat = []
    this.falling = []
    this.koi = []
    this.spots = []
    this.wading.clear()
    this.ripples = undefined
    for (const key of [GROUND_KEY, CANOPY_KEY, BED_KEY, LEVEL_KEY, FLOW_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
