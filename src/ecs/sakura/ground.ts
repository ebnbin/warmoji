import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellNearest, fbm, valueNoise } from '../../util/noise'
import { bridgeLocal, deckHeight, wallDist, weirLocal } from './layout'
import type { Bridge, SakuraPlan, Tree } from './layout'
import type { SakuraConfig } from '../../types/maps'

/** 树冠与瓦顶的贴图每格多少像素：花与瓦都要看得出一朵朵、一垄垄 */
export const CANOPY_PPU = 24
/** 给水面用的影子图每格多少像素 */
export const SHADE_PPU = 8
/** 院墙投影的场按这么细的格子先算好，画的时候插值，格 */
const FIELD_U = 0.125
/** 花团与影子按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2
/** 路面半宽，格（与布局一致） */
const PATH_HALF_U = 0.55
/** 堰顶平的那段多长、堰下的石壁多厚，格（与布局一致） */
const CREST_U = 0.35
const BASIN_WALL_U = 0.35
/** 瓦顶：屋脊比墙头高出多少米、院门的瓦顶再高多少米、院门的屋檐比墙的宽出多少（格） */
const ROOF_RISE_M = 0.35
const GATE_RISE_M = 0.45
const GATE_EAVE_U = 0.4
/** 一垄瓦宽多少格，筒瓦占一垄的多少 */
const TILE_U = 0.3
const ROUND_TILE = 0.4
/** 桥面板多厚（米），栏杆多高（米）：桥面两头落在岸顶，正中拱起 */
const DECK_M = 0.12
const RAIL_M = 0.7

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
/** 整张画面往暖里调：午后斜照的阳光 */
export const GRADE = { r: 1.07, g: 1.02, b: 0.9 } as const

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
  readonly cfg: SakuraConfig
  readonly plan: SakuraPlan
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

/** 一团花：圆心、半径（格）、顶高（米），属于第几棵树 */
interface Puff {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly top: number
  readonly tree: number
}

/** 一截枝：从 a 到 b、半粗（格），两头的高（米），属于第几棵树 */
interface Limb {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly w: number
  readonly za: number
  readonly zb: number
  readonly tree: number
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

/** 花团的影子按顶高的这么多倍挪开，最多挪这么远（格）：树影落在树冠旁边，不拖到院子另一头 */
const TREE_SHADOW = 0.42
const TREE_SHADOW_U = 2.6

/** 花团的影子落在哪：顺着背光的方向挪开 */
function puffShadow(sh: { x: number; y: number }, p: Puff): { x: number; y: number } {
  const l = len(sh.x, sh.y)
  const off = Math.min(TREE_SHADOW_U, p.top * TREE_SHADOW * l)
  return { x: p.x + (sh.x / l) * off, y: p.y + (sh.y / l) * off }
}

/** 每米高的东西在地上投下多长的影子（格）：背着太阳 */
function shadowPerM(cfg: SakuraConfig): { x: number; y: number } {
  return { x: -LX / LZ / cfg.meterPerU, y: -LY / LZ / cfg.meterPerU }
}

/**
 * 一棵樱花从上往下看：几根主枝从树干往四周平着伸出去，半路分出侧枝；花一团团开满枝头，外圈的花团排出一圈参差的边，
 * 团与团之间偶尔露出深色的枝；按树的序号定，每次画都一样
 */
function crownOf(t: Tree, k: number, mpu: number, puffs: Puff[], limbs: Limb[]): void {
  const R = t.r
  const H = t.h
  const m = 5 + Math.floor(hash1(k, 1) * 3)
  const base = hash1(k, 2) * Math.PI * 2
  const first = limbs.length
  for (let i = 0; i < m; i++) {
    let ang = base + ((i + (hash1(k, 10 + i) - 0.5) * 0.55) * Math.PI * 2) / m
    const L = R * (0.72 + 0.2 * hash1(k, 20 + i))
    const bend = (hash1(k, 30 + i) - 0.5) * 0.6
    let px = t.x + Math.cos(ang) * R * 0.05
    let py = t.y + Math.sin(ang) * R * 0.05
    let pz = H * 0.42
    for (let j = 0; j < 3; j++) {
      ang += bend * 0.45
      const seg = L / 3
      const nx = px + Math.cos(ang) * seg
      const ny = py + Math.sin(ang) * seg
      const nz = pz + H * 0.12
      limbs.push({ ax: px, ay: py, bx: nx, by: ny, w: R * (0.08 - j * 0.02), za: pz, zb: nz, tree: k })
      if (j === 1 && hash1(k, 40 + i) > 0.3) {
        const fa = ang + (hash1(k, 50 + i) > 0.5 ? 1 : -1) * (0.5 + 0.35 * hash1(k, 60 + i))
        const fl = L * (0.32 + 0.2 * hash1(k, 70 + i))
        limbs.push({ ax: nx, ay: ny, bx: nx + Math.cos(fa) * fl, by: ny + Math.sin(fa) * fl, w: R * 0.03, za: nz, zb: nz + H * 0.08, tree: k })
      }
      px = nx
      py = ny
      pz = nz
    }
  }
  /** 一团花：离树心不出树冠，顶高按枝的高再加上花团自己的厚 */
  const add = (cx: number, cy: number, r0: number, z: number): void => {
    const dist = len(cx - t.x, cy - t.y)
    const r = Math.min(r0, R - dist)
    if (r < R * 0.08) return
    puffs.push({ x: cx, y: cy, r, top: z + r * mpu * 0.9, tree: k })
  }
  // 顺着枝开满：花一直开到枝梢，越往外越贴着枝，树冠的边就顺着主枝伸出一瓣瓣
  for (let li = first; li < limbs.length; li++) {
    const lb = limbs[li]!
    const l = len(lb.bx - lb.ax, lb.by - lb.ay)
    const nx = -(lb.by - lb.ay) / l
    const ny = (lb.bx - lb.ax) / l
    const n = Math.max(1, Math.round(l / (R * 0.13)))
    for (let q = 0; q < n; q++) {
      const u = clamp01((q + 0.5 + (hash1(k * 7 + li, q) - 0.5) * 0.6) / n)
      const ex = lb.ax + (lb.bx - lb.ax) * u
      const ey = lb.ay + (lb.by - lb.ay) * u
      const out = len(ex - t.x, ey - t.y) / R
      const j = (hash1(k * 3 + li, q + 9) - 0.5) * R * 0.34 * (1 - 0.5 * out)
      add(ex + nx * j, ey + ny * j, R * (0.17 + 0.09 * hash1(k * 5 + li, q + 3)) * (1.1 - 0.25 * out), lb.za + (lb.zb - lb.za) * u)
    }
  }
  // 树心一圈也挤满花，只在外圈一瓣瓣之间留出缝，露出枝和地
  const ring = 7 + Math.floor(hash1(k, 3) * 3)
  for (let q = 0; q < ring; q++) {
    const a = base + ((q + 0.5) / ring) * Math.PI * 2 + (hash1(k, 110 + q) - 0.5) * 0.4
    const d = R * (0.3 + 0.18 * hash1(k, 120 + q))
    add(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, R * (0.22 + 0.06 * hash1(k, 130 + q)), H * (0.76 + 0.1 * hash1(k, 140 + q)))
  }
  // 树顶：靠近树心的几团最高
  for (let q = 0; q < 4; q++) {
    const a = hash1(k, 80 + q) * Math.PI * 2
    const d = R * (0.1 + 0.25 * hash1(k, 90 + q))
    add(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, R * (0.26 + 0.08 * hash1(k, 95 + q)), H * (0.86 + 0.1 * hash1(k, 99 + q)))
  }
}

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

/** 画之前先算一次的东西 */
export interface Prepared {
  readonly puffs: readonly Puff[]
  readonly limbs: readonly Limb[]
  readonly tint: readonly number[]
  readonly crowns: Buckets
  readonly branches: Buckets
  readonly dapple: Buckets
  readonly wallShade: Field
  readonly pathSegs: readonly { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number }[]
  readonly pathBuckets: Buckets
  readonly petalNear: Field
}

/** 院墙与院门的瓦顶在 (x, y) 处的顶高（米，离地）：屋脊最高、往两边屋檐落下；不在瓦顶下是 0 */
const WD = { k: 0, side: 0 }
function roofHeight(sc: PaintScene, x: number, y: number): number {
  const { cfg, plan } = sc
  const th = cfg.wall.thickU / 2
  const half = th + cfg.wall.eaveU
  let top = 0
  const d = wallDist(plan.walls, x, y, WD)
  if (d < half) top = cfg.wall.heightM + ROOF_RISE_M * (1 - d / half)
  for (const g of plan.gates) {
    const u = Math.abs((x - g.x) * g.ux + (y - g.y) * g.uy)
    const v = Math.abs((x - g.x) * g.nx + (y - g.y) * g.ny)
    const gh = half + GATE_EAVE_U
    if (u < g.half + GATE_EAVE_U && v < gh) top = Math.max(top, cfg.wall.heightM + GATE_RISE_M + ROOF_RISE_M * (1 - v / gh))
  }
  return top
}

export function prepare(sc: PaintScene): Prepared {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const mpu = cfg.meterPerU
  const puffs: Puff[] = []
  const limbs: Limb[] = []
  plan.trees.forEach((t, k) => crownOf(t, k, mpu, puffs, limbs))
  const tint = plan.trees.map((_, k) => (hash1(k, 7) < 0.22 ? 0.7 + 0.3 * hash1(k, 8) : 0.15 * hash1(k, 8)))
  const crowns = buckets(area)
  puffs.forEach((p, i) => file(crowns, i, p.x - p.r * 1.1, p.y - p.r * 1.1, p.x + p.r * 1.1, p.y + p.r * 1.1))
  const branches = buckets(area)
  limbs.forEach((l, i) => file(branches, i, Math.min(l.ax, l.bx) - l.w, Math.min(l.ay, l.by) - l.w, Math.max(l.ax, l.bx) + l.w, Math.max(l.ay, l.by) + l.w))
  // 花团的影子：按顶高顺着背光的方向挪开，斑斑驳驳地落在地上
  const sh = shadowPerM(cfg)
  const dapple = buckets(area)
  puffs.forEach((p, i) => {
    const c = puffShadow(sh, p)
    file(dapple, i, c.x - p.r - 0.2, c.y - p.r - 0.2, c.x + p.r + 0.2, c.y + p.r + 0.2)
  })
  // 院墙与院门的投影：每个格点往太阳那边找挡光的瓦顶，比光线高就落在影子里
  const cols = Math.ceil(area.w / FIELD_U) + 1
  const rows = Math.ceil(area.h / FIELD_U) + 1
  const v = new Float32Array(cols * rows)
  const gain = (LZ / SUN_LEN) * mpu
  const reach = (cfg.wall.heightM + GATE_RISE_M + ROOF_RISE_M) / gain
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * FIELD_U
      const y = area.y0 + j * FIELD_U
      if (roofHeight(sc, x, y) > 0) {
        v[j * cols + i] = 1
        continue
      }
      if (wallDist(plan.walls, x, y, WD) > reach + cfg.wall.thickU / 2 + cfg.wall.eaveU + GATE_EAVE_U) continue
      let over = 0
      for (let s = 0.08; s <= reach; s += 0.08) over = Math.max(over, roofHeight(sc, x + TO_SUN.x * s, y + TO_SUN.y * s) - s * gain)
      v[j * cols + i] = smooth(0, 0.08, over)
    }
  }
  const pathSegs: { ax: number; ay: number; bx: number; by: number }[] = []
  for (const line of plan.paths) for (let i = 0; i + 1 < line.length; i++) pathSegs.push({ ax: line[i]!.x, ay: line[i]!.y, bx: line[i + 1]!.x, by: line[i + 1]!.y })
  const pathBuckets = buckets(area)
  pathSegs.forEach((s, i) => file(pathBuckets, i, Math.min(s.ax, s.bx) - 1, Math.min(s.ay, s.by) - 1, Math.max(s.ax, s.bx) + 1, Math.max(s.ay, s.by) + 1))
  // 落花有多密：树下最厚，墙根、路边积着一溜，别处零零星星
  const pc = Math.ceil(area.w / 0.5) + 1
  const pr = Math.ceil(area.h / 0.5) + 1
  const pv = new Float32Array(pc * pr)
  for (let j = 0; j < pr; j++) {
    for (let i = 0; i < pc; i++) {
      const x = area.x0 + i * 0.5
      const y = area.y0 + j * 0.5
      let d = 0
      for (const t of plan.trees) {
        const q = len(t.x - x, t.y - y) / t.r
        if (q < 2.2) d = Math.max(d, smooth(2.2, 0.6, q))
      }
      const wd = wallDist(plan.walls, x, y, WD)
      d = Math.max(d, 0.45 * smooth(cfg.wall.thickU / 2 + cfg.wall.eaveU + 0.5, cfg.wall.thickU / 2 + 0.2, wd))
      pv[j * pc + i] = d
    }
  }
  return { puffs, limbs, tint, crowns, branches, dapple, wallShade: { x0: area.x0, y0: area.y0, cell: FIELD_U, cols, rows, v }, pathSegs, pathBuckets, petalNear: { x0: area.x0, y0: area.y0, cell: 0.5, cols: pc, rows: pr, v: pv } }
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

/** 花团投在地上的斑驳影子有多深：在第几团的影子里，取最深的 */
function dappleAt(sc: PaintScene, prep: Prepared, x: number, y: number): number {
  const sh = shadowPerM(sc.cfg)
  let s = 0
  for (const i of near(prep.dapple, x, y)) {
    const p = prep.puffs[i]!
    const c = puffShadow(sh, p)
    const d = len(x - c.x, y - c.y)
    if (d < p.r + 0.12) s = Math.max(s, smooth(p.r + 0.12, p.r * 0.7, d) * 0.22 * (0.55 + 0.45 * valueNoise(x * 2.6, y * 2.6, i)))
  }
  return s
}

/**
 * 桥投下的影子：桥面与两道栏杆按离地多高顺着背光挪开；z 是受影子的那一面（地面或水面）的高程（米），桥面两头落在岸顶（桥心水面高 bankM 米处）。
 * 往太阳那边找两三次就对上了
 */
function bridgeShadow(b: Bridge, bankM: number, z: number, mpu: number, x: number, y: number): number {
  const gain = (LZ / SUN_LEN) * mpu
  const foot = b.level + bankM
  let s = 0
  for (const [lift, w0, w1, k] of [
    [DECK_M, 0, b.width * 0.98, 0.5],
    [DECK_M + RAIL_M, b.width * 0.86, b.width * 0.98, 0.35],
  ] as const) {
    let lam = Math.max(0, (foot + lift + b.rise * 0.5 - z) / gain)
    let q = { a: 0, t: 0 }
    for (let it = 0; it < 3; it++) {
      q = bridgeLocal(b, x + TO_SUN.x * lam, y + TO_SUN.y * lam)
      const top = Math.abs(q.a) < b.half ? foot + lift + deckHeight(b, q.a) : z
      lam = Math.max(0, (top - z) / gain)
    }
    q = bridgeLocal(b, x + TO_SUN.x * lam, y + TO_SUN.y * lam)
    const along = Math.abs(q.a) < b.half - 0.1
    const at = Math.abs(q.t)
    if (along && at >= w0 && at < w1) s = Math.max(s, k * smooth(w1, w1 - 0.06, at))
  }
  return s
}

/** 几种落花的颜色：近白、淡粉、粉、深一点的粉 */
const PETALS = [
  [255, 240, 244],
  [250, 222, 230],
  [244, 198, 214],
  [234, 172, 194],
] as const

/** 一点有没有落着花瓣：花瓣是一头带小缺口的椭圆，按 dens 的密度撒；有就把颜色写进 out，返回盖住了多少 */
function petalAt(x: number, y: number, scale: number, seed: number, dens: number, out: number[]): number {
  const q = cellNearest(x * scale, y * scale, seed)
  if (q.h >= dens) return 0
  const ang = q.h * 91.7
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const u = (q.dx * c + q.dy * s) / 0.3
  const v = (-q.dx * s + q.dy * c) / 0.19
  const notch = u > 0.55 && Math.abs(v) < 0.22 ? 1 : 0
  const d = u * u + v * v
  if (d >= 1 || notch) return 0
  const col = PETALS[Math.floor(fract(q.h * 13.7) * PETALS.length)]!
  out[0] = col[0]
  out[1] = col[1]
  out[2] = col[2]
  return smooth(1, 0.7, d) * (0.85 + 0.15 * u)
}

const PC = [0, 0, 0]

/**
 * 地面：院子里是一片片的苔与短草，树下与墙根积着落花，零星的花瓣撒满整个院子；碎石小路从院门弯到桥头。
 * 溪岸是草坡，水边一溜湿土，溪底是细沙与小卵石，水门下铺着石板；溪尾横着一道切石砌的堰，堰下的跌水沟两边是石壁。
 * 院墙外也是苔地与落花。按地形打光：岸坡朝太阳的亮、背阴的暗；院墙、院门与桥按高度投下影子，樱花投下斑驳的影子。只画 rect 那一块
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
  const inl = plan.inlet
  const e = t.cell
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const z = sampleTerrain(sc, t.z, x, y)
      const level = sampleTerrain(sc, t.level, x, y)
      const edge = sampleTerrain(sc, t.edge, x, y)
      const inside = sampleTerrain(sc, t.inside, x, y)
      const depth = level - z
      const zx = (sampleTerrain(sc, t.z, x + e, y) - sampleTerrain(sc, t.z, x - e, y)) / (2 * e * mpu)
      const zy = (sampleTerrain(sc, t.z, x, y + e) - sampleTerrain(sc, t.z, x, y - e)) / (2 * e * mpu)
      const nz = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) * nz)
      const grain = valueNoise(x * 9, y * 9, seed + 3) * 0.5 + valueNoise(x * 23, y * 23, seed + 4) * 0.5
      let r: number
      let g: number
      let b: number
      // 苔与短草：大片的深浅按低频噪声，树下与墙根苔多，开阔处草多、略黄
      const patch = fbm(x / 5, y / 5, seed + 11, 3)
      const shadeLove = sampleField(prep.petalNear, x, y)
      const moss = clamp01(smooth(0.42, 0.62, patch) + shadeLove * 0.5)
      const blade = valueNoise(x * 4 + y * 0.6, y * 26 - x * 3, seed + 13)
      const fine = 0.9 + 0.12 * grain + 0.06 * blade
      const tone = 0.92 + 0.16 * fbm(x / 2.4 + 7, y / 2.4, seed + 17, 2)
      r = (140 + (104 - 140) * moss) * fine * tone
      g = (150 + (126 - 150) * moss) * fine * tone
      b = (88 + (72 - 88) * moss) * fine * tone
      const dry = smooth(0.55, 0.8, fbm(x / 9 + 3, y / 9, seed + 15, 2)) * (1 - moss)
      r += (150 - r) * dry * 0.35
      g += (156 - g) * dry * 0.25
      b += (84 - b) * dry * 0.3
      const gray = (r + g + b) / 3
      r += (gray - r) * 0.12
      g += (gray - g) * 0.12
      b += (gray - b) * 0.12
      // 树下积着的花瓣连成一层薄薄的粉
      const carpet = smooth(0.35, 0.95, sampleField(prep.petalNear, x, y)) * (0.75 + 0.25 * valueNoise(x * 1.7, y * 1.7, seed + 19))
      r += (236 - r) * carpet * 0.42
      g += (206 - g) * carpet * 0.42
      b += (206 - b) * carpet * 0.42
      // 院墙外：同样的苔地，稍暗
      const out_ = smooth(-th, -th - 1, inside)
      r *= 1 - 0.1 * out_
      g *= 1 - 0.08 * out_
      b *= 1 - 0.06 * out_
      // 溪岸与溪底：水边一溜湿土，水下是细沙与小卵石，深处带一点青苔
      const wet = smooth(0.35, -0.05, edge)
      if (wet > 0) {
        const sand = 0.88 + 0.16 * grain
        let sr = 172 * sand
        let sg = 154 * sand
        let sb = 124 * sand
        const pebble = cellNearest(x * 5, y * 5, seed + 21)
        const pd = len(pebble.dx, pebble.dy)
        if (pebble.h > 0.45 && pd < 0.28 + 0.1 * pebble.h) {
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
      // 碎石小路：中间是细碎的白石子，边上渐渐没进苔里
      const pd = pathAt(prep, x, y)
      if (pd < PATH_HALF_U + 0.15) {
        const a = smooth(PATH_HALF_U + 0.12 + (valueNoise(x * 4, y * 4, seed + 25) - 0.5) * 0.12, PATH_HALF_U - 0.1, pd)
        const stone = cellNearest(x * 14, y * 14, seed + 27)
        const k = 0.86 + 0.18 * stone.h - 0.12 * smooth(0.2, 0.42, len(stone.dx, stone.dy))
        r += (196 * k - r) * a
        g += (186 * k - g) * a
        b += (166 * k - b) * a
      }
      // 石堰：堰顶一排切石，石缝深；堰下的跌水沟两边是石壁，沟底湿暗
      const wl = weirLocal(wr, x, y)
      if (wl.side < wr.half + BASIN_WALL_U + 0.15 && wl.along > -0.3 && wl.along < 3.5) {
        const ditch = wr.half + 0.15
        const crest = wl.along < CREST_U && wl.side < wr.half + 0.3
        const wall = wl.along > CREST_U - 0.05 && wl.side >= ditch && wl.side < ditch + BASIN_WALL_U
        if (crest || wall) {
          const u = crest ? wl.side * Math.sign((x - wr.x) * -wr.ty + (y - wr.y) * wr.tx) : wl.along
          const v = crest ? wl.along : wl.side
          const brick = crest ? 0.55 : 0.5
          const row = Math.floor(v / 0.32)
          const bu = fract(u / brick + row * 0.5)
          const bv = fract(v / 0.32)
          const joint = Math.min(bu, 1 - bu) * brick < 0.025 || Math.min(bv, 1 - bv) * 0.32 < 0.022
          const tone = 0.86 + 0.18 * hash1(Math.floor(u / brick + row * 0.5), row + (crest ? 0 : 50))
          const k = joint ? 0.6 : tone * (0.92 + 0.12 * grain)
          r = 168 * k
          g = 160 * k
          b = 148 * k
        } else if (wl.along > CREST_U && wl.side < ditch && wl.along < cfg.weir.backU + th) {
          r = 72 + 20 * grain
          g = 74 + 20 * grain
          b = 70 + 18 * grain
        }
      }
      // 水门：进水口两边各立一块石框，门下铺着石板
      {
        const ax = x - inl.x
        const ay = y - inl.y
        const into = ax * inl.dx + ay * inl.dy
        const side = Math.abs(ax * -inl.dy + ay * inl.dx)
        if (into > th - 0.2 && into < th + 0.55 && side > inl.half - 0.05 && side < inl.half + 0.45) {
          const k = 0.85 + 0.15 * grain
          r = 160 * k
          g = 154 * k
          b = 144 * k
        } else if (into > th - 0.2 && into < th + 1.4 && side < inl.half) {
          const slab = Math.floor((into - th) / 0.45) * 7 + Math.floor(side / 0.6)
          const k = 0.8 + 0.12 * hash1(slab, 3) + 0.08 * grain
          r = 150 * k
          g = 144 * k
          b = 132 * k
        }
      }
      // 落花：树下最厚、墙根积着一溜，别处零星几片；水下的不画（水面上的花瓣另画）
      if (depth < 0.01) {
        const dens = 0.012 + 0.5 * sampleField(prep.petalNear, x, y)
        for (const [scale, sd] of [
          [3.2, 81],
          [5, 83],
        ] as const) {
          const a = petalAt(x, y, scale, seed + sd, dens * (scale < 4 ? 0.8 : 1), PC)
          if (a > 0) {
            r += (PC[0]! - r) * a
            g += (PC[1]! - g) * a
            b += (PC[2]! - b) * a
          }
        }
      }
      // 光：地形朝向；院墙、院门、桥与樱花的影子；墙根下、院墙外暗一点
      const zs = depth > 0 ? level : z
      const shade = Math.max(sampleField(prep.wallShade, x, y) * 0.5, dappleAt(sc, prep, x, y), bridgeShadow(plan.bridge, cfg.flow.bankM, zs, mpu, x, y))
      const ao = (1 - 0.18 * smooth(th + 1.2, th, Math.abs(inside))) * (1 - 0.08 * out_)
      const sky = AMBIENT * (0.75 + 0.25 * nz) * ao
      const sun = DIRECT * lambert * (1 - shade) * ao
      out[o] = r * (sky * SKY.r + sun * SUNLIGHT.r) * GRADE.r
      out[o + 1] = g * (sky * SKY.g + sun * SUNLIGHT.g) * GRADE.g
      out[o + 2] = b * (sky * SKY.b + sun * SUNLIGHT.b) * GRADE.b
      out[o + 3] = 255
    }
  }
}

/** 树的花色：背阴、中间、向阳与花心，tint 从染井吉野的近白淡粉到八重樱的浓粉 */
function blossom(tint: number): { dark: number[]; mid: number[]; lit: number[]; eye: number[] } {
  const mix = (a: readonly number[], b: readonly number[]): number[] => a.map((v, i) => v + (b[i]! - v) * tint)
  return {
    dark: mix([226, 172, 170], [212, 124, 140]),
    mid: mix([252, 222, 224], [246, 180, 198]),
    lit: mix([255, 248, 240], [255, 230, 232]),
    eye: mix([238, 160, 150], [222, 116, 128]),
  }
}

/**
 * 树冠与瓦顶：樱花是一团团的花，花团里一朵朵五瓣的小花，花心深粉；向阳的一面近白、背阴的一面深粉，低处被上面的花团压着更暗；
 * 花团之间露出深色的枝。院墙与院门的瓦顶从屋脊往两边斜下去，一垄垄筒瓦与板瓦，屋檐一排瓦当；按太阳打光。边缘柔和，像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const { plan, cfg } = sc
  const seed = plan.seed
  const mpu = cfg.meterPerU
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const th = cfg.wall.thickU / 2
  const eave = th + cfg.wall.eaveU
  const pal = prep.tint.map(blossom)
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      // 瓦顶当底色，树冠比墙高，叠在它上面
      const roof = roofTile(sc, x, y, eave, seed)
      const ur = roof ? roof[0]! : 0
      const ug = roof ? roof[1]! : 0
      const ub = roof ? roof[2]! : 0
      const ua = roof ? 1 : 0
      // 花团：取罩住这一点最高的那团
      let best = -Infinity
      let alpha = 0
      let pi = -1
      let nx = 0
      let ny = 0
      let nzz = 1
      const fl = cellNearest(x / 0.15, y / 0.15, seed + 101)
      const fd = len(fl.dx, fl.dy)
      const fa = Math.atan2(fl.dy, fl.dx)
      const petal = 0.42 * (0.84 + 0.16 * Math.cos(5 * fa + fl.h * 40))
      const cl = cellNearest(x / 0.34, y / 0.34, seed + 105)
      const cd = len(cl.dx, cl.dy)
      for (const i of near(prep.crowns, x, y)) {
        const p = prep.puffs[i]!
        const dx = x - p.x
        const dy = y - p.y
        const re = p.r * (0.9 + 0.12 * (fd < petal ? 1 : 0) - 0.1 * smooth(0.45, 0.7, cd))
        const d2 = dx * dx + dy * dy
        if (d2 >= re * re) continue
        const cz = Math.sqrt(re * re - d2)
        const hgt = p.top - re * mpu + cz * mpu
        alpha = Math.max(alpha, smooth(re, re - 0.06, Math.sqrt(d2)))
        if (hgt <= best) continue
        best = hgt
        pi = i
        nx = dx / re
        ny = dy / re
        nzz = cz / re
      }
      if (pi >= 0) {
        const p = prep.puffs[pi]!
        const c = pal[p.tree]!
        // 花团由一个个小簇鼓起来，按小簇的面打光；小簇之间的缝暗一点
        const tx = nx + cl.dx * 0.55
        const ty = ny + cl.dy * 0.55
        const l = Math.sqrt(tx * tx + ty * ty + nzz * nzz)
        const lit = clamp01(((tx * LX + ty * LY + nzz * LZ) / l + 0.35) / 1.35)
        let top = -Infinity
        for (const j of near(prep.crowns, x, y)) if (prep.puffs[j]!.tree === p.tree) top = Math.max(top, prep.puffs[j]!.top)
        const low = smooth(0, 1.4, top - best)
        const crease = smooth(0.42, 0.66, cd) * 0.14
        const between = fd < petal ? 0 : 0.08
        const k = (1 - 0.16 * low) * (1 - crease) * (1 - between)
        const warmth = lit * lit
        let r = c.dark[0]! + (c.lit[0]! - c.dark[0]!) * warmth
        let g = c.dark[1]! + (c.lit[1]! - c.dark[1]!) * warmth
        let b = c.dark[2]! + (c.lit[2]! - c.dark[2]!) * warmth
        const mid = 1 - Math.abs(warmth - 0.5) * 2
        r += (c.mid[0]! - r) * mid * 0.5
        g += (c.mid[1]! - g) * mid * 0.5
        b += (c.mid[2]! - b) * mid * 0.5
        const vary = (fract(fl.h * 17.3) - 0.5) * 0.06
        r *= k * (1 + vary * 0.4)
        g *= k * (1 + vary)
        b *= k * (1 + vary * 0.5)
        // 花心：一点深粉，亮面上看得见
        if (fd < petal * 0.26) {
          const e = smooth(petal * 0.26, petal * 0.1, fd) * (0.15 + 0.25 * lit)
          r += (c.eye[0]! - r) * e
          g += (c.eye[1]! - g) * e
          b += (c.eye[2]! - b) * e
        }
        over(out, o, r * GRADE.r, g * GRADE.g, b * GRADE.b, alpha, ur, ug, ub, ua)
        continue
      }
      // 枝：深色的树皮，朝太阳的一侧亮一点
      let limb = -1
      let lt = 0
      for (const i of near(prep.branches, x, y)) {
        const lb = prep.limbs[i]!
        const s = segDist(lb.ax, lb.ay, lb.bx, lb.by, x, y)
        const wdt = lb.w * (1 - 0.35 * s.t)
        if (s.d < wdt) {
          limb = i
          const ex = lb.bx - lb.ax
          const ey = lb.by - lb.ay
          const el = len(ex, ey) || 1
          lt = ((x - lb.ax) * -ey + (y - lb.ay) * ex) / el / wdt
        }
      }
      if (limb >= 0) {
        const lb = prep.limbs[limb]!
        const ex = (lb.bx - lb.ax) / (len(lb.bx - lb.ax, lb.by - lb.ay) || 1)
        const ey = (lb.by - lb.ay) / (len(lb.bx - lb.ax, lb.by - lb.ay) || 1)
        const side = clamp01(0.5 + 0.5 * lt * (-ey * TO_SUN.x + ex * TO_SUN.y))
        const bark = 0.82 + 0.3 * valueNoise(x * 30, y * 30, seed + 107)
        const k = (0.55 + 0.6 * side) * bark
        over(out, o, 72 * k * GRADE.r, 54 * k * GRADE.g, 50 * k * GRADE.b, smooth(1, 0.8, Math.abs(lt)), ur, ug, ub, ua)
        continue
      }
      over(out, o, 0, 0, 0, 0, ur, ug, ub, ua)
    }
  }
}

/** 颜色 (r, g, b) 按透明度 a 叠在底下的 (ur, ug, ub, ua) 上，写进 out[o..o+3]：贴图按不预乘的透明度存 */
function over(out: Uint8ClampedArray, o: number, r: number, g: number, b: number, a: number, ur: number, ug: number, ub: number, ua: number): void {
  const oa = a + ua * (1 - a)
  if (oa <= 0) {
    out[o + 3] = 0
    return
  }
  out[o] = (r * a + ur * ua * (1 - a)) / oa
  out[o + 1] = (g * a + ug * ua * (1 - a)) / oa
  out[o + 2] = (b * a + ub * ua * (1 - a)) / oa
  out[o + 3] = oa * 255
}

const ROOF: number[] = [0, 0, 0]

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
  for (const g of plan.gates) {
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
  }
  if (half === 0) return null
  const av = Math.abs(v)
  // 坡面：从屋脊往两边斜下去，朝院里的那面法线往院里倒
  const pitch = 0.55
  const sx = nx * Math.sign(v) * pitch
  const sy = ny * Math.sign(v) * pitch
  const phase = fract(u / TILE_U + (gate ? 0.5 : 0))
  let r: number
  let g: number
  let b: number
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
    const ux = -ny
    const uy = nx
    tx = sx + ux * c * 0.9
    ty = sy + uy * c * 0.9
    base *= 1.04
  } else {
    // 板瓦：微微凹下去，一片压一片
    const lap = fract(av / 0.24)
    base *= 0.8 * (0.9 + 0.12 * lap)
  }
  const l = Math.sqrt(tx * tx + ty * ty + 1)
  const lit = clamp01((tx * LX + ty * LY + LZ) / l)
  const grain = 0.94 + 0.1 * valueNoise(x * 18, y * 18, seed + 109)
  const k = (0.42 + 0.78 * lit) * base * grain
  r = 120 * k
  g = 117 * k
  b = 120 * k
  ROOF[0] = r * GRADE.r
  ROOF[1] = g * GRADE.g
  ROOF[2] = b * GRADE.b
  return ROOF
}

/** 水面上的影子：院墙、院门、桥与樱花投在水面上的影子有多深，写进 alpha */
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
      const s = Math.max(sampleField(prep.wallShade, x, y) * 0.5, dappleAt(sc, prep, x, y), bridgeShadow(plan.bridge, cfg.flow.bankM, level, cfg.meterPerU, x, y))
      out[o] = 0
      out[o + 1] = 0
      out[o + 2] = 0
      out[o + 3] = s * 255
    }
  }
}

/** 每一层用哪个画 */
export const PAINT: Record<PaintLayer, (sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect) => void> = { ground: paintGround, canopy: paintCanopy, shade: paintShade }
