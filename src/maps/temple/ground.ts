import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { FRAME_U, UNIT } from '../../util/units'
import { altarSd, HEAD_HALF_U, jungleEdge, plateRect, rectSd, snoutRect, toLocal, toMap } from './layout'
import type { Court, Local, Rect, TemplePlan, Trap } from './layout'
import type { TempleConfig } from '../../types/maps'

/** 树冠贴图每格多少像素：树冠边是软的，用不着地面那么细 */
export const CANOPY_PPU = 16
/** 高度、阴影、树影先在这么细（格）的格子上算好，画的时候插值 */
const GRID_U = 0.125
/** 立面按假想的斜俯视画：每高一米，朝屏幕下方的那一面露出多宽（格）；整面最多露出 FACE_MAX_U 格，再高的按比例压扁 */
const FACE_U_PER_M = 0.2
const FACE_MAX_U = 0.6
/** 地上的影子比照着真太阳短这么多成：正午的太阳高，画面上的影子都按它收短 */
const SHADOW_SCALE = 0.6
/** 树冠的影子最多挪开这么远（格），影子的边软多宽（格） */
const TREE_SHADOW_U = 4.5
const TREE_SOFT_U = 0.6
/** 一行石板顺着 a 多宽（格），一块石板横着平均多长（格） */
const ROW_U = 1.3
const SLAB_U = 2.1
/** 石板缝多宽（格） */
const JOINT_U = 0.035
/** 金字塔底层两侧比两墙外沿再宽出几格；每往上一层两侧收进几倍台宽 */
const PYRAMID_WIDE_U = 1.2
const PYRAMID_STEP_IN = 1.5
/** 顶上神殿：进深、半宽（格）、比最上一层台高出多少米；殿顶的屋脊饰（格、米） */
const SHRINE_DEEP_U = 4.2
const SHRINE_HALF_U = 3.4
const SHRINE_M = 2.6
/** 台阶一级多高（米），两侧扶栏多宽（格）、比台阶高出多少米 */
const STEP_M = 0.35
const RAIL_U = 0.45
const RAIL_M = 0.3
/** 墙往丛林里伸出前庭这么远（格）才断掉 */
const WALL_TAIL_U = 2.5

const LEN = Math.hypot(SUN.x, SUN.y, SUN.z)
const LX = SUN.x / LEN
const LY = SUN.y / LEN
const LZ = SUN.z / LEN
const LXY = Math.hypot(SUN.x, SUN.y)
/** 太阳在画面上的水平方向（单位向量，指向太阳） */
const TO_SUN = { x: SUN.x / LXY, y: SUN.y / LXY }

/** 地面受的光：天光与正对着太阳时的阳光各多强；天光被四周的丛林映得偏绿，阳光按它配成偏暖 */
const AMBIENT = 0.44
const DIRECT = 0.84
const SKY = { r: 0.84, g: 1.0, b: 0.95 } as const
const warm = (sky: number): number => 1 + (AMBIENT * (1 - sky)) / (DIRECT * LZ)
const SUNLIGHT = { r: warm(SKY.r), g: warm(SKY.g), b: warm(SKY.b) } as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)
/** 两个数的哈希，落在 [0, 1) */
function hash(a: number, b: number): number {
  return fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453)
}

/** 地面的材质 */
const MAT = {
  soil: 0,
  pave: 1,
  groove: 2,
  spikes: 3,
  pit: 4,
  socket: 5,
  wall: 6,
  pyramid: 7,
  stair: 8,
  altar: 9,
  head: 10,
  root: 11,
  shrine: 12,
  chute: 13,
  door: 14,
  gold: 15,
  rail: 16,
} as const

/** 画地面与树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: TempleConfig
  readonly plan: TemplePlan
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type PaintLayer = 'ground' | 'canopy'

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

const PPU: Record<PaintLayer, number> = { ground: GROUND_PPU, canopy: CANOPY_PPU }

/** 一层贴图的大小，像素：铺满方框 */
export function textureSize(layer: PaintLayer): { w: number; h: number } {
  return { w: Math.round(FRAME_U * PPU[layer]), h: Math.round(FRAME_U * PPU[layer]) }
}

/** 金字塔的尺寸，本地坐标：最上一层台在 a = top 之后，神殿的正面在 a = shrine，台阶从 a = foot 起；每层台高多少米 */
export interface Pyramid {
  readonly foot: number
  readonly top: number
  readonly shrine: number
  readonly topM: number
}

export function pyramidOf(cfg: TempleConfig, c: Court): Pyramid {
  const p = cfg.pyramid
  const top = c.front + (p.tiers - 1) * p.tierU
  return { foot: c.front - p.stairOutU, top, shrine: top + p.tierU + 0.4, topM: p.tiers * p.tierM }
}

/** 金字塔第 k 层台两侧的半宽（格） */
function tierHalf(cfg: TempleConfig, c: Court, k: number): number {
  return c.half + cfg.walls.thickU + PYRAMID_WIDE_U - k * cfg.pyramid.tierU * PYRAMID_STEP_IN
}

/** 金字塔在本地 (a, b) 处的台高（米）：最高的那一层罩住它就是那一层的高，台子外为 −1 */
function tierAt(cfg: TempleConfig, c: Court, a: number, b: number): number {
  const p = cfg.pyramid
  for (let k = p.tiers - 1; k >= 0; k--) if (a >= c.front + k * p.tierU && Math.abs(b) <= tierHalf(cfg, c, k)) return (k + 1) * p.tierM
  return -1
}

/** 滚石的斜槽在本地 a 处的槽底多高（米）：从槽口那一层台往下斜到底座，槽口往里是一小块平台 */
export function chuteM(cfg: TempleConfig, c: Court, top: number, a: number): number {
  const hTop = Math.max(0, tierAt(cfg, c, top, 0))
  if (a <= c.front) return 0
  if (a >= top) return hTop
  return (hTop * (a - c.front)) / (top - c.front)
}

/** 一处地面：高（米）、材质、材质里的两个坐标与编号；一处只算一次，接着取颜色 */
interface Geo {
  h: number
  mat: number
  u: number
  v: number
  id: number
  /** 金字塔、墙这类砌体的顶：画立面时按它出立面 */
  solid: boolean
  /** 离这一层台、这道墙的外沿多远（格）：沿口画一道压檐 */
  e: number
}

/** 一条拱进前庭的树根：本地坐标的折线（格）与粗细 */
interface RootLine {
  readonly pts: readonly Local[]
  readonly w: number
}

/** 画之前先算一次的东西 */
export interface Prepared {
  /** 丛林边：b 从 −JUNGLE_B 起每 0.05 格一个值 */
  readonly jungle: Float32Array
  readonly roots: readonly RootLine[]
  /** 墙头的豁口：哪一侧（±1）、本地 a */
  readonly notches: readonly { readonly side: number; readonly a: number }[]
  readonly cracks: readonly Local[]
  /** 祭坛旁散落的金色祭器：本地坐标、半径（格）、样子 */
  readonly gold: readonly { readonly a: number; readonly b: number; readonly r: number; readonly kind: number }[]
  /** 格子上的高、模糊过的高、地形挡掉的阳光、树冠挡掉的阳光；格点 (i, j) 在 ((i + 0.5)·GRID_U, (j + 0.5)·GRID_U) */
  readonly n: number
  readonly height: Float32Array
  readonly blur: Float32Array
  readonly shade: Float32Array
  readonly canopy: Float32Array
  /** 每棵树：种类（0 阔叶、1 棕榈、2 开花的树）与叶簇 */
  readonly kinds: Uint8Array
  readonly crowns: readonly (readonly Clump[])[]
  /** 树冠按 4 格的桶分好 */
  readonly buckets: Map<number, number[]>
  /** 叶团：一团团小叶簇铺在叶簇的圆顶上，按 1 格的桶分好 */
  readonly leaves: Leaves
}

/** 叶团按列存：圆心（格）、顶高（米）、半径（格），属于哪棵树、它所在叶簇的圆心与半径；按 1 格的桶分好，start[i]..start[i+1] 是第 i 桶在 items 里的那一段 */
interface Leaves {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  readonly r: Float32Array
  readonly tree: Int32Array
  readonly cx: Float32Array
  readonly cy: Float32Array
  readonly cr: Float32Array
  readonly start: Int32Array
  readonly items: Int32Array
}

/** 叶团的桶：方框外多铺这么多格 */
const LEAF_PAD = 4
const LEAF_COLS = FRAME_U + LEAF_PAD * 2

function leafCell(x: number, y: number): number {
  const i = Math.floor(x) + LEAF_PAD
  const j = Math.floor(y) + LEAF_PAD
  if (i < 0 || j < 0 || i >= LEAF_COLS || j >= LEAF_COLS) return -1
  return j * LEAF_COLS + i
}

/** 把每个叶簇铺满一团团小叶簇：越往叶簇边上越低，团与团之间留出暗缝 */
function leavesOf(kinds: Uint8Array, crowns: readonly (readonly Clump[])[]): Leaves {
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  const rs: number[] = []
  const ts: number[] = []
  const cxs: number[] = []
  const cys: number[] = []
  const crs: number[] = []
  crowns.forEach((list, k) => {
    if (kinds[k] === 1) return
    list.forEach((cl, ci) => {
      const n = Math.ceil(((cl.r / 0.3) ** 2) * 1.5)
      for (let i = 0; i < n; i++) {
        const h1 = hash(k * 17.3 + ci, i * 1.7)
        const h2 = hash(k * 5.1 + ci * 3.3, i * 0.9 + 11)
        const ang = i * 2.39996 + h1
        const rho = Math.sqrt((i + 0.5) / n) * cl.r * 0.92
        const r = 0.24 + 0.14 * h2
        xs.push(cl.x + Math.cos(ang) * rho)
        ys.push(cl.y + Math.sin(ang) * rho)
        zs.push(cl.top - ((rho / cl.r) ** 2) * cl.r * 1.4 - h1 * 0.25)
        rs.push(r)
        ts.push(k)
        cxs.push(cl.x)
        cys.push(cl.y)
        crs.push(cl.r)
      }
    })
  })
  const n = xs.length
  const counts = new Int32Array(LEAF_COLS * LEAF_COLS + 1)
  const cellsOf = (i: number, f: (c: number) => void): void => {
    for (let y = Math.floor(ys[i]! - rs[i]!); y <= Math.floor(ys[i]! + rs[i]!); y++) {
      for (let x = Math.floor(xs[i]! - rs[i]!); x <= Math.floor(xs[i]! + rs[i]!); x++) {
        const c = leafCell(x + 0.5, y + 0.5)
        if (c >= 0) f(c)
      }
    }
  }
  for (let i = 0; i < n; i++) cellsOf(i, (c) => counts[c + 1]!++)
  for (let c = 0; c < LEAF_COLS * LEAF_COLS; c++) counts[c + 1]! += counts[c]!
  const start = Int32Array.from(counts)
  const fill = Int32Array.from(counts)
  const items = new Int32Array(counts[LEAF_COLS * LEAF_COLS]!)
  for (let i = 0; i < n; i++) cellsOf(i, (c) => (items[fill[c]!++] = i))
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs), r: Float32Array.from(rs), tree: Int32Array.from(ts), cx: Float32Array.from(cxs), cy: Float32Array.from(cys), cr: Float32Array.from(crs), start, items }
}

/** 一团叶簇：圆心、半径（格）与顶高（米） */
interface Clump {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly top: number
}

const JUNGLE_B = 40
const JUNGLE_STEP = 0.05

function jungleAt(P: Prepared, b: number): number {
  const u = Math.min(P.jungle.length - 1.001, Math.max(0, (b + JUNGLE_B) / JUNGLE_STEP))
  const i = Math.floor(u)
  return P.jungle[i]! + (P.jungle[i + 1]! - P.jungle[i]!) * (u - i)
}

/** 本地 (a, b) 在前庭里多深（格）：同 layout 的 courtDepth，丛林边查表 */
function depthIn(P: Prepared, c: Court, a: number, b: number): number {
  const front = c.front - a
  const side = c.half - Math.abs(b)
  const jungle = a + jungleAt(P, b)
  const r = c.corner
  let corner = Infinity
  if (side < r && jungle < r) corner = r - Math.hypot(r - side, r - jungle)
  return Math.min(front, side, jungle, corner)
}

/** 点到折线的距离（格），顺带写下最近处沿线走了多远 */
const ALONG = { t: 0 }
function lineDist(pts: readonly Local[], a: number, b: number): number {
  let best = Infinity
  let acc = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]!
    const q = pts[i + 1]!
    const ea = q.a - p.a
    const eb = q.b - p.b
    const l2 = ea * ea + eb * eb || 1e-9
    const t = clamp01(((a - p.a) * ea + (b - p.b) * eb) / l2)
    const d = Math.hypot(a - p.a - ea * t, b - p.b - eb * t)
    const len = Math.sqrt(l2)
    if (d < best) {
      best = d
      ALONG.t = acc + t * len
    }
    acc += len
  }
  return best
}

/** 一块石板：行与列的编号、离石板的边多远（格）、石板的中心（本地，格）；行宽与板长都参差 */
const SLAB = { row: 0, col: 0, edge: 0, ca: 0, cb: 0 }
function slabAt(a: number, b: number, seed: number): void {
  // 行：宽度在 0.8 到 1.25 倍之间参差，行线按累加的宽度定；先按平均行宽猜一行，再往两边挪对
  const rowEdge = (k: number): number => k * ROW_U + (hash(k, seed + 1) - 0.5) * ROW_U * 0.4
  let row = Math.floor((a + 200) / ROW_U)
  while (a + 200 < rowEdge(row)) row--
  while (a + 200 >= rowEdge(row + 1)) row++
  const a0 = rowEdge(row) - 200
  const a1 = rowEdge(row + 1) - 200
  const shift = hash(row, seed) * SLAB_U
  const bb = b + 200 + shift
  const k = Math.floor(bb / SLAB_U)
  const cut = (j: number): number => j * SLAB_U + (hash(row * 7.1 + j, seed + 3) - 0.5) * SLAB_U * 0.9
  let col = k
  while (bb < cut(col)) col--
  while (bb >= cut(col + 1)) col++
  const b0 = cut(col)
  const b1 = cut(col + 1)
  SLAB.row = row
  SLAB.col = col
  SLAB.edge = Math.min(a - a0, a1 - a, bb - b0, b1 - bb)
  SLAB.ca = (a0 + a1) / 2
  SLAB.cb = (b0 + b1) / 2 - 200 - shift
}

/** 本地 (a, b) 处的地面：一样一样往下找，先找到的是它 */
function geoAt(sc: PaintScene, P: Prepared, a: number, b: number, g: Geo): Geo {
  const { cfg, plan } = sc
  const c = plan.court
  const py = pyramidOf(cfg, c)
  const seed = plan.seed
  g.solid = false
  g.u = 0
  g.v = 0
  g.id = 0
  g.e = 9
  const ab = Math.abs(b)
  const stairHalf = cfg.pyramid.stairU / 2
  // 台阶：从前庭里的台阶脚一级级登到神殿门口，两侧是斜着的扶栏，扶栏脚下各一个蛇头
  if (ab < stairHalf && a >= py.foot && a < py.shrine) {
    const run = py.shrine - py.foot
    const t = (a - py.foot) / run
    if (ab > stairHalf - RAIL_U) {
      g.h = 0.45 + t * (py.topM - 0.45) + RAIL_M
      g.mat = MAT.rail
      g.u = t
      g.v = (ab - (stairHalf - RAIL_U)) / RAIL_U
      g.solid = true
      return g
    }
    const n = Math.round(py.topM / STEP_M)
    const k = Math.min(n - 1, Math.floor(t * n))
    g.h = ((k + 1) * py.topM) / n
    g.mat = MAT.stair
    g.u = t * n - k
    g.v = b
    g.id = k
    g.solid = true
    return g
  }
  // 斜槽：从金字塔第三层台斜下来，接着地上的石槽
  for (const t of plan.traps) {
    if (t.kind !== 'boulder') continue
    const d = Math.abs(b - t.b)
    const half = cfg.boulder.grooveU / 2
    if (d < half + 0.35 && a >= c.front && a < t.top + 1.2) {
      const base = chuteM(cfg, c, t.top, a)
      if (d >= half) {
        g.h = base + 0.45 + 0.1 * smooth(t.top, t.top + 1.2, a)
        g.mat = MAT.rail
        g.u = (a - c.front) / (t.top - c.front)
        g.v = (d - half) / 0.35
        g.solid = true
        return g
      }
      g.h = base
      g.mat = MAT.chute
      g.u = a
      g.v = d / half
      g.solid = true
      return g
    }
  }
  // 神殿：一间石屋压在塔顶，正面开一道黑洞洞的门，屋顶上竖着镂空的屋脊饰
  if (a >= py.shrine && a < py.shrine + SHRINE_DEEP_U && ab < SHRINE_HALF_U) {
    g.solid = true
    if (ab < cfg.pyramid.doorU / 2 && a < py.shrine + 1.5) {
      g.h = py.topM + 0.05
      g.mat = MAT.door
      g.u = (a - py.shrine) / 1.5
      g.v = ab / (cfg.pyramid.doorU / 2)
      return g
    }
    const comb = a > py.shrine + 1.7 && a < py.shrine + 2.5 && ab < SHRINE_HALF_U - 0.6
    g.h = py.topM + SHRINE_M + (comb ? 1.3 * (0.6 + 0.4 * smooth(SHRINE_HALF_U - 0.6, 0, ab)) : 0)
    g.mat = MAT.shrine
    g.u = a - py.shrine
    g.v = b
    g.id = comb ? 1 : 0
    return g
  }
  // 金字塔的台
  if (a >= c.front) {
    const h = tierAt(cfg, c, a, b)
    if (h > 0) {
      const k = Math.round(h / cfg.pyramid.tierM) - 1
      g.e = Math.min(a - (c.front + k * cfg.pyramid.tierU), tierHalf(cfg, c, k) - ab)
      g.h = h - 0.06 * smooth(0.12, 0, g.e)
      g.mat = MAT.pyramid
      g.u = a
      g.v = b
      g.id = Math.round(h / cfg.pyramid.tierM)
      g.solid = true
      return g
    }
    g.h = 0.2
    g.mat = MAT.soil
    return g
  }
  // 两侧的墙：从金字塔一直砌到丛林里，墙头有几处塌下来的豁口
  const wallTail = -(c.back + c.jungle + WALL_TAIL_U)
  if (ab >= c.half && ab <= c.half + cfg.walls.thickU && a >= wallTail + (hash(Math.sign(b), seed) - 0.5) * 1.5) {
    const side = Math.sign(b)
    let h = cfg.walls.heightM
    for (const n of P.notches) if (n.side === side) h -= 1.3 * smooth(1.3, 0.7, Math.abs(a - n.a))
    h -= 1.4 * smooth(wallTail + 2.5, wallTail, a) * (0.6 + 0.4 * valueNoise(a * 1.7, b, seed + 31))
    g.h = h
    g.mat = MAT.wall
    g.u = a
    g.v = ab - c.half
    g.e = Math.min(g.v, cfg.walls.thickU - g.v)
    g.solid = true
    return g
  }
  // 兽头：从墙面伸进前庭
  for (const t of plan.traps) {
    if (t.kind !== 'darts') continue
    const r = snoutRect(cfg, c, t)
    const inward = t.side * c.half - b
    const u = inward * t.side
    const v = a - t.a
    if (rectSd(r, a, b) <= 0 && u >= -0.01) {
      const s = cfg.walls.snoutU
      const t2 = u / s
      const w = HEAD_HALF_U * (1 - 0.32 * smooth(0.25, 1, t2))
      if (Math.abs(v) > w) break
      const across = v / w
      const ear = t2 < 0.22 && Math.abs(across) > 0.62 ? 0.25 * smooth(0.62, 0.8, Math.abs(across)) : 0
      g.h = 1.8 - 0.55 * t2 ** 1.5 + 0.16 * Math.cos(across * 1.4) + ear
      g.mat = MAT.head
      g.u = t2
      g.v = across
      g.solid = true
      return g
    }
  }
  const depth = depthIn(P, c, a, b)
  if (depth < 0) {
    // 丛林里的地：比前庭略高，起伏不平；石槽一直通进丛林里
    g.h = 0.15 + 0.2 * smooth(0, 2, -depth) + 0.12 * (valueNoise(a * 0.9, b * 0.9, seed + 41) - 0.5)
    g.mat = MAT.soil
    for (const t of plan.traps) {
      if (t.kind !== 'boulder') continue
      const d = Math.abs(b - t.b) / (cfg.boulder.grooveU / 2)
      if (d < 1.15) {
        g.h = Math.min(g.h, -0.4 * (1 - d * d) - 0.25 * smooth(0, 3, -depth))
        g.mat = MAT.groove
        g.u = a
        g.v = d
      }
    }
    return g
  }
  // 祭坛
  const sdAltar = altarSd(plan.altar, a, b)
  if (sdAltar < 0.06) {
    const al = plan.altar
    const cs = Math.cos(al.turn)
    const sn = Math.sin(al.turn)
    g.h = cfg.altar.heightM * smooth(0.06, -0.08, sdAltar) * (0.92 + 0.08 * valueNoise(a * 3, b * 3, seed + 51))
    g.mat = MAT.altar
    g.u = ((a - al.a) * cs + (b - al.b) * sn) / al.hl
    g.v = (-(a - al.a) * sn + (b - al.b) * cs) / al.hw
    g.solid = true
    return g
  }
  // 散落的金色祭器
  for (const q of P.gold) {
    const d = Math.hypot(a - q.a, b - q.b)
    if (d < q.r) {
      g.h = 0.12 * Math.sqrt(1 - (d / q.r) ** 2)
      g.mat = MAT.gold
      g.u = (a - q.a) / q.r
      g.v = (b - q.b) / q.r
      g.id = q.kind
      return g
    }
  }
  // 机关的占地：压板的槽、石槽、刺阵的带孔石板、陷坑的翻板
  for (let k = 0; k < plan.traps.length; k++) {
    const t: Trap = plan.traps[k]!
    const pr = plateRect(cfg, t.plate)
    const sp = rectSd(pr, a, b)
    if (sp < 0.07) {
      g.h = -0.06
      g.mat = MAT.socket
      g.u = sp
      g.id = k
      return g
    }
    if (t.kind === 'boulder') {
      const half = cfg.boulder.grooveU / 2
      const d = Math.abs(b - t.b)
      if (d < half) {
        const x = d / half
        g.h = -0.38 * (1 - x ** 6) - 0.04
        g.mat = MAT.groove
        g.u = a
        g.v = x
        return g
      }
    }
    if (t.kind === 'spikes' || t.kind === 'pit') {
      const sd = rectSd(t.rect, a, b)
      if (sd < 0) {
        g.h = -0.02
        g.mat = t.kind === 'spikes' ? MAT.spikes : MAT.pit
        g.u = a - t.rect.a0
        g.v = b - t.rect.b0
        g.id = k
        return g
      }
    }
  }
  // 石板地：一行行错缝铺的石板，被树根拱得东翘西翘；树根在石板上爬
  for (const r of P.roots) {
    const d = lineDist(r.pts, a, b)
    const w = r.w * (1 - 0.55 * clamp01(ALONG.t / 7))
    if (d < w) {
      g.h = 0.3 * w + 0.12 * Math.sqrt(1 - (d / w) ** 2) * w * 3
      g.mat = MAT.root
      g.u = ALONG.t
      g.v = d / w
      return g
    }
  }
  slabAt(a, b, seed)
  // 林缘的石板被丛林吞掉了一些：越靠林子缺得越多，缺了的地方露出土与林下的叶子
  const jd = a + jungleAt(P, b)
  if (jd < 4) {
    const lost = 0.85 * (1 - smooth(0, 2.2, depth))
    if (hash(SLAB.row * 5.3 + SLAB.col, seed + 77) < lost) {
      g.h = -0.04
      g.mat = MAT.soil
      return g
    }
  }
  let heave = 0
  for (const r of P.roots) heave = Math.max(heave, Math.exp(-(lineDist(r.pts, SLAB.ca, SLAB.cb) ** 2) / 1.2))
  for (const k of P.cracks) heave = Math.max(heave, 0.6 * Math.exp(-((SLAB.ca - k.a) ** 2 + (SLAB.cb - k.b) ** 2) / 1.5))
  const hs = hash(SLAB.row * 3.7 + SLAB.col, seed + 9)
  const tiltA = (hash(SLAB.row + 0.31, SLAB.col + seed) - 0.5) * (0.025 + 0.16 * heave)
  const tiltB = (hash(SLAB.col + 0.77, SLAB.row + seed) - 0.5) * (0.025 + 0.16 * heave)
  const bevel = smooth(0.12, 0, SLAB.edge) * 0.03
  g.h = (hs - 0.5) * 0.03 + heave * 0.08 + tiltA * (a - SLAB.ca) + tiltB * (b - SLAB.cb) - bevel - (SLAB.edge < JOINT_U ? 0.04 : 0)
  g.mat = MAT.pave
  g.u = SLAB.edge
  g.v = heave
  g.id = SLAB.row * 131 + SLAB.col
  return g
}

/** 地图坐标 (x, y)（格）处的地面 */
const LOC: Local = { a: 0, b: 0 }
function geoMap(sc: PaintScene, P: Prepared, x: number, y: number, g: Geo): Geo {
  toLocal(sc.plan.frame, x, y, LOC)
  return geoAt(sc, P, LOC.a, LOC.b, g)
}

function gridAt(P: Prepared, a: Float32Array, x: number, y: number): number {
  const u = Math.min(P.n - 1.001, Math.max(0, x / GRID_U - 0.5))
  const v = Math.min(P.n - 1.001, Math.max(0, y / GRID_U - 0.5))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fx = u - i
  const fy = v - j
  const k = j * P.n + i
  const p = a[k]!
  const q = a[k + 1]!
  const r = a[k + P.n]!
  const s = a[k + P.n + 1]!
  return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy
}

/** 一棵阔叶大树的树冠由几团叶簇叠成：中间一团最高，外圈一团团低一些 */
function clumpsOf(x: number, y: number, r: number, h: number, k: number): Clump[] {
  const out: Clump[] = [{ x, y, r: r * 0.55, top: h }]
  const n = 7 + Math.floor(r * 2.5)
  for (let i = 0; i < n; i++) {
    const h1 = hash(k * 1.37, i * 2.11)
    const h2 = hash(k * 3.91, i * 0.73 + 5)
    const ang = i * 2.39996 + h1 * 0.8
    const rr = r * (0.3 + 0.18 * h2)
    const dist = (r - rr) * (0.5 + 0.5 * Math.sqrt(h1))
    out.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, r: rr, top: h * (0.9 - 0.12 * (dist / r)) })
  }
  return out
}

const BUCKET_U = 4

function bucketKey(x: number, y: number): number {
  return (Math.floor(y / BUCKET_U) + 4) * 64 + Math.floor(x / BUCKET_U) + 4
}

export function prepare(sc: PaintScene): Prepared {
  const { cfg, plan } = sc
  const c = plan.court
  const seed = plan.seed
  const nj = Math.ceil((JUNGLE_B * 2) / JUNGLE_STEP) + 1
  const jungle = new Float32Array(nj)
  for (let i = 0; i < nj; i++) jungle[i] = jungleEdge(c, -JUNGLE_B + i * JUNGLE_STEP)
  const roots: RootLine[] = plan.roots.map((r) => {
    const A = toLocal(plan.frame, r.from.x, r.from.y, { a: 0, b: 0 })
    const B = toLocal(plan.frame, r.to.x, r.to.y, { a: 0, b: 0 })
    const pts: Local[] = []
    const da = B.a - A.a
    const db = B.b - A.b
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      const wob = Math.sin(t * Math.PI) * r.bend + 0.25 * Math.sin(t * 9 + r.bend * 5) * t
      pts.push({ a: A.a + da * t - db * 0.15 * wob, b: A.b + db * t + da * 0.15 * wob })
    }
    return { pts, w: r.w }
  })
  const L: Local = { a: 0, b: 0 }
  const notches = plan.marks.wall.map((m) => {
    toLocal(plan.frame, m.x / UNIT, m.y / UNIT, L)
    return { side: Math.sign(L.b), a: L.a }
  })
  const cracks = plan.cracks.map((k) => ({ a: k.a, b: k.b }))
  const al = plan.altar
  const gold: { a: number; b: number; r: number; kind: number }[] = []
  for (let i = 0; i < 4; i++) {
    const ang = hash(i, seed + 61) * Math.PI * 2
    const d = Math.max(al.hl, al.hw) + 0.4 + hash(i, seed + 67) * 1.1
    const a = al.a + Math.cos(ang) * d
    const b = al.b + Math.sin(ang) * d
    if (a > c.front - cfg.pyramid.stairOutU - 0.3 || Math.abs(b) < cfg.pyramid.stairU / 2 + 0.2) continue
    gold.push({ a, b, r: 0.16 + 0.1 * hash(i, seed + 71), kind: i % 3 })
  }
  const n = Math.round(FRAME_U / GRID_U)
  const P: Prepared = {
    jungle,
    roots,
    notches,
    cracks,
    gold,
    n,
    height: new Float32Array(n * n),
    blur: new Float32Array(n * n),
    shade: new Float32Array(n * n),
    canopy: new Float32Array(n * n),
    kinds: new Uint8Array(plan.trees.length),
    crowns: [],
    buckets: new Map(),
    leaves: leavesOf(new Uint8Array(0), []),
  }
  const g: Geo = { h: 0, mat: 0, u: 0, v: 0, id: 0, solid: false, e: 9 }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) P.height[j * n + i] = geoMap(sc, P, (i + 0.5) * GRID_U, (j + 0.5) * GRID_U, g).h
  // 模糊过的高：比四周低的窝里暗一点
  const tmp = new Float32Array(n * n)
  const R = 4
  for (let j = 0; j < n; j++) {
    let acc = 0
    for (let i = -R; i <= R; i++) acc += P.height[j * n + Math.min(n - 1, Math.max(0, i))]!
    for (let i = 0; i < n; i++) {
      tmp[j * n + i] = acc / (2 * R + 1)
      acc += P.height[j * n + Math.min(n - 1, i + R + 1)]! - P.height[j * n + Math.max(0, i - R)]!
    }
  }
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let j = -R; j <= R; j++) acc += tmp[Math.min(n - 1, Math.max(0, j)) * n + i]!
    for (let j = 0; j < n; j++) {
      P.blur[j * n + i] = acc / (2 * R + 1)
      acc += tmp[Math.min(n - 1, j + R + 1) * n + i]! - tmp[Math.max(0, j - R) * n + i]!
    }
  }
  // 地形挡掉的阳光：往太阳那边找比光线高出来的地方；影子按正午收短
  const rise = (LZ / LXY) * cfg.meterPerU / SHADOW_SCALE
  let peak = -Infinity
  for (const z of P.height) peak = Math.max(peak, z)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * GRID_U
      const y = (j + 0.5) * GRID_U
      const z = P.height[j * n + i]!
      const reach = (peak - z) / rise
      let over = 0
      for (let st = GRID_U; st <= reach; st += GRID_U) over = Math.max(over, gridAt(P, P.height, x + TO_SUN.x * st, y + TO_SUN.y * st) - z - st * rise)
      P.shade[j * n + i] = smooth(0.02, 0.15, over)
    }
  }
  // 树：大多是阔叶的大树，夹着几棵棕榈与一两棵开花的树
  const crowns: Clump[][] = []
  plan.trees.forEach((t, k) => {
    const hk = hash(k, seed + 81)
    const kind = hk < 0.2 ? 1 : hk > 0.95 ? 2 : 0
    P.kinds[k] = kind
    crowns.push(kind === 1 ? [{ x: t.x, y: t.y, r: t.r * 0.8, top: t.h * 0.8 }] : clumpsOf(t.x, t.y, t.r, t.h, k))
    const r = t.r * (kind === 1 ? 0.8 : 1)
    for (let by = Math.floor((t.y - r) / BUCKET_U); by <= Math.floor((t.y + r) / BUCKET_U); by++) {
      for (let bx = Math.floor((t.x - r) / BUCKET_U); bx <= Math.floor((t.x + r) / BUCKET_U); bx++) {
        const key = (by + 4) * 64 + bx + 4
        let list = P.buckets.get(key)
        if (!list) P.buckets.set(key, (list = []))
        list.push(k)
      }
    }
  })
  ;(P as { crowns: readonly (readonly Clump[])[] }).crowns = crowns
  ;(P as { leaves: Leaves }).leaves = leavesOf(P.kinds, crowns)
  // 树冠投在地上的影子：顺着背光的方向挪开，边是软的
  const sh = { x: -TO_SUN.x, y: -TO_SUN.y }
  const shadows = plan.trees.map((t, k) => {
    const off = Math.min(TREE_SHADOW_U, t.h * 0.2)
    return { x: t.x + sh.x * off, y: t.y + sh.y * off, r: t.r * (P.kinds[k] === 1 ? 0.7 : 0.92) }
  })
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * GRID_U
      const y = (j + 0.5) * GRID_U
      let s = 0
      for (const q of shadows) {
        const d = Math.hypot(x - q.x, y - q.y)
        if (d < q.r + TREE_SOFT_U) s = Math.max(s, smooth(q.r + TREE_SOFT_U, q.r - TREE_SOFT_U, d))
      }
      P.canopy[j * n + i] = s
    }
  }
  return P
}

/** 一处地面的本色（0–255，线性的反照率），写进 C */
interface Rgb {
  r: number
  g: number
  b: number
}

function set(C: Rgb, r: number, g: number, b: number): void {
  C.r = r
  C.g = g
  C.b = b
}

function mixInto(C: Rgb, r: number, g: number, b: number, t: number): void {
  C.r += (r - C.r) * t
  C.g += (g - C.g) * t
  C.b += (b - C.b) * t
}

function scale(C: Rgb, k: number): void {
  C.r *= k
  C.g *= k
  C.b *= k
}

/** 苔藓：石头上一团团的，背阴潮湿处、缝里、靠丛林与墙脚的地方多 */
function moss(C: Rgb, x: number, y: number, seed: number, amount: number): void {
  if (amount <= 0) return
  const n = fbm(x * 1.1, y * 1.1, seed + 101, 4)
  const fine = valueNoise(x * 9, y * 9, seed + 103)
  const m = smooth(0.8 - 0.32 * amount, 0.87 - 0.32 * amount, n + 0.1 * (fine - 0.5))
  if (m <= 0) return
  const deep = valueNoise(x * 2.3, y * 2.3, seed + 107)
  mixInto(C, 74 + 34 * deep, 96 + 30 * deep, 58 + 6 * deep, m * (0.7 + 0.3 * fine))
}

/** 地衣：淡黄白与墨黑的小斑 */
function lichen(C: Rgb, x: number, y: number, seed: number): void {
  const q = cellNearest(x * 3.1, y * 3.1, seed + 111)
  const d = Math.hypot(q.dx, q.dy)
  if (q.h > 0.82 && d < 0.22 + 0.15 * q.h) mixInto(C, 214, 210, 180, 0.55 * smooth(0.37, 0.15, d))
  else if (q.h < 0.1 && d < 0.18) mixInto(C, 46, 44, 38, 0.6 * smooth(0.18, 0.05, d))
}

/** 一块块砌石：顺着 s 一层层、顺着 t 错缝，石块里的坐标 */
function blockJoint(s: number, t: number, course: number, len: number, seed: number): { edge: number; id: number } {
  const row = Math.floor(s / course)
  const tt = t + hash(row, seed) * len
  const col = Math.floor(tt / len)
  const ds = s - row * course
  const dt = tt - col * len
  return { edge: Math.min(ds, course - ds, dt, len - dt), id: row * 97 + col }
}

/** 一种机关的符号：压板上、出口上与机关盘里都刻这个；(u, v) 在 [−1, 1] 的方块里，返回刻痕的深浅 0–1 */
export function glyphInk(kind: Trap['kind'], u: number, v: number): number {
  const w = 0.13
  const ring = (cx: number, cy: number, r: number): number => smooth(w, w * 0.4, Math.abs(Math.hypot(u - cx, v - cy) - r))
  const dot = (cx: number, cy: number, r: number): number => smooth(r, r * 0.6, Math.hypot(u - cx, v - cy))
  const seg = (ax: number, ay: number, bx: number, by: number): number => {
    const ex = bx - ax
    const ey = by - ay
    const t = clamp01(((u - ax) * ex + (v - ay) * ey) / (ex * ex + ey * ey))
    return smooth(w, w * 0.4, Math.hypot(u - ax - ex * t, v - ay - ey * t))
  }
  switch (kind) {
    case 'darts':
      // 兽面：一圈脸、两只圆眼、张开的嘴里一排牙
      return Math.max(ring(0, 0, 0.78), dot(-0.32, -0.2, 0.17), dot(0.32, -0.2, 0.17), seg(-0.4, 0.3, 0.4, 0.3), seg(-0.25, 0.3, -0.25, 0.48), seg(0, 0.3, 0, 0.5), seg(0.25, 0.3, 0.25, 0.48))
    case 'spikes':
      // 三根往上的刺
      return Math.max(seg(-0.7, 0.6, -0.42, -0.35), seg(-0.42, -0.35, -0.14, 0.6), seg(-0.28, 0.6, 0, -0.7), seg(0, -0.7, 0.28, 0.6), seg(0.14, 0.6, 0.42, -0.35), seg(0.42, -0.35, 0.7, 0.6), seg(-0.75, 0.62, 0.75, 0.62))
    case 'boulder': {
      // 一个圆里卷着一道螺旋
      const r = Math.hypot(u, v)
      const ang = Math.atan2(v, u)
      const sp = Math.abs(fract((r * 2.4 - ang / (Math.PI * 2)) + 0.5) - 0.5)
      return Math.max(ring(0, 0, 0.78), r < 0.62 ? smooth(0.16, 0.06, sp) : 0)
    }
    case 'pit': {
      // 一个方框套着一个方框，正中一个黑点：往下陷的坑
      const box = (r: number): number => smooth(w, w * 0.4, Math.abs(Math.max(Math.abs(u), Math.abs(v)) - r))
      return Math.max(box(0.75), box(0.42), dot(0, 0, 0.14))
    }
  }
}

/**
 * 一处地面的本色：铺地的石板偏粉的砂岩，缝里与背阴处长着青苔；石槽磨得光；刺阵的石板发黑、一排排小孔；翻板四周一圈细缝；
 * 墙与金字塔是一块块砌起来的灰白石头；丛林里是深色的土与落叶
 */
function albedo(sc: PaintScene, P: Prepared, g: Geo, x: number, y: number, a: number, b: number, C: Rgb): void {
  const seed = sc.plan.seed
  const c = sc.plan.court
  const grain = 0.9 + 0.2 * valueNoise(x * 13, y * 13, seed + 5)
  const blot = fbm(x * 0.6, y * 0.6, seed + 7, 3)
  switch (g.mat) {
    case MAT.pave: {
      const hs = hash(g.id, seed + 13)
      // 每块石板的颜色略有不同，有的偏粉、有的偏灰、少数发黄
      set(C, 186 + 22 * (hs - 0.5), 160 + 14 * (hash(g.id, seed + 17) - 0.5), 138 + 16 * (hash(g.id, seed + 19) - 0.5))
      if (hs > 0.84) mixInto(C, 168, 164, 136, 0.55)
      else if (hs < 0.12) mixInto(C, 136, 128, 116, 0.55)
      scale(C, grain * (0.84 + 0.3 * blot) * (0.9 + 0.2 * hash(g.id, seed + 23)))
      // 一些石板裂成了几块
      if (hash(g.id, seed + 27) < 0.12) {
        const e = cellEdge(x * 1.9, y * 1.9, seed + 31)
        if (e < 0.03) mixInto(C, 44, 46, 34, smooth(0.03, 0.008, e))
      }
      // 水渍与风化的深色斑
      mixInto(C, 104, 98, 86, 0.4 * smooth(0.55, 0.8, fbm(x * 1.7, y * 1.7, seed + 23, 3)))
      lichen(C, x, y, seed)
      const toWall = c.half - Math.abs(b)
      const toJungle = a + jungleAt(P, b)
      const wet = smooth(3.5, 0.3, Math.min(toWall, toJungle)) * 0.7 + gridAt(P, P.canopy, x, y) * 0.4 + g.v * 0.5
      moss(C, x, y, seed, wet)
      // 缝里塞满了青苔与泥
      if (g.u < JOINT_U * 1.6) {
        const k = smooth(JOINT_U * 1.6, JOINT_U * 0.5, g.u)
        mixInto(C, 66 + 20 * blot, 72 + 22 * blot, 50, k * 0.75)
      }
      // 树根拱裂的石板：裂纹
      if (g.v > 0.25) {
        const e = cellEdge(x * 1.6, y * 1.6, seed + 29)
        if (e < 0.04) mixInto(C, 40, 36, 30, smooth(0.04, 0.01, e) * smooth(0.25, 0.6, g.v))
      }
      return
    }
    case MAT.groove: {
      // 石槽：被滚石一次次碾过，底磨得光、发浅，顺着槽一道道擦痕
      set(C, 168, 150, 132)
      scale(C, grain * (0.94 + 0.12 * blot))
      const scratch = valueNoise(g.v * 30 + x * 0.1, g.u * 0.6, seed + 37)
      mixInto(C, 206, 190, 168, 0.35 * smooth(0.55, 0.85, scratch) * (1 - g.v))
      mixInto(C, 112, 104, 92, 0.5 * smooth(0.7, 1, g.v))
      moss(C, x, y, seed + 3, 0.25 * smooth(0.6, 1, g.v))
      // 槽沿上一圈刻出的圆纹，跟滚石、压板上的螺旋一样
      if (g.v > 0.93) mixInto(C, 90, 82, 70, 0.6)
      return
    }
    case MAT.spikes: {
      // 刺阵：发黑的玄武岩石板，一排排小孔，孔边被石刺磨亮；石板与石板之间有缝
      const t = sc.plan.traps[g.id]!
      set(C, 92, 90, 84)
      scale(C, grain * (0.9 + 0.2 * blot))
      lichen(C, x, y, seed + 2)
      const pitch = 0.5
      const ou = g.u - Math.floor(g.u / pitch) * pitch - pitch / 2
      const ov = g.v - Math.floor(g.v / pitch) * pitch - pitch / 2
      const d = Math.hypot(ou, ov)
      if (d < 0.15) mixInto(C, 132, 128, 118, smooth(0.15, 0.11, d))
      if (d < 0.1) mixInto(C, 14, 12, 10, smooth(0.1, 0.07, d))
      if (t.kind === 'spikes') {
        const r = t.rect
        const e = Math.min(g.u, r.a1 - r.a0 - g.u, g.v, r.b1 - r.b0 - g.v)
        if (e < 0.06) mixInto(C, 30, 28, 24, smooth(0.06, 0.02, e))
      }
      return
    }
    case MAT.pit: {
      // 翻板：同铺地的石板，四周一圈细缝，正中一道缝把它分成两扇，缝旁两颗铜轴
      const t = sc.plan.traps[g.id]!
      if (t.kind !== 'pit') return
      const r = t.rect
      set(C, 172, 150, 130)
      scale(C, grain * (0.9 + 0.2 * blot))
      lichen(C, x, y, seed + 4)
      moss(C, x, y, seed + 6, 0.2)
      const la = r.a1 - r.a0
      const lb = r.b1 - r.b0
      const e = Math.min(g.u, la - g.u, g.v, lb - g.v)
      const mid = Math.abs(g.v - lb / 2)
      if (e < 0.08) mixInto(C, 24, 20, 16, smooth(0.08, 0.03, e))
      if (mid < 0.05) mixInto(C, 30, 26, 20, smooth(0.05, 0.015, mid))
      for (const s of [0.2, 0.8]) {
        const d = Math.hypot(g.u - la * s, g.v - lb / 2)
        if (d < 0.12) mixInto(C, 120, 86, 50, smooth(0.12, 0.08, d))
      }
      return
    }
    case MAT.socket:
      set(C, 26, 24, 20)
      mixInto(C, 60, 56, 48, smooth(-0.6, 0, g.u) * 0.3)
      return
    case MAT.wall:
    case MAT.pyramid:
    case MAT.shrine:
    case MAT.rail:
    case MAT.stair: {
      // 砌石：灰白偏暖的石块，顶上一层青苔与杂草；金字塔越往上越黑
      const j = g.mat === MAT.wall ? blockJoint(g.u, g.v, 0.75, 1.6, seed + 41) : g.mat === MAT.stair ? blockJoint(g.v, g.u * 3, 1.1, 1.3, seed + 43) : blockJoint(a, b, 0.9, 1.5, seed + 47)
      const hs = hash(j.id, seed + 49)
      set(C, 186 + 18 * (hs - 0.5), 176 + 14 * (hs - 0.5), 160 + 12 * (hs - 0.5))
      scale(C, grain * (0.86 + 0.26 * blot))
      // 雨水顺着石头淌下的黑色水痕
      const streak = valueNoise(x * 0.4 + y * 4, x * 4 - y * 0.4, seed + 51)
      mixInto(C, 74, 74, 66, 0.4 * smooth(0.55, 0.9, fbm(x * 1.3, y * 1.3, seed + 52, 3)) + 0.2 * smooth(0.7, 0.95, streak))
      lichen(C, x, y, seed + 7)
      if (j.edge < 0.05) mixInto(C, 64, 64, 52, smooth(0.05, 0.015, j.edge) * 0.8)
      // 台沿与墙沿一道压檐：外沿亮一道，里面一道暗缝
      if (g.e < 0.32) {
        if (g.e < 0.2) mixInto(C, 214, 206, 188, 0.4 * smooth(0.2, 0.05, g.e))
        else mixInto(C, 60, 58, 48, 0.6 * smooth(0.32, 0.26, g.e) * smooth(0.2, 0.26, g.e))
      }
      moss(C, x, y, seed + 8, g.mat === MAT.wall ? 0.55 : g.mat === MAT.stair ? 0.15 : 0.3 + 0.4 * smooth(0.6, 0, g.e))
      if (g.mat === MAT.shrine && g.id === 1) mixInto(C, 120, 110, 96, 0.4)
      if (g.mat === MAT.rail) {
        // 扶栏上刻着一条蛇的鳞
        const sc2 = valueNoise(g.u * 40, g.v * 3, seed + 53)
        mixInto(C, 110, 112, 92, 0.25 * sc2)
      }
      return
    }
    case MAT.chute: {
      set(C, 150, 140, 126)
      scale(C, grain)
      mixInto(C, 196, 184, 164, 0.4 * (1 - g.v))
      moss(C, x, y, seed + 9, 0.2)
      return
    }
    case MAT.door:
      set(C, 10 + 18 * g.u, 10 + 16 * g.u, 8 + 12 * g.u)
      return
    case MAT.altar: {
      // 祭坛：一整块深色的石头翻倒在地，侧面朝天，雕着一圈兽面与回纹
      set(C, 128, 116, 104)
      scale(C, grain * (0.9 + 0.2 * blot))
      const fret = Math.abs(Math.sin(g.u * 9)) * Math.abs(Math.sin(g.v * 5))
      if (Math.abs(g.u) < 0.8 && Math.abs(g.v) < 0.7) mixInto(C, 78, 70, 62, 0.45 * smooth(0.55, 0.85, fret))
      const ink = glyphInk('darts', g.u * 1.6, g.v * 1.3)
      mixInto(C, 52, 46, 40, 0.6 * ink)
      moss(C, x, y, seed + 10, 0.35)
      return
    }
    case MAT.gold: {
      // 金色的祭器：杯、盘、小像，带一点铜绿
      const r = Math.hypot(g.u, g.v)
      set(C, 236, 186, 72)
      mixInto(C, 255, 236, 160, smooth(0.5, 0.1, Math.hypot(g.u + 0.3, g.v + 0.35)) * 0.8)
      mixInto(C, 150, 96, 36, smooth(0.6, 1, r) * 0.6)
      if (g.id === 1 && r < 0.45) mixInto(C, 120, 78, 30, 0.6)
      mixInto(C, 90, 140, 110, 0.3 * smooth(0.65, 0.9, valueNoise(g.u * 4 + g.id, g.v * 4, seed + 57)))
      return
    }
    case MAT.head: {
      // 兽头：一张美洲豹的脸从墙里探出来，圆眼、宽鼻、张开的嘴里露出尖牙
      set(C, 150, 140, 124)
      scale(C, grain * (0.9 + 0.2 * blot))
      lichen(C, x, y, seed + 11)
      const u = g.u
      const v = g.v
      const eye = Math.min(Math.hypot((u - 0.36) * 1.3, v - 0.4), Math.hypot((u - 0.36) * 1.3, v + 0.4))
      if (eye < 0.2) mixInto(C, 222, 212, 186, smooth(0.2, 0.16, eye))
      if (eye < 0.11) mixInto(C, 22, 18, 14, smooth(0.11, 0.08, eye))
      const brow = Math.abs(u - 0.18)
      if (brow < 0.05 && Math.abs(v) < 0.75) mixInto(C, 86, 78, 66, 0.6)
      // 嘴：前沿一道黑洞，上下各一排白牙
      if (u > 0.78) {
        const mouth = smooth(0.78, 0.86, u) * smooth(0.6, 0.45, Math.abs(v))
        mixInto(C, 16, 12, 10, mouth)
        const tooth = Math.abs(fract(v * 4 + 0.5) - 0.5)
        if (u > 0.8 && u < 0.9 && tooth < 0.18 && Math.abs(v) < 0.55) mixInto(C, 236, 228, 206, 0.9)
      }
      const nose = Math.hypot(u - 0.62, v * 0.8)
      if (nose < 0.14) mixInto(C, 100, 90, 78, 0.6)
      moss(C, x, y, seed + 12, 0.3)
      return
    }
    case MAT.root: {
      // 板根：灰白光滑的树皮，一道道纵纹，背上长着苔
      set(C, 150, 140, 122)
      const fib = valueNoise(g.v * 14, g.u * 1.4, seed + 61)
      scale(C, 0.82 + 0.3 * fib)
      mixInto(C, 96, 84, 66, 0.4 * smooth(0.6, 1, g.v))
      moss(C, x, y, seed + 13, 0.45)
      return
    }
    default: {
      // 丛林里的地：深色的土、厚厚的落叶，夹着蕨
      set(C, 44, 40, 30)
      // 林下一丛丛大叶子的植物：几片长叶从一点放射出去
      const pl = cellNearest(x * 0.9, y * 0.9, seed + 75)
      const pd = Math.hypot(pl.dx, pl.dy) / 0.9
      if (pl.h > 0.25 && pd < 0.75) {
        const ang = Math.atan2(pl.dy, pl.dx) + pl.h * 20
        const n = 5 + Math.floor(pl.h * 4)
        const lu = fract((ang / (Math.PI * 2)) * n)
        const width = 0.45 * Math.sin(Math.min(1, pd / 0.75) * Math.PI)
        if (Math.abs(lu - 0.5) < width) {
          const vein = Math.abs(lu - 0.5) < 0.04 ? 0.8 : 1
          const lit = 0.75 + 0.35 * (pd / 0.75)
          set(C, (40 + 30 * pl.h) * lit * vein, (84 + 40 * pl.h) * lit * vein, (44 + 16 * pl.h) * lit * vein)
          scale(C, grain)
          return
        }
      }
      const q = cellNearest(x * 4, y * 4, seed + 71)
      const leaf = smooth(0.42, 0.2, Math.hypot(q.dx * 1.6, q.dy))
      if (leaf > 0) {
        const tone = q.h
        mixInto(C, 104 + 70 * tone, 78 + 40 * tone, 40 + 20 * tone, leaf * 0.7)
      }
      const fern = fbm(x * 0.8, y * 0.8, seed + 73, 3)
      if (fern > 0.55) {
        const fx = fract(x * 3.5 + Math.sin(y * 2.1) * 0.3)
        mixInto(C, 52, 98, 42, smooth(0.55, 0.62, fern) * (0.6 + 0.4 * smooth(0.5, 0.2, Math.abs(fx - 0.5))))
      }
      scale(C, grain)
      return
    }
  }
}

/** 立面的颜色：砌石一层层的横缝，墙面上雕着一格格回纹，台阶的立面暗一些 */
function faceAlbedo(mat: number, x: number, z: number, seed: number, C: Rgb): void {
  const course = blockJoint(z, x, 0.42, 1.2, seed + 91)
  const hs = hash(course.id, seed + 93)
  set(C, 150 + 18 * (hs - 0.5), 140 + 14 * (hs - 0.5), 124 + 10 * (hs - 0.5))
  if (course.edge < 0.04) mixInto(C, 52, 52, 44, 0.75)
  if (mat === MAT.wall && Math.abs(fract(x / 2.4) - 0.5) < 0.3 && z > 0.8 && z < 2.6) {
    const u = (fract(x / 2.4) - 0.5) / 0.3
    const v = (z - 1.7) / 0.9
    mixInto(C, 74, 68, 58, 0.55 * glyphInk('darts', u, -v))
  }
  if (mat === MAT.stair || mat === MAT.door) scale(C, 0.8)
  moss(C, x, z * 2, seed + 95, 0.35)
}

const SCRATCH_G: Geo = { h: 0, mat: 0, u: 0, v: 0, id: 0, solid: false, e: 9 }

/**
 * 地面：一像素一像素算出地面多高、什么材质，按高度的起伏与太阳打光，挡住阳光的地形与树冠投下影子，树冠的缝里漏下一块块光斑；
 * 砌体朝屏幕下方的那一面按假想的斜俯视画出一截立面
 */
export function paintGround(sc: PaintScene, P: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const face = Math.ceil(FACE_MAX_U * ppu) + 1
  const y0 = rect.y0 - face - 1
  const rows = rect.y1 + 1 - y0
  const cols = w + 2
  const H = new Float32Array(rows * cols)
  const M = new Uint8Array(rows * cols)
  const S = new Uint8Array(rows * cols)
  const G: Geo = SCRATCH_G
  const f = sc.plan.frame
  const L: Local = { a: 0, b: 0 }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (rect.x0 - 1 + i + 0.5) / ppu
      const y = (y0 + j + 0.5) / ppu
      geoMap(sc, P, x, y, G)
      H[j * cols + i] = G.h
      M[j * cols + i] = G.mat
      S[j * cols + i] = G.solid ? 1 : 0
    }
  }
  const mpp = sc.cfg.meterPerU / ppu
  const seed = sc.plan.seed
  const C: Rgb = { r: 0, g: 0, b: 0 }
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const i = px - rect.x0 + 1
      const j = py - y0
      const k = j * cols + i
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const h = H[k]!
      // 立面：往屏幕上方找一处砌体，它的顶比这里高出的够把立面拉到这一像素
      let faceZ = -1
      let faceMat = 0
      let faceTop = 0
      for (let d = 1; d <= face; d++) {
        const kk = (j - d) * cols + i
        if (!S[kk]) continue
        const top = H[kk]!
        const rise = top - h
        if (rise < 0.25) break
        const per = Math.min(FACE_U_PER_M, FACE_MAX_U / top) * ppu
        if (d <= rise * per) {
          faceZ = top - d / per
          faceMat = M[kk]!
          faceTop = top
        }
        break
      }
      if (faceZ >= 0) {
        faceAlbedo(faceMat, x, faceZ, seed, C)
        // 立面朝屏幕下方，背着太阳：只吃天光，越往下越暗，脚下被地面映亮一点
        const lit = AMBIENT * (0.72 + 0.28 * (faceZ / Math.max(0.1, faceTop))) * (1 - 0.5 * gridAt(P, P.canopy, x, y))
        out[o] = C.r * lit * SKY.r * 1.15
        out[o + 1] = C.g * lit * SKY.g * 1.15
        out[o + 2] = C.b * lit * SKY.b * 1.15
        out[o + 3] = 255
        continue
      }
      toLocal(f, x, y, L)
      geoAt(sc, P, L.a, L.b, G)
      albedo(sc, P, G, x, y, L.a, L.b, C)
      const zx = (H[k + 1]! - H[k - 1]!) / (2 * mpp)
      const zy = (H[k + cols]! - H[k - cols]!) / (2 * mpp)
      const nz = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) * nz)
      const cav = clamp01(1 - 1.6 * Math.max(0, gridAt(P, P.blur, x, y) - h))
      // 树冠的影子里漏下一块块光斑
      let canopy = gridAt(P, P.canopy, x, y)
      if (canopy > 0) {
        const fleck = smooth(0.6, 0.68, fbm(x * 0.9 + 3.3, y * 0.9 + 1.7, seed + 201, 3) + 0.08 * valueNoise(x * 6, y * 6, seed + 203))
        canopy *= 1 - 0.85 * fleck
      }
      const terrain = gridAt(P, P.shade, x, y)
      const lightK = (1 - 0.82 * terrain) * (1 - 0.78 * canopy)
      const sky = AMBIENT * cav * (1 - 0.35 * canopy)
      const sun = DIRECT * lambert * lightK
      out[o] = C.r * (sky * SKY.r + sun * SUNLIGHT.r)
      out[o + 1] = C.g * (sky * SKY.g + sun * SUNLIGHT.g)
      out[o + 2] = C.b * (sky * SKY.b + sun * SUNLIGHT.b)
      out[o + 3] = 255
    }
  }
}

/** 树冠的颜色：背阴、向阳；几种树各不相同 */
const LEAF = [
  { dark: [28, 62, 40], lit: [128, 170, 70] },
  { dark: [40, 74, 36], lit: [168, 186, 84] },
  { dark: [58, 50, 40], lit: [236, 128, 70] },
] as const

/**
 * 树冠：阔叶的大树由几团叶簇叠成，每团是一个扁圆顶，叶簇里一片片叶子的明暗；棕榈是一圈放射的羽状叶；开花的树顶上开满橙红的花。
 * 每一点取最高的那个叶簇，按太阳打光，低处被高处的遮着更暗；边上软，带透明度；林缘垂下来的藤蔓也画在这一层
 */
export function paintCanopy(sc: PaintScene, P: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const plan = sc.plan
  const seed = plan.seed
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      let best = -Infinity
      let alpha = 0
      let nx = 0
      let ny = 0
      let tree = -1
      let tex = 1
      for (const k of P.buckets.get(bucketKey(x, y)) ?? []) {
        const t = plan.trees[k]!
        if (P.kinds[k] !== 1) continue
        {
          // 棕榈：一圈放射的羽状叶，叶梢下垂变暗
          const dx = x - t.x
          const dy = y - t.y
          const d = Math.hypot(dx, dy)
          const R = t.r * 0.95
          if (d > R) continue
          const ang = Math.atan2(dy, dx)
          const n = 9
          const u = (ang / (Math.PI * 2)) * n + hash(k, 3)
          const side = Math.abs(fract(u) - 0.5) * 2
          const frond = 1 - side / (0.55 + 0.35 * (1 - d / R))
          const pinna = Math.abs(fract(d * 7 + side * 2) - 0.5)
          if (frond <= 0 || (pinna > 0.36 && d > 0.3)) continue
          const top = t.h * 0.8 * (1 - 0.35 * (d / R) ** 2)
          if (top <= best) continue
          best = top
          alpha = Math.max(alpha, smooth(0, 0.25, frond) * smooth(R, R * 0.85, d))
          nx = (dx / (d || 1)) * 0.6 * (d / R)
          ny = (dy / (d || 1)) * 0.6 * (d / R)
          tree = k
          tex = 0.85 + 0.3 * frond
        }
      }
      // 阔叶树：取罩住这一点最高的那一团小叶簇，法线按叶团的小圆顶与它所在叶簇的大圆顶合起来
      const Lv = P.leaves
      const cell = leafCell(x, y)
      if (cell >= 0) {
        for (let q = Lv.start[cell]!; q < Lv.start[cell + 1]!; q++) {
          const i = Lv.items[q]!
          const dx = x - Lv.x[i]!
          const dy = y - Lv.y[i]!
          const r = Lv.r[i]!
          const d2 = dx * dx + dy * dy
          if (d2 > r * r) continue
          const dome = Math.sqrt(1 - d2 / (r * r))
          const top = Lv.z[i]! + dome * r * 0.9
          if (top <= best) continue
          best = top
          const ex = (x - Lv.cx[i]!) / Lv.cr[i]!
          const ey = (y - Lv.cy[i]!) / Lv.cr[i]!
          nx = (dx / r) * 0.65 + ex * 0.45
          ny = (dy / r) * 0.65 + ey * 0.45
          tree = Lv.tree[i]!
          alpha = Math.max(alpha, smooth(r, r * 0.8, Math.sqrt(d2)))
          // 叶团里一片片叶子：叶与叶之间的暗缝，叶面的亮
          const lf = cellNearest(x * 9, y * 9, seed + tree * 7)
          tex = (0.62 + 0.3 * dome) * (0.82 + 0.3 * smooth(0.55, 0.15, Math.hypot(lf.dx, lf.dy))) + 0.12 * (lf.h - 0.5)
        }
      }
      if (tree < 0 || alpha <= 0) {
        out[o + 3] = 0
        continue
      }
      const kind = P.kinds[tree]!
      const pal = LEAF[kind === 2 ? 2 : kind === 1 ? 1 : 0]!
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))
      const lam = clamp01(nx * LX + ny * LY + nz * LZ)
      const hue = valueNoise(x * 0.25 + tree, y * 0.25, seed + 211)
      const e = clamp01(lam * tex * 1.05)
      let r = pal.dark[0] + (pal.lit[0] - pal.dark[0]) * e
      let g = pal.dark[1] + (pal.lit[1] - pal.dark[1]) * e
      let b = pal.dark[2] + (pal.lit[2] - pal.dark[2]) * e
      // 一树和一树的绿不一样：有的偏黄绿、有的偏蓝绿
      r *= 0.88 + 0.24 * hue
      b *= 1.1 - 0.25 * hue
      // 开花的树：叶簇顶上一团团橙红的花
      if (kind === 2) {
        const fl = valueNoise(x * 6, y * 6, seed + 221)
        if (fl > 0.55) {
          const k2 = smooth(0.55, 0.7, fl) * (0.6 + 0.4 * lam)
          r += (244 - r) * k2
          g += (110 - g) * k2
          b += (60 - b) * k2
        }
      }
      // 低处被高处的叶子遮着：叶团之间的缝、树冠边上暗下去
      const low = smooth(0.2, 2.6, plan.trees[tree]!.h - best)
      r *= 1 - 0.35 * low
      g *= 1 - 0.3 * low
      b *= 1 - 0.3 * low
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = alpha * 255
    }
  }
}

/** 本地长方形的四个角，地图坐标（格） */
export function corners(f: TemplePlan['frame'], r: Rect): { x: number; y: number }[] {
  return [toMap(f, r.a0, r.b0), toMap(f, r.a1, r.b0), toMap(f, r.a1, r.b1), toMap(f, r.a0, r.b1)]
}
