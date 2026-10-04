import { UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../worlds/basin.ts'
import type { Basin } from '../worlds/basin'
import type { MeadowConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const DEG = Math.PI / 180
/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 山脚、栅栏里侧留出这么宽（格）不能走：身子不贴进碎石坡与栅栏 */
const FOOT_CLEAR_U = 0.15
const FENCE_CLEAR_U = 0.2
/** 几条林缘交汇的内角按这么大（格）磨圆 */
const CORNER_U = 2.5
/** 林间小路的路口从林缘往草地这边也算进去这么多（格）：路口的凹槽只在林缘这一带，不会顺着路线穿过对面的林子 */
const NOTCH_BACK_U = 3
/** 林子里那段小路画多长，格 */
const TRAIL_U = 7
/** 生成不出合格的草甸就换一组随机数重来，最多这么多次 */
const TRIES = 40
/** 山脚那级岩壁从下到上占多宽（格）：从上往下看是一道窄窄的岩面 */
export const WALL_U = 1.1

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
/** 多项式平滑取小：两者相差 k 以内时圆滑过渡 */
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return b + (a - b) * h - k * h * (1 - h)
}
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k)

/** 分形噪声拉开到 [−1, 1]：它大多挤在中间 */
function swing(x: number, y: number, seed: number, octaves: number): number {
  return Math.max(-1, Math.min(1, (fbm(x, y, seed, octaves) - 0.5) * 2.6))
}

/** 种子打散：相邻的种子也生成很不一样的地图 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x2c1b3c6d) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 本地坐标：a 从山那条地图边往地图里量，b 顺着那条边量，都以格计、在 [0, size] 里。地图坐标 = o + a·n + b·t */
export interface Frame {
  readonly ox: number
  readonly oy: number
  readonly nx: number
  readonly ny: number
  readonly tx: number
  readonly ty: number
}

export interface Local {
  a: number
  b: number
}

/** 山在地图的哪条边（上、右、下、左）：朝地图里的法线与那条边的中点（占边长的比例） */
const NORMALS: readonly Point[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
]
const MIDS: readonly Point[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
]

function frameOf(side: number, mirror: boolean, size: number): Frame {
  const n = NORMALS[side]!
  const t = mirror ? { x: n.y, y: -n.x } : { x: -n.y, y: n.x }
  const m = MIDS[side]!
  return { ox: m.x * size - (size / 2) * t.x, oy: m.y * size - (size / 2) * t.y, nx: n.x, ny: n.y, tx: t.x, ty: t.y }
}

export function toLocal(f: Frame, x: number, y: number, out: Local): Local {
  const dx = x - f.ox
  const dy = y - f.oy
  out.a = dx * f.nx + dy * f.ny
  out.b = dx * f.tx + dy * f.ty
  return out
}

export function toMap(f: Frame, a: number, b: number): Point {
  return { x: f.ox + f.nx * a + f.tx * b, y: f.oy + f.ny * a + f.ty * b }
}

/** 本地的方向换成地图上的方向 */
function dirToMap(f: Frame, da: number, db: number): Point {
  return { x: f.nx * da + f.tx * db, y: f.ny * da + f.ty * db }
}

export type Side = 'forest' | 'fence'

/** 边上的一处鼓包：第 k 条边（0 山脚、1 low、2 far、3 high 的林缘）在 at 处探出 amp 格（负的是凹进去），宽约 width 格 */
export interface Bump {
  readonly k: number
  readonly at: number
  readonly amp: number
  readonly width: number
}

/**
 * 草甸的边，本地坐标，格。山在 a 小的一边；对边（far）与 b 大的侧边（high）里恰好一条是栅栏、另一条是林子，b 小的侧边（low）总是林子。
 * 山脚与林缘按噪声弯，再叠上山嘴、山坳与林舌、草湾；栅栏几乎是直的：整条斜 skew（斜率）、过了 kinkAt 再拐 kink（斜率）。
 * 林间小路在林缘上凹进去一块，notch 是路口、进林子的方向与凹槽的深与半宽
 */
export interface Edges {
  readonly size: number
  readonly seed: number
  readonly far: Side
  readonly high: Side
  readonly cliff: { readonly inset: number; readonly bend: number; readonly wave: number; readonly jag: number }
  readonly forest: { readonly far: number; readonly low: number; readonly high: number; readonly bend: number; readonly wave: number; readonly scallop: number }
  readonly bumps: readonly Bump[]
  readonly fence: { readonly inset: number; readonly skew: number; readonly kinkAt: number; readonly kink: number }
  readonly notch: { readonly a: number; readonly b: number; readonly ua: number; readonly ub: number; readonly depth: number; readonly half: number }
}

/** 第 k 条边上的鼓包在 u 处探出多少，格 */
function bulge(e: Edges, k: number, u: number): number {
  let s = 0
  for (const p of e.bumps) if (p.k === k) s += p.amp * Math.exp(-(((u - p.at) / p.width) ** 2))
  return s
}

/** 山脚在 b 处离山那条地图边多远，格 */
export function footAt(e: Edges, b: number): number {
  const c = e.cliff
  return c.inset + c.bend * swing(b / c.wave + 3.7, 1.9, e.seed + 51, 3) + c.jag * swing(b / 1.2 + 0.4, 8.2, e.seed + 53, 2) - bulge(e, 0, b)
}

/** 第 k 条林缘在 u 处往草地这边让出多少，格：大弯加上一棵棵树冠排出的参差 */
function wiggle(e: Edges, u: number, k: number): number {
  const f = e.forest
  return f.bend * swing(u / f.wave + k * 7.1, k * 3.3, e.seed + 31 * k, 3) + f.scallop * swing(u / 2.2 + k * 1.7, 5.5, e.seed + 31 * k + 9, 2) + bulge(e, k, u)
}

/** 进林子多深，格，林子里为正：几条林缘交汇的内角磨圆，林间小路的路口凹进去 */
export function forestDepth(e: Edges, a: number, b: number): number {
  const S = e.size
  const f = e.forest
  let d = f.low + wiggle(e, a, 1) - b
  if (e.far === 'forest') d = smax(d, a - (S - f.far - wiggle(e, b, 2)), CORNER_U)
  if (e.high === 'forest') d = smax(d, b - (S - f.high - wiggle(e, a, 3)), CORNER_U)
  const n = e.notch
  const da = a - n.a
  const db = b - n.b
  const along = da * n.ua + db * n.ub
  const across = Math.abs(db * n.ua - da * n.ub)
  return Math.min(d, Math.max(across - n.half, along - n.depth, -along - NOTCH_BACK_U))
}

/** 栅栏顺着它的坐标 u 处，它离山那条边或 low 那条边多远（与 u 垂直的坐标 v），格 */
export function fenceV(e: Edges, u: number): number {
  const f = e.fence
  return e.size - f.inset + f.skew * (u - e.size / 2) + f.kink * Math.max(0, u - f.kinkAt)
}

/** 栅栏那条边上的坐标：u 顺着栅栏，v 与它垂直、往栅栏外增大 */
function fenceUV(e: Edges, a: number, b: number, out: Local): Local {
  out.a = e.far === 'fence' ? b : a
  out.b = e.far === 'fence' ? a : b
  return out
}

const UV: Local = { a: 0, b: 0 }

/** 出了栅栏多远，格，栅栏外为正（按与栅栏垂直的那个坐标量） */
export function beyondFence(e: Edges, a: number, b: number): number {
  fenceUV(e, a, b, UV)
  return UV.b - fenceV(e, UV.a)
}

/** 本地 (a, b) 能不能走：山脚以里、林缘以外、栅栏以里 */
export function openAt(e: Edges, a: number, b: number): boolean {
  return a > footAt(e, b) + FOOT_CLEAR_U && beyondFence(e, a, b) < -FENCE_CLEAR_U && forestDepth(e, a, b) < 0
}

/** 一棵树：树冠中心、半径（格）与树高（米）；云杉是尖顶的深色针叶树，白桦与灌木是圆冠的阔叶 */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly kind: 'spruce' | 'birch' | 'shrub'
}

/** 横在林间小路上的倒木：中点、顺着树干的单位方向、长与半径（格）；root 是带着翻起的根盘的那一头（1 或 −1） */
export interface Log {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly len: number
  readonly r: number
  readonly root: number
}

/** 一根栅栏桩：位置（格）与桩顶往哪歪（格）；门柱更粗 */
export interface Post {
  readonly x: number
  readonly y: number
  readonly lx: number
  readonly ly: number
  readonly gate: boolean
}

/** 栅栏门：门的中点、顺着栅栏的单位方向、朝栅栏外的单位方向、半宽（格）；门在第 index 与 index + 1 根桩之间 */
export interface Gate {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly ox: number
  readonly oy: number
  readonly half: number
  readonly index: number
}

/** 被落石埋掉的上山小路：路口在山脚的哪一点、朝山里的单位方向、顺着山脚的单位方向 */
export interface Trailhead {
  readonly x: number
  readonly y: number
  readonly ox: number
  readonly oy: number
  readonly ux: number
  readonly uy: number
}

/** 栅栏外的饮水槽：中点、顺着它的单位方向、长与宽（格） */
export interface Trough {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly len: number
  readonly wid: number
}

/** 栅栏外一只羊开局时站在哪、头朝哪（弧度） */
export interface Sheep {
  readonly x: number
  readonly y: number
  readonly heading: number
}

/**
 * 按种子生成的草甸，地图坐标以格计：地图是 size 见方的方形；边界、能走的地面（像素）、开局站位；
 * 林子里的树、倒木与那段小路，草地上踩出来的路，栅栏的桩与门，山脚那条被落石埋掉的上山小路，栅栏外的饮水槽与羊；
 * 各种野花的多少，风从哪吹来（朝下风的单位方向），画画用的种子
 */
export interface MeadowPlan {
  readonly size: number
  readonly frame: Frame
  readonly edges: Edges
  readonly basin: Basin
  readonly start: Point
  readonly trees: readonly Tree[]
  readonly log: Log
  readonly trail: readonly Point[]
  readonly paths: readonly (readonly Point[])[]
  readonly posts: readonly Post[]
  readonly gate: Gate
  readonly trailhead: Trailhead
  readonly trough: Trough | null
  readonly sheep: readonly Sheep[]
  readonly flowers: readonly number[]
  readonly wind: Point
  readonly seed: number
}

/** 野花有几种：白的雏菊、黄的毛茛、蓝紫的风铃草、粉的三叶草、紫红的剪秋罗 */
export const FLOWER_KINDS = 5

const NO_NOTCH: Edges['notch'] = { a: -1e6, b: -1e6, ua: 1, ub: 0, depth: 0, half: 0 }

/** 从 (a, b) 沿 (da, db) 走到第一处进林子的地方 */
function marchToForest(e: Edges, a: number, b: number, da: number, db: number): Local | null {
  for (let s = 0; s < 40; s += 0.05) {
    if (forestDepth(e, a + da * s, b + db * s) >= 0) return { a: a + da * s, b: b + db * s }
  }
  return null
}

/** 林子深处的方向：进林子深度的梯度 */
function intoForest(e: Edges, a: number, b: number): Local {
  const h = 0.05
  const ga = forestDepth(e, a + h, b) - forestDepth(e, a - h, b)
  const gb = forestDepth(e, a, b + h) - forestDepth(e, a, b - h)
  const l = Math.hypot(ga, gb) || 1
  return { a: ga / l, b: gb / l }
}

/** 一串布尔里最长的一段连续 true：起止下标；没有就是 null */
function longestRun(ok: readonly boolean[]): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null
  let from = -1
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) {
      if (from < 0) from = i
      continue
    }
    if (from >= 0 && (!best || i - 1 - from > best.to - best.from)) best = { from, to: i - 1 }
    from = -1
  }
  return best
}

/** 两端点与两端切向固定的曲线，叠上两端为零的蜿蜒，本地坐标，约每 0.2 格一点 */
function route(rng: Rng, p: Local, tp: Local, q: Local, tq: Local, amp: number, seed: number): Local[] {
  const L = Math.hypot(q.a - p.a, q.b - p.b)
  const n = Math.max(8, Math.ceil(L / 0.2))
  const k = L * 0.9
  const ph = rng.next() * 10
  const raw: Local[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    const h10 = t ** 3 - 2 * t ** 2 + t
    const h01 = -2 * t ** 3 + 3 * t ** 2
    const h11 = t ** 3 - t ** 2
    raw.push({ a: h00 * p.a + h10 * k * tp.a + h01 * q.a + h11 * k * tq.a, b: h00 * p.b + h10 * k * tp.b + h01 * q.b + h11 * k * tq.b })
  }
  return raw.map((r, i) => {
    const t = i / n
    const o = raw[Math.max(0, i - 1)]!
    const s = raw[Math.min(n, i + 1)]!
    const l = Math.hypot(s.a - o.a, s.b - o.b) || 1
    const off = amp * Math.sin(Math.PI * t) ** 2 * swing(t * 2.2 + ph, 0.5, seed, 2)
    return { a: r.a - ((s.b - o.b) / l) * off, b: r.b + ((s.a - o.a) / l) * off }
  })
}

/** 树按位置分桶，查附近有没有挨得太近的树 */
class Crowd {
  private readonly cells = new Map<number, Tree[]>()
  private readonly span: number
  constructor(span: number) {
    this.span = span
  }

  private key(x: number, y: number): number {
    return (Math.floor(y / this.span) + 512) * 4096 + Math.floor(x / this.span) + 512
  }

  add(t: Tree): void {
    const k = this.key(t.x, t.y)
    let list = this.cells.get(k)
    if (!list) this.cells.set(k, (list = []))
    list.push(t)
  }

  /** 半径 r 的树冠放在 (x, y) 会不会和已有的挤得太紧：圆心距小过两半径之和的 overlap 倍 */
  crowded(x: number, y: number, r: number, overlap: number): boolean {
    const reach = Math.ceil((r + 3) / this.span)
    const cx = Math.floor(x / this.span)
    const cy = Math.floor(y / this.span)
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        const list = this.cells.get((cy + j + 512) * 4096 + cx + i + 512)
        if (!list) continue
        for (const t of list) if (Math.hypot(t.x - x, t.y - y) < (t.r + r) * overlap) return true
      }
    }
    return false
  }
}

/** 点到折线的距离 */
export function polylineDist(pts: readonly Point[], x: number, y: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const l2 = ex * ex + ey * ey || 1e-12
    const t = clamp01(((x - a.x) * ex + (y - a.y) * ey) / l2)
    best = Math.min(best, Math.hypot(x - a.x - ex * t, y - a.y - ey * t))
  }
  return best
}

/** 生成到一半的草甸：边、坐标系、能走的地面与几处要紧的点，还没种树、没立栅栏 */
interface Sketch {
  readonly rng: Rng
  readonly frame: Frame
  readonly edges: Edges
  readonly basin: Basin
  readonly start: Point
  /** 林间小路的路口与进林子的方向，本地 */
  readonly mouth: Local
  readonly into: Local
}

/** 按种子定边：山在哪条边、哪条边是栅栏，各条边怎么弯，林间小路开在哪；能走的面积不在范围里就是 null */
function sketch(cfg: MeadowConfig, rng: Rng): Sketch | null {
  const S = cfg.sizeU
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const frame = frameOf(Math.floor(rng.next() * 4), rng.next() < 0.5, S)
  const fenceFar = rng.next() < cfg.fence.farChance
  const c = cfg.cliff
  const fo = cfg.forest
  const fe = cfg.fence
  const sign = (): number => (rng.next() < 0.5 ? -1 : 1)
  // 山嘴山坳与林舌草湾落在边的中段，鼓包之间隔开；只有林子的边才长林舌
  const bumps: Bump[] = []
  const addBumps = (k: number, count: readonly [number, number], amp: readonly [number, number], width: readonly [number, number]): void => {
    const n = Math.round(between(rng, count))
    for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
      const at = S * (0.18 + rng.next() * 0.64)
      const w = between(rng, width)
      if (bumps.some((p) => p.k === k && Math.abs(p.at - at) < (p.width + w) * 1.6)) continue
      bumps.push({ k, at, amp: sign() * between(rng, amp), width: w })
      i++
    }
  }
  addBumps(0, c.spurs, c.spurU, c.spurWidthU)
  for (const k of [1, fenceFar ? 3 : 2]) addBumps(k, fo.lobes, fo.lobeU, fo.lobeWidthU)
  const base: Edges = {
    size: S,
    seed,
    far: fenceFar ? 'fence' : 'forest',
    high: fenceFar ? 'forest' : 'fence',
    cliff: { inset: between(rng, c.insetU), bend: c.bendU * (0.6 + rng.next() * 0.6), wave: c.waveU, jag: c.jagU },
    forest: { far: between(rng, fo.insetU), low: between(rng, fo.insetU), high: between(rng, fo.insetU), bend: fo.bendU * (0.6 + rng.next() * 0.6), wave: fo.waveU, scallop: fo.scallopU },
    bumps,
    fence: {
      inset: between(rng, fe.insetU),
      skew: Math.tan(sign() * rng.next() * fe.skewDeg * DEG),
      kinkAt: S * (0.3 + rng.next() * 0.4),
      kink: Math.tan(sign() * rng.next() * fe.kinkDeg * DEG),
    },
    notch: NO_NOTCH,
  }
  // 林间小路开在一条林缘的中段：栅栏在侧边时多半开在对边的林子上
  const onFar = !fenceFar && rng.next() < 0.7
  const onHigh = fenceFar && rng.next() < 0.5
  const along = 0.32 + rng.next() * 0.36
  const from: Local = onFar ? { a: S * 0.5, b: S * along } : { a: footAt(base, S / 2) + (S - footAt(base, S / 2)) * (0.25 + along * 0.6), b: S / 2 }
  const dir: Local = onFar ? { a: 1, b: 0 } : onHigh ? { a: 0, b: 1 } : { a: 0, b: -1 }
  const hit = marchToForest(base, from.a, from.b, dir.a, dir.b)
  if (!hit) return null
  const g = intoForest(base, hit.a, hit.b)
  const turn = (rng.next() * 2 - 1) * 12 * DEG
  const into: Local = { a: g.a * Math.cos(turn) - g.b * Math.sin(turn), b: g.a * Math.sin(turn) + g.b * Math.cos(turn) }
  const edges: Edges = { ...base, notch: { a: hit.a, b: hit.b, ua: into.a, ub: into.b, depth: cfg.trail.notchU, half: cfg.trail.widthU / 2 } }
  // 能走的地面：按细格子栅格化，留下与草地中部连通的一块
  const tmp: Local = { a: 0, b: 0 }
  let keep: Local = { a: S / 2, b: S / 2 }
  let keepRoom = -Infinity
  for (let a = 1; a < S; a += 1) {
    for (let b = 1; b < S; b += 1) {
      const room = Math.min(a - footAt(edges, b), -forestDepth(edges, a, b), -beyondFence(edges, a, b))
      if (room > keepRoom) {
        keepRoom = room
        keep = { a, b }
      }
    }
  }
  const cell = BASIN_CELL_U * UNIT
  const n = Math.ceil(S / BASIN_CELL_U) + 2
  const open = (px: number, py: number): boolean => {
    toLocal(frame, px / UNIT, py / UNIT, tmp)
    return openAt(edges, tmp.a, tmp.b)
  }
  const keepAt = toMap(frame, keep.a, keep.b)
  const basin = makeBasin(open, -cell, -cell, n, n, cell, { x: keepAt.x * UNIT, y: keepAt.y * UNIT }, cfg.neckU * UNIT)
  let cells = 0
  let best = 0
  let start: Point = keepAt
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const room = basin.room[cy * n + cx]!
      if (room <= 0) continue
      cells++
      if (room > best) {
        best = room
        start = { x: (-cell + (cx + 0.5) * cell) / UNIT, y: (-cell + (cy + 0.5) * cell) / UNIT }
      }
    }
  }
  const area = cells * BASIN_CELL_U * BASIN_CELL_U
  if (area < cfg.areaU2[0] || area > cfg.areaU2[1]) return null
  // 路口要连着草地：路口外半格能走
  const mouthIn = toMap(frame, hit.a - into.a * 0.5, hit.b - into.b * 0.5)
  if (roomAt(basin, mouthIn.x * UNIT, mouthIn.y * UNIT) <= 0) return null
  return { rng, frame, edges, basin, start, mouth: hit, into }
}

/** 栅栏顺着它的坐标从 u0 走到 u1，约每 0.05 格一点：本地坐标与走过的弧长 */
function fenceCurve(e: Edges, u0: number, u1: number): { pts: Local[]; s: number[] } {
  const pts: Local[] = []
  const s: number[] = []
  let acc = 0
  let prev: Local | null = null
  for (let u = u0; u <= u1 + 1e-9; u += 0.05) {
    const v = fenceV(e, u)
    const p = e.far === 'fence' ? { a: v, b: u } : { a: u, b: v }
    if (prev) acc += Math.hypot(p.a - prev.a, p.b - prev.b)
    pts.push(p)
    s.push(acc)
    prev = p
  }
  return { pts, s }
}

/** 弧长 at 处栅栏上的点与切向（本地） */
function onCurve(c: { pts: Local[]; s: number[] }, at: number): { p: Local; t: Local } {
  let i = 0
  while (i < c.s.length - 2 && c.s[i + 1]! < at) i++
  const a = c.pts[i]!
  const b = c.pts[i + 1]!
  const f = clamp01((at - c.s[i]!) / Math.max(1e-9, c.s[i + 1]! - c.s[i]!))
  const l = Math.hypot(b.a - a.a, b.b - a.b) || 1
  return { p: { a: a.a + (b.a - a.a) * f, b: a.b + (b.b - a.b) * f }, t: { a: (b.a - a.a) / l, b: (b.b - a.b) / l } }
}

/**
 * 定好边以后的布置：栅栏的桩与门（门开在挨着草地的那段中间），山脚上山小路的路口，草地上从门到林间小路、再岔到路口的踩出来的路，
 * 林子里的那段小路与横在路上的倒木，林子里的树与林缘的灌木小树，栅栏外的饮水槽和羊；布置不下就是 null
 */
function furnish(cfg: MeadowConfig, k: Sketch): MeadowPlan | null {
  const { rng, frame, edges: e } = k
  const S = cfg.sizeU
  const pad = cfg.padU
  const inside = (a: number, b: number, room: number): boolean => {
    const p = toMap(frame, a, b)
    return roomAt(k.basin, p.x * UNIT, p.y * UNIT) >= room * UNIT
  }
  // 栅栏：栅栏在侧边时从山脚立起，一直伸进对边的林子；在对边时两头都伸进林子
  let u0 = -(pad - 1)
  if (e.far !== 'fence') {
    let a = e.cliff.inset
    for (let i = 0; i < 8; i++) a = footAt(e, fenceV(e, a)) + 0.25
    u0 = a
  }
  const curve = fenceCurve(e, u0, S + pad - 1)
  const pasture = (p: Local): boolean => forestDepth(e, p.a, p.b) < -0.3 && p.a > footAt(e, p.b) + 0.3
  const ok = curve.pts.map((p) => {
    const inA = e.far === 'fence' ? p.a - 0.7 : p.a
    const inB = e.far === 'fence' ? p.b : p.b - 0.7
    const outA = e.far === 'fence' ? p.a + 0.7 : p.a
    const outB = e.far === 'fence' ? p.b : p.b + 0.7
    return inside(inA, inB, 0.2) && pasture({ a: outA, b: outB })
  })
  const run = longestRun(ok)
  if (!run || curve.s[run.to]! - curve.s[run.from]! < cfg.fence.gateU + 5) return null
  const s0 = curve.s[run.from]!
  const s1 = curve.s[run.to]!
  const gateAt = s0 + (s1 - s0) * (0.3 + rng.next() * 0.4)
  const half = cfg.fence.gateU / 2
  const sEnd = curve.s[curve.s.length - 1]!
  const stops: { s: number; gate: boolean }[] = [
    { s: gateAt - half, gate: true },
    { s: gateAt + half, gate: true },
  ]
  for (let at = gateAt - half; ; ) {
    at -= cfg.fence.postU * (0.92 + rng.next() * 0.16)
    if (at < 0) break
    stops.push({ s: at, gate: false })
  }
  if (e.far !== 'fence') stops.push({ s: 0, gate: false })
  for (let at = gateAt + half; ; ) {
    at += cfg.fence.postU * (0.92 + rng.next() * 0.16)
    if (at > sEnd) break
    stops.push({ s: at, gate: false })
  }
  stops.sort((x, y) => x.s - y.s)
  const posts: Post[] = stops.map((st) => {
    const { p } = onCurve(curve, st.s)
    const m = toMap(frame, p.a, p.b)
    const lean = st.gate ? 0 : (rng.next() * 2 - 1) * 0.07
    const ang = rng.next() * Math.PI * 2
    return { x: m.x, y: m.y, lx: Math.cos(ang) * lean, ly: Math.sin(ang) * lean, gate: st.gate }
  })
  const gateIndex = stops.findIndex((st) => st.gate)
  const g = onCurve(curve, gateAt)
  const gm = toMap(frame, g.p.a, g.p.b)
  const gu = dirToMap(frame, g.t.a, g.t.b)
  const outLocal: Local = e.far === 'fence' ? { a: 1, b: 0 } : { a: 0, b: 1 }
  const go = dirToMap(frame, outLocal.a, outLocal.b)
  const gate: Gate = { x: gm.x, y: gm.y, ux: gu.x, uy: gu.y, ox: go.x, oy: go.y, half, index: gateIndex }
  // 上山小路的路口：开在挨着草地、离栅栏与林子都有一段的那截山脚的中段
  const bs: number[] = []
  const footOk: boolean[] = []
  for (let b = 0; b <= S; b += 0.1) {
    const a = footAt(e, b) + 0.9
    bs.push(b)
    footOk.push(inside(a, b, 0.3) && forestDepth(e, a, b) < -1.5 && beyondFence(e, a, b) < -3)
  }
  const footRun = longestRun(footOk)
  if (!footRun || bs[footRun.to]! - bs[footRun.from]! < 4) return null
  const sb = bs[footRun.from]! + (bs[footRun.to]! - bs[footRun.from]!) * (0.25 + rng.next() * 0.5)
  const slope = (footAt(e, sb + 0.2) - footAt(e, sb - 0.2)) / 0.4
  const ol = Math.hypot(1, slope)
  const hOut = dirToMap(frame, -1 / ol, slope / ol)
  const hAlong = dirToMap(frame, slope / ol, 1 / ol)
  const hAt = toMap(frame, footAt(e, sb), sb)
  const trailhead: Trailhead = { x: hAt.x, y: hAt.y, ox: hOut.x, oy: hOut.y, ux: hAlong.x, uy: hAlong.y }
  // 踩出来的路：从门口到林间小路的路口，半路岔到上山的路口
  const inward: Local = { a: -outLocal.a, b: -outLocal.b }
  const gateIn: Local = { a: g.p.a + inward.a * 0.8, b: g.p.b + inward.b * 0.8 }
  const n = e.notch
  const mouthIn: Local = { a: n.a + n.ua * (n.depth - 0.25), b: n.b + n.ub * (n.depth - 0.25) }
  const headIn: Local = { a: footAt(e, sb) + 0.55, b: sb }
  const pathSeed = e.seed + 401
  const fits = (pts: readonly Local[], skip: number): boolean => pts.every((p, i) => i < skip || i > pts.length - 1 - skip || inside(p.a, p.b, 0.35))
  let main: Local[] = []
  for (const m of [1, 0.6, 0.3, 0]) {
    main = route(rng, gateIn, inward, mouthIn, { a: n.ua, b: n.ub }, 1.1 * m, pathSeed)
    if (fits(main, 6)) break
  }
  const forkAt = main[Math.floor(main.length * (0.3 + rng.next() * 0.3))]!
  const fi = main.indexOf(forkAt)
  const before = main[Math.max(0, fi - 1)]!
  const after = main[Math.min(main.length - 1, fi + 1)]!
  const fl = Math.hypot(after.a - before.a, after.b - before.b) || 1
  const toHead: Local = { a: headIn.a - forkAt.a, b: headIn.b - forkAt.b }
  const tl = Math.hypot(toHead.a, toHead.b) || 1
  const forkDir: Local = { a: ((after.a - before.a) / fl + toHead.a / tl) / 2, b: ((after.b - before.b) / fl + toHead.b / tl) / 2 }
  const fdl = Math.hypot(forkDir.a, forkDir.b) || 1
  let branch: Local[] = []
  for (const m of [1, 0.6, 0.3, 0]) {
    branch = route(rng, forkAt, { a: forkDir.a / fdl, b: forkDir.b / fdl }, headIn, { a: -1, b: 0 }, 0.8 * m, pathSeed + 7)
    if (fits(branch, 3)) break
  }
  const paths = [main, branch].map((pts) => pts.map((p) => toMap(frame, p.a, p.b)))
  // 林子里的那段小路：从路口往林子里拐着伸进去
  const trailLocal: Local[] = []
  const bendRate = (rng.next() * 2 - 1) * 0.07
  let ang = Math.atan2(n.ub, n.ua)
  let at: Local = { a: n.a - n.ua * 0.2, b: n.b - n.ub * 0.2 }
  for (let s = 0; s <= TRAIL_U; s += 0.25) {
    trailLocal.push(at)
    ang += bendRate * (s > n.depth ? 1 : 0)
    at = { a: at.a + Math.cos(ang) * 0.25, b: at.b + Math.sin(ang) * 0.25 }
  }
  const trail = trailLocal.map((p) => toMap(frame, p.a, p.b))
  // 倒木横在凹槽的尽头，顺着与路差不多垂直的方向，一头翻起根盘
  const tilt = (rng.next() * 2 - 1) * 25 * DEG
  const cross: Local = { a: -n.ub, b: n.ua }
  const lc: Local = {
    a: n.a + n.ua * (n.depth + 0.45) + cross.a * (rng.next() * 2 - 1) * 0.6,
    b: n.b + n.ub * (n.depth + 0.45) + cross.b * (rng.next() * 2 - 1) * 0.6,
  }
  const lu = dirToMap(frame, cross.a * Math.cos(tilt) - cross.b * Math.sin(tilt), cross.a * Math.sin(tilt) + cross.b * Math.cos(tilt))
  const lm = toMap(frame, lc.a, lc.b)
  const log: Log = { x: lm.x, y: lm.y, ux: lu.x, uy: lu.y, len: between(rng, cfg.trail.logU), r: 0.26 + rng.next() * 0.08, root: rng.next() < 0.5 ? -1 : 1 }
  // 树：林子里撒满云杉，林缘一圈补上灌木、小云杉与白桦；树冠最多探进草地 overhangU，让开小路、倒木与栅栏
  const trees: Tree[] = []
  const crowd = new Crowd(2.5)
  const fo = cfg.forest
  const logA: Point = { x: log.x - log.ux * log.len * 0.5, y: log.y - log.uy * log.len * 0.5 }
  const logB: Point = { x: log.x + log.ux * log.len * 0.5, y: log.y + log.uy * log.len * 0.5 }
  const clearOf = (x: number, y: number, r: number): boolean => {
    if (polylineDist(trail, x, y) < r * 0.55 + 0.7) return false
    if (polylineDist([logA, logB], x, y) < r * 0.5 + 0.5) return false
    const root = log.root > 0 ? logB : logA
    return Math.hypot(x - root.x, y - root.y) > r * 0.5 + 1.3
  }
  const lo = -pad
  const hi = S + pad
  const tmp: Local = { a: 0, b: 0 }
  const place = (x: number, y: number, r: number, overlap: number, kind: Tree['kind'], h: number): boolean => {
    toLocal(frame, x, y, tmp)
    const depth = forestDepth(e, tmp.a, tmp.b)
    if (depth < r - fo.overhangU) return false
    if (tmp.a < footAt(e, tmp.b) + 0.4) return false
    if (Math.abs(beyondFence(e, tmp.a, tmp.b)) < 0.7) return false
    if (!clearOf(x, y, r) || crowd.crowded(x, y, r, overlap)) return false
    const t: Tree = { x, y, r, h, kind }
    trees.push(t)
    crowd.add(t)
    return true
  }
  const area = (hi - lo) * (hi - lo)
  for (let i = 0; i < area * 1.6; i++) {
    const r = between(rng, fo.crownU)
    place(lo + rng.next() * (hi - lo), lo + rng.next() * (hi - lo), r, 0.64, 'spruce', between(rng, fo.heightM) * (r / fo.crownU[1]) ** 0.6)
  }
  for (let i = 0; i < area * 1.2; i++) {
    const x = lo + rng.next() * (hi - lo)
    const y = lo + rng.next() * (hi - lo)
    toLocal(frame, x, y, tmp)
    const depth = forestDepth(e, tmp.a, tmp.b)
    if (depth < 0 || depth > 1.8) continue
    const r = between(rng, fo.edgeU)
    const roll = rng.next()
    if (roll < fo.birch) place(x, y, r * 1.25, 0.62, 'birch', between(rng, fo.heightM) * 0.75)
    else if (roll < fo.birch + (1 - fo.birch) * 0.4) place(x, y, r, 0.62, 'spruce', between(rng, fo.heightM) * 0.45)
    else place(x, y, r, 0.6, 'shrub', 0.8 + rng.next() * 0.8)
  }
  // 栅栏外：饮水槽靠在门边，羊散在栅栏外几格以内
  const outward = (p: Local, d: number): Local => (e.far === 'fence' ? { a: p.a + d, b: p.b } : { a: p.a, b: p.b + d })
  let trough: Trough | null = null
  if (rng.next() < 0.6) {
    const t = onCurve(curve, Math.max(s0 + 1.5, Math.min(s1 - 1.5, gateAt + (rng.next() < 0.5 ? -1 : 1) * (half + 1.6 + rng.next() * 1.6))))
    const c = outward(t.p, 0.85)
    if (pasture(c)) {
      const m = toMap(frame, c.a, c.b)
      const u = dirToMap(frame, t.t.a, t.t.b)
      trough = { x: m.x, y: m.y, ux: u.x, uy: u.y, len: 1.5, wid: 0.5 }
    }
  }
  const sheep: Sheep[] = []
  const want = Math.round(between(rng, cfg.sheep))
  for (let i = 0; i < 200 && sheep.length < want; i++) {
    const t = onCurve(curve, s0 + (s1 - s0) * rng.next())
    const c = outward(t.p, 1.3 + rng.next() * Math.min(3.5, pad - 3))
    if (!pasture(c) || forestDepth(e, c.a, c.b) > -1.2) continue
    const m = toMap(frame, c.a, c.b)
    if (sheep.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < 1.8)) continue
    if (trough && Math.hypot(trough.x - m.x, trough.y - m.y) < 1.6) continue
    sheep.push({ x: m.x, y: m.y, heading: rng.next() * Math.PI * 2 })
  }
  // 野花：每局各种花多少不一样，总有一种开得最多
  const flowers = Array.from({ length: FLOWER_KINDS }, () => 0.15 + rng.next() ** 1.5)
  flowers[Math.floor(rng.next() * FLOWER_KINDS)]! += 1.2
  const sum = flowers.reduce((s, w) => s + w, 0)
  // 白天的山风顺着坡往山上吹：从草地往山那边，偏一点
  const wa = (rng.next() * 2 - 1) * 25 * DEG
  const wind = dirToMap(frame, -Math.cos(wa), Math.sin(wa))
  return {
    size: S,
    frame,
    edges: e,
    basin: k.basin,
    start: k.start,
    trees,
    log,
    trail,
    paths,
    posts,
    gate,
    trailhead,
    trough,
    sheep,
    flowers: flowers.map((w) => w / sum),
    wind,
    seed: Math.floor(rng.next() * 0x7fffffff),
  }
}

let last: { cfg: MeadowConfig; seed: number; plan: MeadowPlan } | null = null

/** 按种子生成草甸：先定边、量能走的面积，再布置林子、栅栏、上山的路口与路；哪一步不合格就换一组随机数。同一张图视图与规则各要一次，记住最近一张 */
export function meadowPlan(cfg: MeadowConfig, seed: number): MeadowPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(scramble(seed))
  for (let k = 0; k < TRIES; k++) {
    const s = sketch(cfg, rng)
    if (!s) continue
    const plan = furnish(cfg, s)
    if (!plan) continue
    last = { cfg, seed, plan }
    return plan
  }
  throw new Error(`草甸生成不出来：种子 ${seed}`)
}
