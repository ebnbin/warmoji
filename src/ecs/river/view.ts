import Phaser from 'phaser'
import { removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { MAP, rollDecor } from '../../data/maps'
import { SUN } from '../../data/light'
import { safeInsets, viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { fbm } from '../../util/noise'
import { spawnDecor } from '../entities/decor'
import { Transform } from '../components'
import { roomAt } from '../worlds/basin'
import { CANOPY_PPU, textureSize } from './ground'
import { RiverPainter } from './painter'
import { encodeWater, WATER_FRAG, Z_MIN, Z_SPAN } from './shader'
import { flowAt } from './water'
import { Wakes } from './wakes'
import { riverOf, riverPlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintPiece } from './ground'
import type { Flow, Water } from './water'
import type { RiverPlan } from './layout'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'

const BG = 0x0c1510
const GROUND_KEY = 'river-ground'
const CANOPY_KEY = 'river-canopy'
const BED_KEY = 'river-bed'
const LEVEL_KEY = 'river-level'
const FLOW_KEY = 'river-flow'
const MIST_KEY = 'river-mist'
const LEAF_KEY = 'river-leaf'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 地面按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 水上漂着几片叶子 */
const LEAVES = 36
/** 叶子在水上漂这么久（秒）还没漂走就换一片 */
const LEAF_LIFE_S = 45
/** 风往哪吹，像素/秒：雾气顺风飘 */
const WIND = { x: 16, y: -6 }

interface Leaf {
  x: number
  y: number
  rot: number
  spin: number
  age: number
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

/** 一片落叶：尖头的叶片带一道叶脉，几种秋天的颜色排成一行，按帧取 */
function drawLeaves(ctx: CanvasRenderingContext2D, size: number, colors: readonly string[]): void {
  colors.forEach((c, k) => {
    const cx = k * size + size / 2
    const cy = size / 2
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.42, cy)
    ctx.quadraticCurveTo(cx - size * 0.05, cy - size * 0.32, cx + size * 0.42, cy)
    ctx.quadraticCurveTo(cx - size * 0.05, cy + size * 0.32, cx - size * 0.42, cy)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,25,10,0.45)'
    ctx.lineWidth = size * 0.04
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.45, cy)
    ctx.lineTo(cx + size * 0.36, cy)
    ctx.stroke()
  })
}

const LEAF_COLORS = ['#c58a2c', '#a8541f', '#7f8f2e', '#d1a645', '#8c3d1c'] as const
const LEAF_PX = 32

/**
 * 河流：地面与树冠是线程里按高度场画好的贴图，水面由着色器按解出来的水深与流速画：浅处透底、深处发暗，细浪顺水漂，急处翻白；
 * 进水口的崖上挂着水帘、崖脚砸起白沫和水雾，出水口的水从断崖边落进深谷，谷里升起水雾。水上漂着落叶，跟着水流走；
 * 站在水里的身体脚下一圈水线，迎水的一面推起浪、背水的一面拖出两道尾迹；随水漂着的身体周围翻着白沫。树冠盖在一切之上
 */
export class RiverView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private decorEids: number[] = []
  private plan?: RiverPlan
  private painter?: RiverPainter
  private readonly u = { time: 0 }
  private leaves: Leaf[] = []
  private ripples?: Phaser.GameObjects.Graphics
  private spots: Point[] = []
  private readonly wakes = new Wakes()
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
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, BG)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    if (!v.scene.textures.exists(MIST_KEY)) canvasTexture(v.scene, MIST_KEY, 64, 64, (ctx) => drawMist(ctx, 64))
    if (!v.scene.textures.exists(LEAF_KEY)) {
      const tex = canvasTexture(v.scene, LEAF_KEY, LEAF_PX * LEAF_COLORS.length, LEAF_PX, (ctx) => drawLeaves(ctx, LEAF_PX, LEAF_COLORS))
      LEAF_COLORS.forEach((_, k) => tex.add(k, 0, k * LEAF_PX, 0, LEAF_PX, LEAF_PX))
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
    const painter = new RiverPainter({ cfg, terrain: t, trees: plan.trees, boulders: plan.boulders, seed: plan.shape.seed }, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    this.mist(v, plan)
    for (let i = 0; i < water.h.length; i++) if (water.h[i]! > 0.05 && water.sink[i]! < 0) this.spots.push({ x: ((i % water.cols) + 0.5) * water.cell, y: (Math.floor(i / water.cols) + 0.5) * water.cell })
    const rng = new Rng(v.run.decorSeed ^ 0x1eaf)
    for (let k = 0; k < LEAVES; k++) {
      const img = scene.add.image(0, 0, LEAF_KEY, k % LEAF_COLORS.length).setDepth(1.6).setScale((0.32 * UNIT) / LEAF_PX)
      const leaf: Leaf = { x: 0, y: 0, rot: 0, spin: 0, age: 0, img }
      this.drop(leaf, rng.next())
      leaf.age = rng.next() * LEAF_LIFE_S
      this.leaves.push(leaf)
      this.visuals.push(img)
    }
    this.ripples = scene.add.graphics().setDepth(2)
    this.visuals.push(this.ripples)
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.72, 0.2, 0x000000)
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
          tint: [0xffffff, 0xe6f2f2, 0xd4e6e8],
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

  /** 叶子落在水上随便一处 */
  private drop(leaf: Leaf, r: number): void {
    const p = this.spots[Math.floor(r * this.spots.length)]
    if (!p) return
    leaf.x = (p.x + (Math.random() - 0.5) * 0.4) * UNIT
    leaf.y = (p.y + (Math.random() - 0.5) * 0.4) * UNIT
    leaf.rot = Math.random() * Math.PI * 2
    leaf.spin = (Math.random() * 2 - 1) * 0.8
    leaf.age = 0
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
    for (const leaf of this.leaves) {
      flowAt(water, leaf.x / UNIT, leaf.y / UNIT, f)
      leaf.age += dt
      const gone = f.h < 0.02 || leaf.age > LEAF_LIFE_S || s.plan.outlets.some((o) => (leaf.x / UNIT - o.x) * o.nx + (leaf.y / UNIT - o.y) * o.ny > 0)
      if (gone) this.drop(leaf, Math.random())
      leaf.x += f.u * toPx * dt
      leaf.y += f.v * toPx * dt
      leaf.rot += leaf.spin * dt * (0.3 + Math.hypot(f.u, f.v))
      const fade = Math.min(1, leaf.age / 1.5)
      leaf.img.setPosition(leaf.x, leaf.y).setRotation(leaf.rot).setAlpha(0.9 * fade)
    }
    this.wakes.draw(this.ripples, sim, water, s.swimming, cfg, this.u.time)
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
    this.leaves = []
    this.spots = []
    this.ripples = undefined
    for (const key of [GROUND_KEY, CANOPY_KEY, BED_KEY, LEVEL_KEY, FLOW_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
