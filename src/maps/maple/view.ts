import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { Rng } from '../../util/rng'
import { decorSprite, keepDecor } from '../../ecs/decor'
import { Alive, Depth, Phys, Pickup, Radius, Span, Transform, Uid } from '../../ecs/components'
import { roomAt } from '../basin'
import { flowAt } from './water'
import { Wakes } from './wakes'
import { CANOPY_PPU } from '../foliage'
import { ensureLeaves, FallingLeaves, leafKey, LEAF_U, pickLeafColor } from '../leaves'
import { canvasTexture } from '../textures'
import { groundArea, textureSize } from './ground'
import { MaplePainter } from './painter'
import { encodeWater, WATER_FRAG, Z_MIN, Z_SPAN } from './shader'
import { BRIDGE_PPU, drawBridge } from './bridge'
import { drawFence, FENCE_DEPTH_U, FENCE_PPU } from './fence'
import { bridgeLocal, ROCK_FACE_U, rocksLocal, weirLocal } from './layout'
import { mapleOf, maplePlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintLayer, PaintPiece, PaintScene } from './ground'
import type { Flow, Water } from './water'
import type { MaplePlan } from './layout'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import { FRAME } from '../frame'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const BG = 0x2c1a15
const KEYS: Record<PaintLayer, string> = { ground: 'maple-ground', canopy: 'maple-canopy', shade: 'maple-shade' }
const BED_KEY = 'maple-bed'
const LEVEL_KEY = 'maple-level'
const FLOW_KEY = 'maple-flow'
const BRIDGE_KEY = 'maple-bridge'
const FENCE_KEY = 'maple-fence'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 桥与竹栅画在这一层：水面与水上的枫叶之上，站在地上与水里的身体之下；桥下的身体挪到 UNDER_Z，画在桥下 */
const BRIDGE_DEPTH = 4
const UNDER_Z = 3.5
/** 水上漂着几片枫叶、漂多久（秒）还没漂走就换一片 */
const AFLOAT = 130
const AFLOAT_LIFE_S = 45

/** 水上的一片枫叶：多大（格），漂到竹栅前就停在离竹栅 stop 格的地方 */
interface Afloat {
  x: number
  y: number
  rot: number
  spin: number
  age: number
  stop: number
  size: number
  readonly img: Phaser.GameObjects.Image
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，高分屏开了 pixelArt 就是最近点，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/**
 * 红叶林：地面、树冠与瓦顶、水面上的影子是开局在后台线程画好的贴图；溪水由着色器按解出来的水深与流速画。
 * 木桥架在溪上，桥下漂过的身体画在桥下；下游的石槛上立着竹栅。枫叶从树上翻着跟头飘下来，地上跟着一块影子；落进水里的顺着水流漂，
 * 漂到竹栅前就堆在那里，落在地上的过一阵淡去。树冠与瓦顶盖在一切之上
 */
export class MapleView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: MaplePlan
  private painter?: MaplePainter
  private readonly u = { time: 0 }
  private afloat: Afloat[] = []
  private leaves?: FallingLeaves
  private spots: Point[] = []
  private ripples?: Phaser.GameObjects.Graphics
  private readonly wakes = new Wakes()
  /** 挪到桥下画的身体原来的 z（按实体记，uid 对不上就是换了实体） */
  private readonly lowered = new Map<number, { z: number; uid: number }>()
  private readonly flow: Flow = { h: 0, u: 0, v: 0 }

  private planOf(v: ViewCtx): MaplePlan {
    if (!this.plan) this.plan = maplePlanFor(v.def.maple!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.w * UNIT, h: p.h * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    ensureLeaves(v.scene)
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 零星的几片大红叶：只落在空地上，离墙根、林缘有一点距离，不落在桥上 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const rng = new Rng(v.run.decorSeed)
    const keep = (v.def.maple!.wall.eaveU + 0.4) * UNIT
    for (const d of rollDecor(v.def.decor, () => rng.next(), Math.round(plan.w), Math.round(plan.h))) {
      if (roomAt(plan.basin, d.xU * UNIT, d.yU * UNIT) < keep) continue
      const bl = bridgeLocal(plan.bridge, d.xU, d.yU)
      if (Math.abs(bl.a) < plan.bridge.half + 0.3 && Math.abs(bl.t) < plan.bridge.width + 0.3) continue
      v.decor.push(decorSprite(atlas, d.emoji, d.xU * UNIT, d.yU * UNIT, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = mapleOf(sim)
    const plan = s.plan
    const cfg = v.def.maple!
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const layers: PaintLayer[] = ['canopy', 'ground', 'shade']
    const tex = {} as Record<PaintLayer, Phaser.Textures.CanvasTexture>
    const sizes = {} as Record<PaintLayer, { w: number; h: number }>
    for (const l of layers) {
      sizes[l] = textureSize(sc, l)
      tex[l] = canvasTexture(scene, KEYS[l], sizes[l].w, sizes[l].h)
    }
    const painter = new MaplePainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (const layer of layers) {
      const sz = sizes[layer]
      for (let y = 0; y < sz.h; y += STRIP_PX) tasks.push({ layer, rect: { x0: 0, y0: y, x1: sz.w, y1: Math.min(sz.h, y + STRIP_PX) } })
    }
    const put = (p: PaintPiece): void => {
      tex[p.layer].getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    await Promise.all([painter.paint(tasks, put), s.ready])
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    const water = s.water
    if (!water) return
    for (const l of layers) upload(tex[l])
    const ga = groundArea(sc)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, KEYS.ground).setOrigin(0, 0).setDisplaySize((sizes.ground.w / GROUND_PPU) * UNIT, (sizes.ground.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.water(v, plan, water)
    this.bridge(v, plan)
    this.fence(v, plan)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, KEYS.canopy).setOrigin(0, 0).setDisplaySize((sizes.canopy.w / CANOPY_PPU) * UNIT, (sizes.canopy.h / CANOPY_PPU) * UNIT).setDepth(20))
    keepDecor(v.decor, (s) => roomAt(plan.basin, s.x, s.y) >= 0.4 * UNIT && flowAt(water, s.x / UNIT, s.y / UNIT, this.flow).h <= 0)
    const wr = plan.weir
    for (let i = 0; i < water.h.length; i++) {
      if (water.h[i]! <= 0.08 || water.sink[i]! >= 0) continue
      const x = ((i % water.cols) + 0.5) * water.cell
      const y = (Math.floor(i / water.cols) + 0.5) * water.cell
      if (weirLocal(wr, x, y).along > -1.5 || rocksLocal(plan.rocks, x, y).along < 1.5) continue
      this.spots.push({ x, y })
    }
    const rng = new Rng(v.run.decorSeed ^ 0x9e7a1)
    for (let k = 0; k < AFLOAT; k++) {
      const img = scene.add.image(0, 0, leafKey(pickLeafColor(rng.next()), false)).setDepth(1.6)
      const p: Afloat = { x: 0, y: 0, rot: 0, spin: 0, age: 0, stop: 0.14 + 0.36 * rng.next(), size: LEAF_U[0] + (LEAF_U[1] - LEAF_U[0]) * rng.next(), img }
      this.drift(p, rng.next())
      p.age = rng.next() * AFLOAT_LIFE_S
      this.afloat.push(p)
      this.visuals.push(img)
    }
    this.ripples = scene.add.graphics().setDepth(2)
    this.visuals.push(this.ripples)
    this.leaves = new FallingLeaves(scene)
    v.lens.screen.vignette(0.78, 0.18, 0x2e1008)
  }

  /** 水面：三张数据图与水面上的影子喂给着色器 */
  private water(v: ViewCtx, plan: MaplePlan, water: Water): void {
    const cfg = v.def.maple!
    const scene = v.scene
    const img = encodeWater(cfg, plan, water)
    const put = (key: string, data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): void => {
      canvasTexture(scene, key, w, h, (ctx) => ctx.putImageData(new ImageData(data, w, h), 0, 0))
    }
    put(BED_KEY, img.bed, img.bedCols, img.bedRows)
    put(LEVEL_KEY, img.level, img.cols, img.rows)
    put(FLOW_KEY, img.flow, img.cols, img.rows)
    const t = plan.terrain
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const u = this.u
    const wr = plan.weir
    const rk = plan.rocks
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'MapleWater',
            fragmentSource: WATER_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uBed', 0)
              set('uLevel', 1)
              set('uFlow', 2)
              set('uShade', 3)
              set('uTime', u.time)
              set('uArea', [t.x0, t.y0, t.cols * t.cell, t.rows * t.cell])
              set('uCode', [Z_MIN, Z_SPAN, cfg.meterPerU])
              set('uWeir', [wr.x, wr.y, wr.tx, wr.ty])
              set('uWeirHalf', wr.half + 0.15)
              set('uIn', [rk.x, rk.y, rk.tx, rk.ty])
              set('uInSize', [rk.half, ROCK_FACE_U])
              set('uSun', [SUN.x / sunLen, SUN.y / sunLen, SUN.z / sunLen])
            },
          },
          t.x0 * UNIT,
          t.y0 * UNIT,
          t.cols * t.cell * UNIT,
          t.rows * t.cell * UNIT,
          [BED_KEY, LEVEL_KEY, FLOW_KEY, KEYS.shade],
        )
        .setOrigin(0, 0)
        .setDepth(1.5),
    )
  }

  /** 木桥：一张画好的贴图，顺着桥面转过去 */
  private bridge(v: ViewCtx, plan: MaplePlan): void {
    const b = plan.bridge
    const w = Math.ceil(2 * b.half * BRIDGE_PPU)
    const h = Math.ceil(2 * b.width * BRIDGE_PPU)
    canvasTexture(v.scene, BRIDGE_KEY, w, h, (ctx) => drawBridge(ctx, b, v.def.maple!.meterPerU))
    this.visuals.push(
      v.scene.add
        .image(b.x * UNIT, b.y * UNIT, BRIDGE_KEY)
        .setDisplaySize(2 * b.half * UNIT, 2 * b.width * UNIT)
        .setRotation(Math.atan2(b.ay, b.ax))
        .setDepth(BRIDGE_DEPTH),
    )
  }

  /** 竹栅：一张画好的贴图，横在石槛顶上 */
  private fence(v: ViewCtx, plan: MaplePlan): void {
    const f = plan.fence
    const cfg = v.def.maple!
    canvasTexture(v.scene, FENCE_KEY, Math.ceil(2 * f.span * FENCE_PPU), Math.ceil(FENCE_DEPTH_U * FENCE_PPU), (ctx) => drawFence(ctx, f, cfg.sill.postU))
    this.visuals.push(
      v.scene.add
        .image(f.x * UNIT, f.y * UNIT, FENCE_KEY)
        .setDisplaySize(2 * f.span * UNIT, FENCE_DEPTH_U * UNIT)
        .setRotation(Math.atan2(-f.tx, f.ty))
        .setDepth(BRIDGE_DEPTH),
    )
  }

  /** 一片枫叶落在水上随便一处 */
  private drift(p: Afloat, r: number): void {
    const s = this.spots[Math.floor(r * this.spots.length)]
    if (!s) return
    p.x = (s.x + (Math.random() - 0.5) * 0.4) * UNIT
    p.y = (s.y + (Math.random() - 0.5) * 0.4) * UNIT
    p.rot = Math.random() * Math.PI * 2
    p.spin = (Math.random() * 2 - 1) * 0.5
    p.age = 0
  }

  /** 镜头里的枫树上飘下一片叶子：从树冠底下随便一处、半截树高上落下来 */
  private shedFrom(v: ViewCtx, plan: MaplePlan): { x: number; y: number; z: number } | undefined {
    const seen = plan.trees.filter((t) => v.lens.screen.sees(t.x * UNIT, t.y * UNIT))
    const t = seen[Math.floor(Math.random() * seen.length)]
    if (!t) return undefined
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * t.r * 0.9
    return { x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, z: t.h * (0.55 + 0.35 * Math.random()) }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = mapleOf(sim)
    const water = s.water
    const plan = this.plan
    if (!water || !this.ripples || !plan) return
    const cfg = v.def.maple!
    const dt = Math.min(delta, 50) / 1000
    this.u.time = sim.elapsedMs / 1000
    const toPx = UNIT / cfg.meterPerU
    const f = this.flow
    const wr = plan.weir
    // 水上的枫叶顺着水流漂，缓水里打着转慢慢聚起来；漂到竹栅前就被水压在那里，顺着竹栅挪
    for (const p of this.afloat) {
      flowAt(water, p.x / UNIT, p.y / UNIT, f)
      p.age += dt
      if (f.h < 0.02 || p.age > AFLOAT_LIFE_S) this.drift(p, Math.random())
      p.x += f.u * toPx * dt
      p.y += f.v * toPx * dt
      const ax = p.x / UNIT - wr.x
      const ay = p.y / UNIT - wr.y
      if (ax * wr.tx + ay * wr.ty > -p.stop) {
        const lat = ax * -wr.ty + ay * wr.tx
        p.x = (wr.x - wr.tx * p.stop - wr.ty * lat) * UNIT
        p.y = (wr.y - wr.ty * p.stop + wr.tx * lat) * UNIT
      }
      p.rot += p.spin * dt * (0.3 + Math.hypot(f.u, f.v))
      const fade = Math.min(1, p.age / 1.2)
      p.img.setPosition(p.x, p.y).setRotation(p.rot).setAlpha(0.95 * fade).setDisplaySize(p.size * UNIT, p.size * UNIT)
    }
    // 树上飘下的枫叶：落进水里就接着在水上漂，落在地上的过一阵淡去
    this.leaves?.step(
      dt,
      () => this.shedFrom(v, plan),
      (p) => {
        flowAt(water, p.x, p.y, f)
        if (f.h <= 0.05) return false
        const old = this.afloat.reduce((a, b) => (b.age > a.age ? b : a), this.afloat[0]!)
        old.x = p.x * UNIT
        old.y = p.y * UNIT
        old.age = 0
        old.size = p.size
        old.img.setTexture(leafKey(p.color, false))
        return true
      },
    )
    const aboard = s.aboard
    this.wakes.draw(this.ripples, sim, water, s.swimming, cfg, this.u.time, (eid) => aboard.get(eid) === Uid.v[eid])
    this.underBridge(sim, plan)
  }

  /** 桥下的身体画在桥板底下：在桥面架在水上那段的范围里、又不在桥上的，z 挪到 UNDER_Z；出来了按原样放回 */
  private underBridge(sim: Sim, plan: MaplePlan): void {
    const s = mapleOf(sim)
    const b = plan.bridge
    const seen = new Set<number>()
    for (const eid of query(sim.world, [Phys, Transform, Radius, Depth])) {
      if (Span.lo[eid]! > 0 || hasComponent(sim.world, eid, Pickup)) continue
      if (s.aboard.get(eid) === Uid.v[eid] || !Alive.v[eid]) continue
      const q = bridgeLocal(b, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT)
      if (Math.abs(q.a) >= b.span || Math.abs(q.t) > b.width + Radius.v[eid]! / UNIT) continue
      seen.add(eid)
      if (Depth.z[eid]! !== UNDER_Z && !sim.characters.includes(eid)) this.lowered.set(eid, { z: Depth.z[eid]!, uid: Uid.v[eid]! })
      Depth.z[eid] = UNDER_Z
    }
    for (const [eid, was] of this.lowered) {
      if (seen.has(eid)) continue
      if (Uid.v[eid] === was.uid && Depth.z[eid] === UNDER_Z) Depth.z[eid] = was.z
      this.lowered.delete(eid)
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
    this.afloat = []
    this.leaves?.destroy()
    this.leaves = undefined
    this.spots = []
    this.lowered.clear()
    this.ripples = undefined
    for (const key of [...Object.values(KEYS), BED_KEY, LEVEL_KEY, FLOW_KEY, BRIDGE_KEY, FENCE_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
