import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellNearest, fbm, valueNoise } from '../../util/noise'
import { crownCover, growCrowns } from '../crown'
import { CANOPY_PPU, coverLeaves, GRADE, LIT, litterAt, MULCH } from '../foliage'
import { fenceStakes, RAIL_U, RAILS, STAKE_U } from './fence'
import { bridgeLocal, CREST_U, deckHeight, PATH_HALF_U, rocksLocal, wallDist, weirLocal } from './layout'
import type { Crowns } from '../crown'
import type { Bridge, Fence, MaplePlan } from './layout'
import type { MapleConfig } from '../../types/maps'

/** 给水面用的影子图每格多少像素 */
export const SHADE_PPU = 8
/** 寺墙投影的场按这么细的格子先算好，画的时候插值，格 */
const FIELD_U = 0.125
/** 路面按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2
/** 落叶的密度场与那里落的是哪棵树的叶子，按这么粗的格子先算好，格 */
const LITTER_FIELD_U = 0.5
/** 瓦顶：屋脊比墙头高出多少米、院门的瓦顶再高多少米、院门的屋檐比墙的宽出多少（格） */
const ROOF_RISE_M = 0.35
const GATE_RISE_M = 0.45
const GATE_EAVE_U = 0.4
/** 一垄瓦宽多少格，筒瓦占一垄的多少 */
const TILE_U = 0.3
const ROUND_TILE = 0.4
/** 桥面板多厚（米）：桥面两头落在岸顶，正中拱起 */
const DECK_M = 0.12

const LX = SUN.x
const LY = SUN.y
const LZ = SUN.z
const SUN_LEN = Math.hypot(LX, LY)
const TO_SUN = { x: LX / SUN_LEN, y: LY / SUN_LEN }
/** 地面受的光：天光与正对着太阳时的阳光各多强；天光略偏冷，阳光按它配成偏暖，平地照着太阳时合起来是白的 */
const AMBIENT = 0.58
const DIRECT = 0.86
const SKY = { r: 0.97, g: 0.98, b: 1.04 } as const
const warm = (sky: number): number => 1 + (AMBIENT * (1 - sky)) / (DIRECT * LZ)
const SUNLIGHT = { r: warm(SKY.r), g: warm(SKY.g), b: warm(SKY.b) } as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)
/** 两个数的整数哈希，落在 [0, 1) */
function hash1(a: number, b: number): number {
  return fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453)
}
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)

/** 画地面、树冠与影子用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: MapleConfig
  readonly plan: MaplePlan
}

/** 地图上以格计的一块：左上角与宽高 */
export interface Area {
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 地面、树冠与瓦顶、水面上的影子 */
export type PaintLayer = 'ground' | 'canopy' | 'shade'

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly layer: PaintLayer; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly layer: PaintLayer
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面、树冠与影子都铺满地形那么大 */
export function groundArea(sc: PaintScene): Area {
  const t = sc.plan.terrain
  return { x0: t.x0, y0: t.y0, w: t.cols * t.cell, h: t.rows * t.cell }
}

const PPU: Record<PaintLayer, number> = { ground: GROUND_PPU, canopy: CANOPY_PPU, shade: SHADE_PPU }

export function textureSize(sc: PaintScene, layer: PaintLayer): { w: number; h: number } {
  const a = groundArea(sc)
  return { w: Math.round(a.w * PPU[layer]), h: Math.round(a.h * PPU[layer]) }
}

/** 按位置分桶：键是桶的行列，值是条目的序号 */
interface Buckets {
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly map: Map<number, number[]>
}

const NONE: readonly number[] = []

function buckets(area: Area): Buckets {
  return { x0: area.x0 - BUCKET_U * 4, y0: area.y0 - BUCKET_U * 4, cols: Math.ceil(area.w / BUCKET_U) + 16, map: new Map() }
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  return bk.map.get(Math.floor((y - bk.y0) / BUCKET_U) * bk.cols + Math.floor((x - bk.x0) / BUCKET_U)) ?? NONE
}

/** 把一个外接框为 [x0, x1] × [y0, y1] 的条目记进它罩住的每一桶 */
function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let by = Math.floor((y0 - bk.y0) / BUCKET_U); by <= Math.floor((y1 - bk.y0) / BUCKET_U); by++) {
    for (let bx = Math.floor((x0 - bk.x0) / BUCKET_U); bx <= Math.floor((x1 - bk.x0) / BUCKET_U); bx++) {
      const key = by * bk.cols + bx
      let list = bk.map.get(key)
      if (!list) bk.map.set(key, (list = []))
      list.push(k)
    }
  }
}

/** 点到线段的距离与线段上的比例 */
const SEG = { d: 0, t: 0 }
function segDist(ax: number, ay: number, bx: number, by: number, x: number, y: number): typeof SEG {
  const ex = bx - ax
  const ey = by - ay
  const t = clamp01(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-12))
  SEG.t = t
  SEG.d = len(x - ax - ex * t, y - ay - ey * t)
  return SEG
}

/**
 * 树冠投在地上的影子：叶子都在离地三四米上下，影子顺着背光的方向挪开这么远（格）；影子的边软多宽（格），太阳不是一个点，
 * 比这还窄的叶缝漏下来的是一个个圆圆的光斑；树影最深遮掉多少阳光
 */
const TREE_SHADOW_U = 1.2
const PENUMBRA_U = 0.04
const TREE_SHADE = 0.46
const PENUMBRA = [
  [-PENUMBRA_U, -PENUMBRA_U],
  [PENUMBRA_U, -PENUMBRA_U],
  [-PENUMBRA_U, PENUMBRA_U],
  [PENUMBRA_U, PENUMBRA_U],
] as const

/** 一张按格子铺的场：格点 (i, j) 在 (x0 + i·cell, y0 + j·cell) */
interface Field {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly v: Float32Array
}

function sampleField(f: Field, x: number, y: number): number {
  const u = Math.min(f.cols - 1.001, Math.max(0, (x - f.x0) / f.cell))
  const v = Math.min(f.rows - 1.001, Math.max(0, (y - f.y0) / f.cell))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * f.cols + ix
  const a = f.v[i]!
  const b = f.v[i + 1]!
  const c = f.v[i + f.cols]!
  const d = f.v[i + f.cols + 1]!
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 地形上 (x, y) 格处一张场的双线性插值 */
function sampleTerrain(sc: PaintScene, a: Float32Array, x: number, y: number): number {
  const t = sc.plan.terrain
  const u = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / t.cell - 0.5))
  const v = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / t.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * t.cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const r = a[i + t.cols]!
  const s = a[i + t.cols + 1]!
  return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy
}

/** 画之前先算一次的东西：树上的叶子与枝条、寺墙的投影、路、落叶有多厚与那里落的是哪棵树的叶子（−1 是哪棵都不挨着）、竹桩 */
export interface Prepared {
  readonly crowns: Crowns
  readonly wallShade: Field
  readonly pathSegs: readonly { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number }[]
  readonly pathBuckets: Buckets
  readonly litter: Field
  readonly owner: Int32Array
  readonly stakes: readonly number[]
}

/** 寺墙与院门的瓦顶在 (x, y) 处的顶高（米，离地）：屋脊最高、往两边屋檐落下；不在瓦顶下是 0 */
const WD = { k: 0, side: 0 }
function roofHeight(sc: PaintScene, x: number, y: number): number {
  const { cfg, plan } = sc
  const th = cfg.wall.thickU / 2
  const half = th + cfg.wall.eaveU
  let top = 0
  const d = wallDist(plan.walls, x, y, WD)
  if (d < half) top = cfg.wall.heightM + ROOF_RISE_M * (1 - d / half)
  const g = plan.gate
  const u = Math.abs((x - g.x) * g.ux + (y - g.y) * g.uy)
  const v = Math.abs((x - g.x) * g.nx + (y - g.y) * g.ny)
  const gh = half + GATE_EAVE_U
  if (u < g.half + GATE_EAVE_U && v < gh) top = Math.max(top, cfg.wall.heightM + GATE_RISE_M + ROOF_RISE_M * (1 - v / gh))
  return top
}

export function prepare(sc: PaintScene): Prepared {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const mpu = cfg.meterPerU
  const t = plan.terrain
  const th = cfg.wall.thickU / 2
  const crowns = growCrowns(plan.trees, plan.seed, mpu, area)
  // 寺墙与院门的投影：每个格点往太阳那边找挡光的瓦顶，比光线高就落在影子里
  const cols = Math.ceil(area.w / FIELD_U) + 1
  const rows = Math.ceil(area.h / FIELD_U) + 1
  const v = new Float32Array(cols * rows)
  const gain = (LZ / SUN_LEN) * mpu
  const reach = (cfg.wall.heightM + GATE_RISE_M + ROOF_RISE_M) / gain
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * FIELD_U
      const y = area.y0 + j * FIELD_U
      if (wallDist(plan.walls, x, y, WD) > reach + th + cfg.wall.eaveU + GATE_EAVE_U) continue
      if (roofHeight(sc, x, y) > 0) {
        v[j * cols + i] = 1
        continue
      }
      let over = 0
      for (let s = 0.08; s <= reach; s += 0.08) over = Math.max(over, roofHeight(sc, x + TO_SUN.x * s, y + TO_SUN.y * s) - s * gain)
      v[j * cols + i] = smooth(0, 0.08, over)
    }
  }
  const pathSegs: { ax: number; ay: number; bx: number; by: number }[] = []
  const line = plan.path
  for (let i = 0; i + 1 < line.length; i++) pathSegs.push({ ax: line[i]!.x, ay: line[i]!.y, bx: line[i + 1]!.x, by: line[i + 1]!.y })
  const pathBuckets = buckets(area)
  pathSegs.forEach((s, i) => file(pathBuckets, i, Math.min(s.ax, s.bx) - 1, Math.min(s.ay, s.by) - 1, Math.max(s.ax, s.bx) + 1, Math.max(s.ay, s.by) + 1))
  // 落叶有多厚：树冠底下最厚、往外渐稀；林缘铺满、往林子里也一样厚；墙根、水边积着一溜，空地上被风吹成一片一片，别处也零零星星。
  // 顺带记下这里挨着哪棵树：落在树底下的多半是这棵树的叶子
  const pc = Math.ceil(area.w / LITTER_FIELD_U) + 1
  const pr = Math.ceil(area.h / LITTER_FIELD_U) + 1
  const pv = new Float32Array(pc * pr)
  const owner = new Int32Array(pc * pr).fill(-1)
  for (let j = 0; j < pr; j++) {
    for (let i = 0; i < pc; i++) {
      const x = area.x0 + i * LITTER_FIELD_U
      const y = area.y0 + j * LITTER_FIELD_U
      let d = 0.3 + 0.5 * smooth(0.3, 0.66, fbm(x / 6.5, y / 6.5, plan.seed + 31, 3))
      d = Math.max(d, 0.7 * smooth(0.5, 0.76, fbm(x / 2.4 + 9, y / 2.4, plan.seed + 33, 2)))
      let best = 1.7
      plan.trees.forEach((tr, k) => {
        const q = len(tr.x - x, tr.y - y) / tr.r
        if (q < 2) d = Math.max(d, smooth(2, 0.9, q))
        if (q < best) {
          best = q
          owner[j * pc + i] = k
        }
      })
      const fo = sampleTerrain(sc, t.forest, x, y)
      d = Math.max(d, smooth(-2.2, 0.6, fo))
      const w = sampleTerrain(sc, t.wall, x, y)
      if (w > 0) d = Math.max(d, 0.8 * smooth(th + 1.6, th + 0.3, w))
      const e = sampleTerrain(sc, t.edge, x, y)
      if (e > 0) d = Math.max(d, 0.65 * smooth(1.6, 0.15, e))
      pv[j * pc + i] = Math.min(1, d)
    }
  }
  return {
    crowns,
    wallShade: { x0: area.x0, y0: area.y0, cell: FIELD_U, cols, rows, v },
    pathSegs,
    pathBuckets,
    litter: { x0: area.x0, y0: area.y0, cell: LITTER_FIELD_U, cols: pc, rows: pr, v: pv },
    owner,
    stakes: fenceStakes(plan.fence, cfg.sill.postU),
  }
}

/** 离路面中线多远，格 */
function pathAt(prep: Prepared, x: number, y: number): number {
  let best = Infinity
  for (const i of near(prep.pathBuckets, x, y)) {
    const s = prep.pathSegs[i]!
    best = Math.min(best, segDist(s.ax, s.ay, s.bx, s.by, x, y).d)
  }
  return best
}

/** (x, y) 处落的多半是哪棵树的叶子，−1 是哪棵都不挨着 */
function ownerAt(prep: Prepared, x: number, y: number): number {
  const f = prep.litter
  const i = Math.round((x - f.x0) / f.cell)
  const j = Math.round((y - f.y0) / f.cell)
  return i < 0 || j < 0 || i >= f.cols || j >= f.rows ? -1 : prep.owner[j * f.cols + i]!
}

/**
 * 树冠投在地上的树影有多深：从这一点往太阳那边挪 TREE_SHADOW_U，看那里头顶上叶子盖得多密（高度图里有叶子的格点占几成，四周几个点一起看，边就软了）。
 * 叶子叠着叶子，大半是实的影子，叶缝里漏下一个个圆圆的光斑
 */
function dappleAt(prep: Prepared, x: number, y: number): number {
  const c = prep.crowns
  const qx = x + TO_SUN.x * TREE_SHADOW_U
  const qy = y + TO_SUN.y * TREE_SHADOW_U
  let cover = 0
  for (const [ox, oy] of PENUMBRA) cover += crownCover(c, qx + ox, qy + oy)
  return (cover / PENUMBRA.length) * TREE_SHADE
}

/** 树冠边上的地面被伸出来的枝叶挡掉一圈天光：离树冠的边多远（格）以内、最多暗多少 */
const CROWN_AO_U = 0.45
const CROWN_AO = 0.3
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4) * CROWN_AO_U, Math.sin((k * Math.PI) / 4) * CROWN_AO_U] as const)

/** 这一点四周一圈有几成头顶上盖着叶子：挨着树冠越近、被树冠围得越多，越暗 */
function overhang(prep: Prepared, x: number, y: number): number {
  const c = prep.crowns
  let n = 0
  for (const [ox, oy] of RING) n += crownCover(c, x + ox, y + oy)
  return n / RING.length
}

/**
 * 桥面投下的影子：按桥面离地多高顺着背光挪开；z 是受影子的那一面（地面或水面）的高程（米），桥面两头落在岸顶（桥心水面高 bankM 米处）。
 * 往太阳那边找两三次就对上了
 */
function bridgeShadow(b: Bridge, bankM: number, z: number, mpu: number, x: number, y: number): number {
  const gain = (LZ / SUN_LEN) * mpu
  const foot = b.level + bankM + DECK_M
  let lam = Math.max(0, (foot + b.rise * 0.5 - z) / gain)
  let q = { a: 0, t: 0 }
  for (let it = 0; it < 3; it++) {
    q = bridgeLocal(b, x + TO_SUN.x * lam, y + TO_SUN.y * lam)
    const top = Math.abs(q.a) < b.half ? foot + deckHeight(b, q.a) : z
    lam = Math.max(0, (top - z) / gain)
  }
  q = bridgeLocal(b, x + TO_SUN.x * lam, y + TO_SUN.y * lam)
  const w = b.width * 0.98
  const at = Math.abs(q.t)
  return Math.abs(q.a) < b.half - 0.1 && at < w ? 0.5 * smooth(w, w - 0.06, at) : 0
}

/** 竹栅投下的影子：从 (x, y)（高程 z 米）往太阳那边找到竹栅那一面，光线在那里离槛顶多高；碰上竹桩或横竹就在影子里 */
function fenceShadow(f: Fence, stakes: readonly number[], base: number, heightM: number, mpu: number, z: number, x: number, y: number): number {
  const toward = TO_SUN.x * f.tx + TO_SUN.y * f.ty
  if (Math.abs(toward) < 1e-3) return 0
  const lam = -((x - f.x) * f.tx + (y - f.y) * f.ty) / toward
  if (lam <= 0) return 0
  const hz = z + lam * (LZ / SUN_LEN) * mpu - base
  if (hz < 0 || hz > heightM) return 0
  const px = x + TO_SUN.x * lam - f.x
  const py = y + TO_SUN.y * lam - f.y
  const u = px * -f.ty + py * f.tx
  if (Math.abs(u) > f.span) return 0
  for (const k of stakes) if (Math.abs(u - k) < STAKE_U / 2) return 0.45
  for (const r of RAILS) if (Math.abs(hz - r * heightM) < RAIL_U * mpu * 0.6) return 0.4
  return 0
}

/**
 * 地面：空地上是入了秋的草，黄绿里泛着褐，大半被落叶盖着——枫树底下、林缘、墙根与水边积得最厚，铺厚的地方底下透出一层半烂的红褐，
 * 空地上被风吹成一片一片，草只从叶子之间露出来；过了林缘就是林子里的阴处，越往里越暗。寺墙外是寺里耙得整整齐齐的白砂，
 * 也落着几片红叶。碎石小路从院门弯到桥头，路上的叶子被踩开了。溪岸是草坡，水边一溜湿土，溪底是细沙与小卵石；
 * 下游的石槛顶是一排切石，伸到两岸（上游的石组顶出水面，画在树冠那层）。
 * 按地形打光：岸坡朝太阳的亮、背阴的暗；寺墙、院门、桥与竹栅按高度投下影子，枫树投下斑驳透光的树影。只画 rect 那一块
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const t = plan.terrain
  const seed = plan.seed
  const mpu = cfg.meterPerU
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const th = cfg.wall.thickU / 2
  const wr = plan.weir
  const fe = plan.fence
  const e = t.cell
  const palettes = prep.crowns.palette
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const z = sampleTerrain(sc, t.z, x, y)
      const level = sampleTerrain(sc, t.level, x, y)
      const edge = sampleTerrain(sc, t.edge, x, y)
      const wall = sampleTerrain(sc, t.wall, x, y)
      const forest = sampleTerrain(sc, t.forest, x, y)
      const depth = level - z
      let zx = (sampleTerrain(sc, t.z, x + e, y) - sampleTerrain(sc, t.z, x - e, y)) / (2 * e * mpu)
      let zy = (sampleTerrain(sc, t.z, x, y + e) - sampleTerrain(sc, t.z, x, y - e)) / (2 * e * mpu)
      const grain = valueNoise(x * 9, y * 9, seed + 3) * 0.5 + valueNoise(x * 23, y * 23, seed + 4) * 0.5
      let r: number
      let g: number
      let b: number
      const temple = smooth(-th * 0.6, -th - 0.1, wall)
      // 草：入了秋，枯黄里泛褐，有的地方还留着一点绿，大片的深浅按低频噪声
      const patch = fbm(x / 5, y / 5, seed + 11, 3)
      const blade = valueNoise(x * 4 + y * 0.6, y * 26 - x * 3, seed + 13)
      const fine = 0.9 + 0.12 * grain + 0.06 * blade
      const tone = 0.92 + 0.16 * fbm(x / 2.4 + 7, y / 2.4, seed + 17, 2)
      const moss = smooth(0.42, 0.62, patch)
      const dry = smooth(0.5, 0.72, fbm(x / 3.2 + 3, y / 3.2, seed + 19, 2))
      r = (124 + (104 - 124) * moss + 16 * dry) * fine * tone
      g = (110 + (102 - 110) * moss + 6 * dry) * fine * tone
      b = (70 + (64 - 70) * moss - 2 * dry) * fine * tone
      const gray = (r + g + b) / 3
      r += (gray - r) * 0.1
      g += (gray - g) * 0.1
      b += (gray - b) * 0.1
      // 林子里：落叶底下是深色的土
      const woods = smooth(-0.2, 0.8, forest)
      r += (102 * fine - r) * woods
      g += (74 * fine - g) * woods
      b += (60 * fine - b) * woods
      // 寺里：耙出顺着墙的细纹的白砂
      if (temple > 0) {
        const rake = 0.94 + 0.07 * Math.sin((wall / 0.2) * Math.PI * 2 + valueNoise(x * 0.8, y * 0.8, seed + 41) * 1.5)
        const k = rake * (0.92 + 0.1 * grain)
        r += (224 * k - r) * temple
        g += (216 * k - g) * temple
        b += (202 * k - b) * temple
      }
      // 碎石小路：中间是细碎的白石子，边上渐渐没进草里
      const pd = pathAt(prep, x, y)
      let onPath = 0
      if (pd < PATH_HALF_U + 0.15) {
        onPath = smooth(PATH_HALF_U + 0.12 + (valueNoise(x * 4, y * 4, seed + 25) - 0.5) * 0.12, PATH_HALF_U - 0.1, pd)
        const stone = cellNearest(x * 14, y * 14, seed + 27)
        const k = 0.86 + 0.18 * stone.h - 0.12 * smooth(0.2, 0.42, len(stone.dx, stone.dy))
        r += (200 * k - r) * onPath
        g += (190 * k - g) * onPath
        b += (172 * k - b) * onPath
      }
      // 溪岸与溪底：水边一溜湿土，水下是细沙与小卵石，深处带一点青苔
      const wet = smooth(0.35, -0.05, edge)
      if (wet > 0) {
        const sand = 0.88 + 0.16 * grain
        let sr = 172 * sand
        let sg = 154 * sand
        let sb = 124 * sand
        const pebble = cellNearest(x * 5, y * 5, seed + 21)
        const pdd = len(pebble.dx, pebble.dy)
        if (pebble.h > 0.45 && pdd < 0.28 + 0.1 * pebble.h) {
          const k = (0.72 + 0.4 * pebble.h) * (0.9 + 0.2 * clamp01(0.5 - (pebble.dx * LX + pebble.dy * LY) * 2))
          sr = (142 + 40 * fract(pebble.h * 7.1)) * k
          sg = (132 + 30 * fract(pebble.h * 7.1)) * k
          sb = (118 + 26 * fract(pebble.h * 5.3)) * k
        }
        const algae = smooth(0.4, 1.1, depth) * smooth(0.45, 0.7, fbm(x / 2.5, y / 2.5, seed + 23, 2))
        sr += (96 - sr) * algae * 0.6
        sg += (112 - sg) * algae * 0.6
        sb += (78 - sb) * algae * 0.6
        const damp = smooth(-0.05, 0.3, edge) * (1 - smooth(0.05, 0.25, depth))
        sr *= 1 - 0.28 * damp
        sg *= 1 - 0.3 * damp
        sb *= 1 - 0.3 * damp
        r += (sr - r) * wet
        g += (sg - g) * wet
        b += (sb - b) * wet
      }
      // 落叶：铺得厚的地方先透出一层半烂的红褐，再一片片撒上落叶；路上被踩开、白砂上稀稀落落、水下的不画（水面上的叶子另画）
      if (depth < 0.01) {
        const dens = sampleField(prep.litter, x, y) * (1 - 0.82 * onPath) * (1 - 0.55 * wet) * (1 - 0.5 * temple)
        const mottle = valueNoise(x * 4.5, y * 4.5, seed + 18) * 0.6 + valueNoise(x * 11, y * 11, seed + 20) * 0.4
        const layer = smooth(0.55, 1, dens) * (0.45 + 0.4 * mottle)
        const tint = valueNoise(x * 0.7 + 3, y * 0.7, seed + 29)
        r += (MULCH[0] + (tint - 0.5) * 26 + (mottle - 0.5) * 30 - r) * layer * 0.85
        g += (MULCH[1] + (tint - 0.5) * 16 + (mottle - 0.5) * 20 - g) * layer * 0.85
        b += (MULCH[2] + (tint - 0.5) * 8 + (mottle - 0.5) * 14 - b) * layer * 0.85
        const owner = ownerAt(prep, x, y)
        for (const [scale, sd, k, small] of [
          [3.2, 81, 0.62, 0.6],
          [4.4, 83, 0.8, 0.62],
          [5.8, 85, 0.95, 0.62],
        ] as const) {
          const a = litterAt(x, y, scale, seed + sd, Math.min(0.92, dens * k), owner, palettes, small)
          if (a > 0) {
            r += (LIT[0]! - r) * a
            g += (LIT[1]! - g) * a
            b += (LIT[2]! - b) * a
          }
        }
      }
      // 石槛：槛顶一排切石，石缝深，从一岸伸到另一岸
      const wl = weirLocal(wr, x, y)
      if (wl.along > -0.05 && wl.along < CREST_U + 0.05 && wl.side < fe.span) {
        const u = wl.side * Math.sign((x - wr.x) * -wr.ty + (y - wr.y) * wr.tx)
        const bu = fract(u / 0.55 + 0.5)
        const joint = Math.min(bu, 1 - bu) * 0.55 < 0.025 || Math.min(wl.along + 0.05, CREST_U + 0.05 - wl.along) < 0.03
        const tone = 0.86 + 0.18 * hash1(Math.floor(u / 0.55 + 0.5), 7)
        const k = joint ? 0.6 : tone * (0.92 + 0.12 * grain)
        r = 168 * k
        g = 160 * k
        b = 148 * k
      }
      // 光：地形朝向；寺墙、院门、桥、竹栅与树的影子；墙根暗一点；过了林缘是林子里的阴处，往里很快暗下去
      const nz = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) * nz)
      const zs = depth > 0 ? level : z
      const shade = Math.max(
        sampleField(prep.wallShade, x, y) * 0.5,
        dappleAt(prep, x, y),
        bridgeShadow(plan.bridge, cfg.flow.bankM, zs, mpu, x, y),
        fenceShadow(fe, prep.stakes, wr.crest, cfg.sill.heightM, mpu, zs, x, y),
      )
      const ao = (1 - 0.18 * smooth(th + 1.2, th, Math.abs(wall))) * (1 - 0.2 * smooth(-1.2, 0.3, forest)) * (1 - 0.42 * smooth(0, 2.5, forest)) * (1 - CROWN_AO * overhang(prep, x, y))
      const sky = AMBIENT * (0.75 + 0.25 * nz) * ao
      const sun = DIRECT * lambert * (1 - shade) * ao
      out[o] = r * (sky * SKY.r + sun * SUNLIGHT.r) * GRADE.r
      out[o + 1] = g * (sky * SKY.g + sun * SUNLIGHT.g) * GRADE.g
      out[o + 2] = b * (sky * SKY.b + sun * SUNLIGHT.b) * GRADE.b
      out[o + 3] = 255
    }
  }
}

/**
 * 树冠、瓦顶与石组：枫树的树冠是一片片掌状的叶子叠出来的，什么都没有就透明、露出地面；寺墙与院门的瓦顶从屋脊往两边斜下去，一垄垄筒瓦与板瓦，
 * 屋檐一排瓦当；上游的石组一块块顶出水面。按太阳打光。边缘柔和，像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const seed = plan.seed
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const th = cfg.wall.thickU / 2
  const eave = th + cfg.wall.eaveU
  const c = prep.crowns
  const palettes = c.palette
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      // 瓦顶与石组当底色，树冠比它们高，叠在上面
      let ur = 0
      let ug = 0
      let ub = 0
      let ua = 0
      const roof = roofTile(sc, x, y, eave, seed)
      if (roof) {
        ur = roof[0]!
        ug = roof[1]!
        ub = roof[2]!
        ua = 1
      } else {
        const ra = rockAt(sc, x, y, seed, palettes, ROCK)
        if (ra > 0) {
          ur = ROCK[0]!
          ug = ROCK[1]!
          ub = ROCK[2]!
          ua = ra
        }
      }
      coverLeaves(c, x, y, out, o, ur, ug, ub, ua)
    }
  }
}

const ROOF: number[] = [0, 0, 0]
const ROCK: number[] = [0, 0, 0]

/**
 * 上游石组里罩住 (x, y) 的那块石头：圆顶陡边的花岗岩，顶上长着一片片苔、落着几片红叶，贴着水的一圈湿暗；按石面朝向打光。
 * 颜色写进 out，返回盖住了多少（边上柔和）；不在石头上是 0
 */
function rockAt(sc: PaintScene, x: number, y: number, seed: number, palettes: Int32Array, out: number[]): number {
  const rk = sc.plan.rocks
  const rl = rocksLocal(rk, x, y)
  if (rl.side > rk.span + 1 || Math.abs(rl.along) > 1.6) return 0
  let best = 0
  let hit = -1
  for (let k = 0; k < rk.stones.length; k++) {
    const st = rk.stones[k]!
    const dx = x - st.x
    const dy = y - st.y
    const q = (len(dx, dy) / st.r) * (1 + 0.07 * (valueNoise(Math.atan2(dy, dx) * 1.6 + k * 5, k, seed + 59) - 0.5))
    if (q < 1 && 1 - q > best) {
      best = 1 - q
      hit = k
    }
  }
  if (hit < 0) return 0
  const st = rk.stones[hit]!
  const dx = (x - st.x) / st.r
  const dy = (y - st.y) / st.r
  const q = Math.min(0.999, len(dx, dy))
  const slope = (2 * q ** 3) / Math.sqrt(Math.max(0.04, 1 - q ** 4))
  const bump = valueNoise(x * 7, y * 7, seed + 51) - 0.5
  const nx = (q > 1e-3 ? (dx / q) * slope : 0) + bump * 0.25
  const ny = (q > 1e-3 ? (dy / q) * slope : 0) - bump * 0.25
  const l = Math.sqrt(nx * nx + ny * ny + 1)
  const lit = clamp01((nx * LX + ny * LY + LZ) / l)
  const hue = hash1(hit, 3)
  const speck = valueNoise(x * 30, y * 30, seed + 53)
  let r = (162 + 14 * hue) * (0.88 + 0.2 * speck)
  let g = (156 + 8 * hue) * (0.88 + 0.2 * speck)
  let b = (148 + 4 * hue) * (0.88 + 0.2 * speck)
  const lichen = smooth(0.85, 0.4, q) * smooth(0.48, 0.7, fbm(x * 1.8, y * 1.8, seed + 55, 2))
  r += (108 - r) * lichen * 0.7
  g += (126 - g) * lichen * 0.7
  b += (80 - b) * lichen * 0.7
  const a = litterAt(x, y, 5, seed + 57, 0.25 * smooth(0.85, 0.35, q), -1, palettes, 0.6)
  if (a > 0) {
    r += (LIT[0]! - r) * a
    g += (LIT[1]! - g) * a
    b += (LIT[2]! - b) * a
  }
  const damp = 1 - 0.4 * smooth(0.78, 0.97, q)
  const k = (0.42 + 0.78 * lit) * damp
  out[0] = r * k * GRADE.r
  out[1] = g * k * GRADE.g
  out[2] = b * k * GRADE.b
  return smooth(1, 0.94, q)
}

/** 瓦顶在 (x, y) 处的颜色：屋脊、筒瓦与板瓦、檐口的瓦当，按坡面朝向打光；不在瓦顶下是 null */
function roofTile(sc: PaintScene, x: number, y: number, eave: number, seed: number): number[] | null {
  const { plan } = sc
  let u = 0
  let v = 0
  let half = 0
  let nx = 0
  let ny = 0
  let gate = false
  const d = wallDist(plan.walls, x, y, WD)
  if (d < eave) {
    const wl = plan.walls[WD.k]!
    const ux = (wl.bx - wl.ax) / wl.len
    const uy = (wl.by - wl.ay) / wl.len
    u = (x - wl.ax) * ux + (y - wl.ay) * uy
    v = WD.side
    half = eave
    nx = wl.nx
    ny = wl.ny
  }
  const g = plan.gate
  const gu = (x - g.x) * g.ux + (y - g.y) * g.uy
  const gv = (x - g.x) * g.nx + (y - g.y) * g.ny
  const gh = eave + GATE_EAVE_U
  if (Math.abs(gu) < g.half + GATE_EAVE_U && Math.abs(gv) < gh) {
    u = gu
    v = gv
    half = gh
    nx = g.nx
    ny = g.ny
    gate = true
  }
  if (half === 0) return null
  const av = Math.abs(v)
  // 坡面：从屋脊往两边斜下去，朝空地的那面法线往空地倒
  const pitch = 0.55
  const sx = nx * Math.sign(v) * pitch
  const sy = ny * Math.sign(v) * pitch
  const phase = fract(u / TILE_U + (gate ? 0.5 : 0))
  let tx = sx
  let ty = sy
  let base = gate ? 0.92 : 1
  if (av < 0.1) {
    // 屋脊：一道圆鼓鼓的脊瓦
    const q = av / 0.1
    tx = nx * Math.sign(v) * q * 1.2
    ty = ny * Math.sign(v) * q * 1.2
    base *= 0.95
  } else if (av > half - 0.12) {
    // 檐口：每垄筒瓦一枚圆圆的瓦当
    const c = (phase - ROUND_TILE / 2) * TILE_U
    const rr = len(c, (av - (half - 0.06)) * 1.2)
    if (rr < 0.075) {
      tx = sx + (c / 0.075) * 0.6
      ty = sy
      base *= 1.05
    } else base *= 0.62
  } else if (phase < ROUND_TILE) {
    // 筒瓦：半圆的一条，朝太阳的一侧亮
    const c = (phase / ROUND_TILE) * 2 - 1
    tx = sx - ny * c * 0.9
    ty = sy + nx * c * 0.9
    base *= 1.04
  } else {
    // 板瓦：微微凹下去，一片压一片
    base *= 0.8 * (0.9 + 0.12 * fract(av / 0.24))
  }
  const l = Math.sqrt(tx * tx + ty * ty + 1)
  const lit = clamp01((tx * LX + ty * LY + LZ) / l)
  const grain = 0.94 + 0.1 * valueNoise(x * 18, y * 18, seed + 109)
  const k = (0.42 + 0.78 * lit) * base * grain
  ROOF[0] = 120 * k * GRADE.r
  ROOF[1] = 117 * k * GRADE.g
  ROOF[2] = 120 * k * GRADE.b
  return ROOF
}

/** 水面上的影子：寺墙、院门、桥、竹栅与枫树投在水面上的影子有多深，写进 alpha */
export function paintShade(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const ppu = SHADE_PPU
  const w = rect.x1 - rect.x0
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const level = sampleTerrain(sc, plan.terrain.level, x, y)
      const s = Math.max(
        sampleField(prep.wallShade, x, y) * 0.5,
        dappleAt(prep, x, y),
        bridgeShadow(plan.bridge, cfg.flow.bankM, level, cfg.meterPerU, x, y),
        fenceShadow(plan.fence, prep.stakes, plan.weir.crest, cfg.sill.heightM, cfg.meterPerU, level, x, y),
      )
      out[o] = 0
      out[o + 1] = 0
      out[o + 2] = 0
      out[o + 3] = s * 255
    }
  }
}

/** 每一层用哪个画 */
export const PAINT: Record<PaintLayer, (sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect) => void> = { ground: paintGround, canopy: paintCanopy, shade: paintShade }
