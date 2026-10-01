import { UNIT } from '../../util/units'
import { cellNearest, fbm } from '../../util/noise'
import { Rng } from '../../util/rng'
import { makeBasin } from '../worlds/basin'
import type { Basin } from '../worlds/basin'
import type { RiverConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const DEG = Math.PI / 180
/** 中线按这个弧长间隔取点，格 */
const STEP_U = 0.2
/** 地形铺到地图外多远，格：镜头边距再加设备安全区 */
export const TERRAIN_PAD_U = 6
/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 上游的溪沟与下游的深谷从崖边往外伸多长，格：伸出镜头能看到的范围 */
const REACH_OUT_U = 16
/** 生成不出合格的河网就换一组随机数重来，最多这么多次 */
const TRIES = 60

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
/** 多项式平滑取小：两者相差 k 以内时圆滑过渡 */
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return b + (a - b) * h - k * h * (1 - h)
}
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
/** 比 Math.hypot 快得多：生成时每格要算上千次距离 */
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)

/** 种子打散：相邻的种子也生成很不一样的地图 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x5f3759df) >>> 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/**
 * 一段河道（或崖上的溪沟、崖下的深谷）的中线与断面，格与米：逐点的位置、单位切向、离起点的弧长、曲率（朝左法线 (−ty, tx) 转为正），
 * 水面半宽（格）、深泓的水深（米）与它在断面上偏到哪（半宽的倍数，朝左为正）、设计水面高程（米）
 */
export interface Reach {
  readonly x: Float64Array
  readonly y: Float64Array
  readonly tx: Float64Array
  readonly ty: Float64Array
  readonly s: Float64Array
  readonly curv: Float64Array
  readonly half: Float64Array
  readonly depth: Float64Array
  readonly shift: Float64Array
  readonly level: Float64Array
  /** 中线的外接框：x0, y0, x1, y1 */
  readonly box: Float64Array
  /** 设计流量（米³/秒）、平均流速（米/秒）与水面坡降 */
  readonly q: number
  readonly speed: number
  readonly slope: number
}

/** 进水口：瀑布落在崖脚 (x, y)，朝空地里的方向 (nx, ny)；崖下深潭的中心与半径，格 */
export interface Inlet {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly poolX: number
  readonly poolY: number
  readonly poolR: number
  /** 落下的水帘半宽，格；崖顶溪沟的水面高程，米 */
  readonly half: number
  readonly top: number
}

/** 出水口：断崖边的中点、朝外（水流）方向、断崖边上水面半宽（格）与那里的设计水面高程（米） */
export interface Outlet {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly half: number
  readonly level: number
}

/** 一棵树：树冠的圆心、半径（格）与树高（米） */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/** 一块石头：圆心、半径（格）与顶面高程（米） */
export interface Boulder {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly top: number
}

/**
 * 地形，格子 (0, 0) 的左上角在 (x0, y0) 格：高程（米）；画地面用的几张场：最近那段河道（或崖上溪沟）的设计水位（米）、
 * 离它水边多远（格，水里为负）、凸岸边滩有多显，离空地边多远（格，空地里为正）、林子的浓度、台地的高低（占崖高的比例）、离深谷边多远（格，谷里为正）
 */
export interface Terrain {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly z: Float32Array
  readonly level: Float32Array
  readonly edge: Float32Array
  readonly bar: Float32Array
  readonly clear: Float32Array
  readonly forest: Float32Array
  readonly up: Float32Array
  readonly gorge: Float32Array
}

/** 空地的轮廓：半径按方位角的谐波起伏，再加二维噪声的起伏；出入口两侧的噪声压平；进水口处另挖一个半圆的崖湾 */
export interface Shape {
  readonly cx: number
  readonly cy: number
  readonly r0: number
  readonly lobes: readonly { readonly k: number; readonly a: number; readonly ph: number }[]
  readonly wobble: number
  readonly wave: number
  readonly seed: number
  readonly quiet: readonly { readonly a: number; readonly span: number }[]
  readonly bay: { readonly x: number; readonly y: number; readonly r: number } | null
}

/**
 * 按种子生成的河流地图，格与米：地图 w × h 格，空地的轮廓、主河道与大小两股（reaches[0..2]）、崖上的溪沟、两条深谷，
 * 地形高程、能走的地面（像素，含河面与断崖外那一小段）、树与石头，开局时队伍站的地方
 */
export interface RiverPlan {
  readonly seed: number
  readonly w: number
  readonly h: number
  readonly shape: Shape
  readonly reaches: readonly Reach[]
  readonly upstream: Reach
  readonly gorges: readonly Reach[]
  readonly inlet: Inlet
  readonly outlets: readonly Outlet[]
  readonly terrain: Terrain
  readonly basin: Basin
  readonly trees: readonly Tree[]
  readonly boulders: readonly Boulder[]
  readonly start: Point
  /** 能走的地面（含河面）有多大，格² */
  readonly area: number
  /** 林子与岩石的分界噪声的种子；进水口的方位与它背后台地满高的半张角，弧度 */
  readonly forestSeed: number
  readonly aIn: number
  readonly span: number
}

function radiusAt(sh: Shape, a: number): number {
  let f = 1
  for (const l of sh.lobes) f += l.a * Math.cos(l.k * a + l.ph)
  return sh.r0 * f
}

function quietAt(sh: Shape, a: number): number {
  let q = 1
  for (const p of sh.quiet) q *= smooth(0.55 * p.span, p.span, Math.abs(wrapAngle(a - p.a)))
  return q
}

/** 空地里离边多远（格，近似）：里面为正 */
export function clearingDepth(sh: Shape, x: number, y: number): number {
  const dx = x - sh.cx
  const dy = y - sh.cy
  const a = Math.atan2(dy, dx)
  const wob = (fbm(x / sh.wave + 13.1, y / sh.wave + 7.7, sh.seed, 3) * 2 - 1) * 1.6 * sh.wobble * quietAt(sh, a)
  const base = radiusAt(sh, a) + wob - len(dx, dy)
  if (!sh.bay) return base
  return -smin(-base, len(x - sh.bay.x, y - sh.bay.y) - sh.bay.r, 0.6)
}

/** 从空地里的 (x, y) 沿方位角 a 走到边上 */
function edgeAlong(sh: Shape, a: number): Point {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  let lo = 0
  let hi = sh.r0 * 3
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (clearingDepth(sh, sh.cx + dx * mid, sh.cy + dy * mid) > 0) lo = mid
    else hi = mid
  }
  return { x: sh.cx + dx * lo, y: sh.cy + dy * lo }
}

/** 空地边上朝外的单位法线 */
function outwardAt(sh: Shape, x: number, y: number): Point {
  const e = 0.05
  const gx = clearingDepth(sh, x + e, y) - clearingDepth(sh, x - e, y)
  const gy = clearingDepth(sh, x, y + e) - clearingDepth(sh, x, y - e)
  const l = len(gx, gy) || 1
  return { x: -gx / l, y: -gy / l }
}

function hermite(a: Point, ta: Point, b: Point, tb: Point, k: number, n: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    const h10 = t ** 3 - 2 * t ** 2 + t
    const h01 = -2 * t ** 3 + 3 * t ** 2
    const h11 = t ** 3 - t ** 2
    out.push({ x: h00 * a.x + h10 * k * ta.x + h01 * b.x + h11 * k * tb.x, y: h00 * a.y + h10 * k * ta.y + h01 * b.y + h11 * k * tb.y })
  }
  return out
}

/** 端点与端点切向固定的曲线，叠上两端为零的蜿蜒：只留波长不短于九格的大弯，短河段弯得更缓 */
function route(rng: Rng, a: Point, ta: Point, b: Point, tb: Point, meander: number, seed: number): Point[] {
  const L = len(b.x - a.x, b.y - a.y)
  const n = Math.max(16, Math.ceil(L / 0.1))
  const raw = hermite(a, ta, b, tb, L * 0.9, n)
  const modes = [1, 2, 3].filter((m) => (2 * L) / m >= 9).map((m) => ({ m, amp: (rng.next() * 2 - 1) / m ** 1.3, ph: rng.next() * Math.PI * 2 }))
  const fine = Math.min(1, L / 20)
  return raw.map((p, i) => {
    const t = i / n
    const q = raw[Math.min(n, i + 1)]!
    const o = raw[Math.max(0, i - 1)]!
    const l = len(q.x - o.x, q.y - o.y) || 1
    let off = 0
    for (const md of modes) off += md.amp * Math.sin(md.m * Math.PI * t + md.ph)
    off += (fbm(t * 3.5 * fine, 0.5, seed, 2) - 0.5) * 1.2 * fine
    off *= meander * Math.sin(Math.PI * t) ** 2
    return { x: p.x - ((q.y - o.y) / l) * off, y: p.y + ((q.x - o.x) / l) * off }
  })
}

/** 按弧长等距重新取点，算出切向、弧长与曲率 */
function resample(pts: readonly Point[]): { x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array; s: Float64Array; curv: Float64Array } {
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + len(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  const L = acc[acc.length - 1]!
  const n = Math.max(2, Math.round(L / STEP_U) + 1)
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  let j = 0
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1)
    while (j < pts.length - 2 && acc[j + 1]! < s) j++
    const t = (s - acc[j]!) / Math.max(1e-9, acc[j + 1]! - acc[j]!)
    x[i] = pts[j]!.x + (pts[j + 1]!.x - pts[j]!.x) * t
    y[i] = pts[j]!.y + (pts[j + 1]!.y - pts[j]!.y) * t
  }
  const tx = new Float64Array(n)
  const ty = new Float64Array(n)
  const s = new Float64Array(n)
  const curv = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    const l = len(x[b]! - x[a]!, y[b]! - y[a]!) || 1
    tx[i] = (x[b]! - x[a]!) / l
    ty[i] = (y[b]! - y[a]!) / l
    s[i] = (L * i) / (n - 1)
  }
  const raw = new Float64Array(n)
  for (let i = 1; i < n - 1; i++) {
    const turn = Math.atan2(tx[i - 1]! * ty[i + 1]! - ty[i - 1]! * tx[i + 1]!, tx[i - 1]! * tx[i + 1]! + ty[i - 1]! * ty[i + 1]!)
    raw[i] = turn / (s[i + 1]! - s[i - 1]!)
  }
  raw[0] = raw[1] ?? 0
  raw[n - 1] = raw[n - 2] ?? 0
  const w = 3
  for (let i = 0; i < n; i++) {
    let sum = 0
    let cnt = 0
    for (let k = -w; k <= w; k++) {
      const m = i + k
      if (m < 0 || m >= n) continue
      sum += raw[m]!
      cnt++
    }
    curv[i] = sum / cnt
  }
  return { x, y, tx, ty, s, curv }
}

function boxOf(x: Float64Array, y: Float64Array): Float64Array {
  const b = new Float64Array([Infinity, Infinity, -Infinity, -Infinity])
  for (let i = 0; i < x.length; i++) {
    b[0] = Math.min(b[0]!, x[i]!)
    b[1] = Math.min(b[1]!, y[i]!)
    b[2] = Math.max(b[2]!, x[i]!)
    b[3] = Math.max(b[3]!, y[i]!)
  }
  return b
}

/** (x, y) 离一段中线的外接框有没有 pad 格那么近 */
function nearBox(r: Reach, x: number, y: number, pad: number): boolean {
  const b = r.box
  return x > b[0]! - pad && x < b[2]! + pad && y > b[1]! - pad && y < b[3]! + pad
}

/** 断面 1 − |ξ|^p 在 [−1, 1] 上 (1 − |ξ|^p)^(5/3) 的积分：曼宁公式里宽浅河道的过水能力 */
function conveyanceShape(p: number): number {
  const n = 400
  let sum = 0
  for (let i = 0; i < n; i++) {
    const xi = -1 + (2 * (i + 0.5)) / n
    sum += (1 - Math.abs(xi) ** p) ** (5 / 3)
  }
  return (sum * 2) / n
}

/**
 * 按流量定河道：水面宽 W = a·√Q、平均水深 D = c·Q^0.4，断面 1 − |ξ|^p 的最深处是平均的 (p+1)/p 倍；
 * 坡降按曼宁公式 Q = (1/n)·∫h^(5/3)dy·√S 反算，宽浅河道的水力半径取当地水深
 */
export function hydraulics(cfg: RiverConfig, q: number): { half: number; dmax: number; slope: number; speed: number } {
  const f = cfg.flow
  const W = f.widthCoef * Math.sqrt(q)
  const D = f.depthCoef * q ** 0.4
  const dmax = (D * (f.bedShape + 1)) / f.bedShape
  const K = (dmax ** (5 / 3) * (W / 2) * conveyanceShape(f.bedShape)) / f.manning
  return { half: W / 2 / cfg.meterPerU, dmax, slope: (q / K) ** 2, speed: q / (W * D) }
}

/**
 * 把中线做成河道：水面半宽沿程略有起伏，弯顶冲出深潭、两弯之间是浅滩，深泓偏向凹岸；
 * 水面从 level0 起按坡降往下游降，widen 让末端几格放宽（分叉处的河面更开阔）
 */
function makeReach(cfg: RiverConfig, pts: readonly Point[], q: number, level0: number, seed: number, widen: number): Reach {
  const g = resample(pts)
  const n = g.x.length
  const hy = hydraulics(cfg, q)
  const f = cfg.flow
  const L = g.s[n - 1]!
  const half = new Float64Array(n)
  const depth = new Float64Array(n)
  const shift = new Float64Array(n)
  const level = new Float64Array(n)
  const bend = new Float64Array(n)
  for (let i = 0; i < n; i++) bend[i] = Math.min(1, Math.abs(g.curv[i]!) * hy.half * 2 * 2.5)
  const w = Math.max(1, Math.round((hy.half * 2) / STEP_U))
  for (let i = 0; i < n; i++) {
    let sum = 0
    let cnt = 0
    for (let k = -w; k <= w; k++) {
      const m = i + k
      if (m < 0 || m >= n) continue
      sum += bend[m]!
      cnt++
    }
    const b = sum / cnt
    const s = g.s[i]!
    half[i] = hy.half * (1 + (fbm(s / 4, 3.3, seed, 2) - 0.5) * 0.25) * (1 + widen * smooth(L - 4, L, s))
    depth[i] = hy.dmax * (f.riffle + (f.pool - f.riffle) * b)
    shift[i] = -Math.sign(g.curv[i]!) * f.thalwegShift * b
    level[i] = level0 - hy.slope * s * cfg.meterPerU
  }
  return { ...g, half, depth, shift, level, box: boxOf(g.x, g.y), q, speed: hy.speed, slope: hy.slope }
}

/** 找中线上的最近点先隔这么多点粗扫一遍，再在附近细扫 */
const PROBE = 5

/** 一点在一段中线上的最近处：下标、两点间的比例、弧长、朝左为正的横向偏移，以及到中线（含两端点）的距离 */
export interface Along {
  i: number
  t: number
  s: number
  n: number
  d: number
}

export function project(r: Reach, x: number, y: number, out: Along): Along {
  const n = r.x.length
  let best = Infinity
  let bi = 0
  const scan = (from: number, to: number, step: number): void => {
    for (let i = from; i <= to; i += step) {
      const dx = x - r.x[i]!
      const dy = y - r.y[i]!
      const d = dx * dx + dy * dy
      if (d < best) {
        best = d
        bi = i
      }
    }
  }
  scan(0, n - 1, PROBE)
  scan(n - 1, n - 1, 1)
  scan(Math.max(0, bi - PROBE), Math.min(n - 1, bi + PROBE), 1)
  let bestD = Infinity
  for (let i = Math.max(0, bi - 1); i <= Math.min(n - 2, bi); i++) {
    const ax = r.x[i]!
    const ay = r.y[i]!
    const ex = r.x[i + 1]! - ax
    const ey = r.y[i + 1]! - ay
    const len2 = ex * ex + ey * ey || 1e-12
    const t = clamp01(((x - ax) * ex + (y - ay) * ey) / len2)
    const px = ax + ex * t
    const py = ay + ey * t
    const d = len(x - px, y - py)
    if (d < bestD) {
      bestD = d
      out.i = i
      out.t = t
      out.d = d
      out.s = r.s[i]! + (r.s[i + 1]! - r.s[i]!) * t
    }
  }
  const i = out.i
  const t = out.t
  const tx = r.tx[i]! + (r.tx[i + 1]! - r.tx[i]!) * t
  const ty = r.ty[i]! + (r.ty[i + 1]! - r.ty[i]!) * t
  const px = r.x[i]! + (r.x[i + 1]! - r.x[i]!) * t
  const py = r.y[i]! + (r.y[i + 1]! - r.y[i]!) * t
  out.n = (x - px) * -ty + (y - py) * tx
  if (out.s <= 0 || out.s >= r.s[r.s.length - 1]!) out.n = Math.sign(out.n) * out.d
  return out
}

/** 沿中线插值 */
export function at(a: Float64Array, p: Along): number {
  return a[p.i]! + (a[p.i + 1]! - a[p.i]!) * p.t
}

/** 断面上 ξ（半宽的倍数，朝左为正）处的水深占深泓的比例：深泓在 c，两侧按 1 − |u|^p 收到岸边为零 */
export function profile(xi: number, c: number, p: number): number {
  const u = xi >= c ? (xi - c) / (1 - c) : (c - xi) / (1 + c)
  return u >= 1 ? 0 : 1 - u ** p
}

/** 河岸的宽：凸岸的边滩缓、凹岸的切岸陡 */
function bankWidth(cfg: RiverConfig, shift: number, side: number): number {
  const outer = shift * side > 0
  const b = Math.abs(shift) / Math.max(1e-6, cfg.flow.thalwegShift)
  return cfg.flow.bankU * (outer ? 1 - 0.45 * b : 1 + 1.6 * b)
}

/** 一段河道在 (x, y) 处的地面高程（米）：水下是断面，岸坡 S 形升到岸顶，岸顶以外的滩地缓缓抬高 */
function reachGround(cfg: RiverConfig, r: Reach, p: Along): number {
  const half = at(r.half, p)
  const lv = at(r.level, p)
  const sh = at(r.shift, p)
  const a = Math.abs(p.n)
  if (a < half) return lv - at(r.depth, p) * profile(p.n / half, sh, cfg.flow.bedShape)
  const bw = bankWidth(cfg, sh, Math.sign(p.n))
  const out = a - half
  return lv + cfg.flow.bankM * smooth(0, bw, out) + cfg.flow.floodSlope * Math.max(0, out - bw)
}

/**
 * 进水口背后的台地有多高（占崖高的比例）：从空地中心看去在进水口方位两侧 span 以内满高，再往外半个弧度降到零；
 * 崖上溪沟两侧三格以内也是台地，溪沟一路伸出镜头
 */
export function upland(plan: Pick<RiverPlan, 'shape' | 'upstream'>, aIn: number, span: number, x: number, y: number, tmp: Along): number {
  const a = Math.atan2(y - plan.shape.cy, x - plan.shape.cx)
  const sector = smooth(span + 0.5, span, Math.abs(wrapAngle(a - aIn)))
  if (sector >= 1 || !nearBox(plan.upstream, x, y, 4)) return sector
  project(plan.upstream, x, y, tmp)
  return Math.max(sector, smooth(4, 2.5, tmp.d))
}

/** 林子还是岩石：二维噪声大于阈值是林子；崖与深谷一带都是岩石 */
export function forestness(cfg: RiverConfig, seed: number, x: number, y: number): number {
  const n = fbm(x / 7 + 3.1, y / 7 + 11.7, seed, 3)
  const t = 1 - cfg.trees.forest
  return smooth(t - 0.035, t + 0.035, n * 0.5 + 0.25 + (fbm(x / 2.2, y / 2.2, seed + 17, 2) - 0.5) * 0.12)
}

/** 离一组深谷多近：深谷里（从断崖边往外、在谷宽以内）为正，格 */
export function gorgeDepthAt(plan: Pick<RiverPlan, 'gorges'>, x: number, y: number, tmp: Along): number {
  let best = -Infinity
  for (const g of plan.gorges) {
    if (!nearBox(g, x, y, 4)) continue
    project(g, x, y, tmp)
    if (tmp.s <= 0) continue
    best = Math.max(best, at(g.half, tmp) - Math.abs(tmp.n))
  }
  return best
}

interface Draft {
  shape: Shape
  reaches: Reach[]
  upstream: Reach
  gorges: Reach[]
  inlet: Inlet
  outlets: Outlet[]
  /** 进水口的方位与台地满高的半张角，弧度 */
  aIn: number
  span: number
}

/** 河网：进水口与两个出水口的方位、分叉点、三段中线；不合格（弯太急、贴边、两股挨得太近）就返回 null */
function network(cfg: RiverConfig, rng: Rng, r0: number, seed: number): Draft | null {
  const c = cfg.clearing
  const nw = cfg.network
  const lobes = c.lobes.map((amp, k) => ({ k: k + 2, a: (rng.next() * 2 - 1) * amp, ph: rng.next() * Math.PI * 2 }))
  const aIn = rng.next() * Math.PI * 2
  const aMain = aIn + Math.PI + (rng.next() * 2 - 1) * nw.oppositeDeg * DEG
  const side = rng.next() < 0.5 ? -1 : 1
  const aSide = aMain + side * between(rng, nw.spreadDeg) * DEG
  if (Math.abs(wrapAngle(aSide - aIn)) < nw.apartDeg * DEG) return null
  const main = hydraulics(cfg, cfg.flow.discharge)
  const spanOf = (half: number): number => (half + 3.5) / r0
  const poolR = cfg.falls.poolR * main.half * 2
  const quiet = [
    { a: aIn, span: spanOf(poolR) * 1.4 },
    { a: aMain, span: spanOf(main.half) },
    { a: aSide, span: spanOf(main.half) },
  ]
  const base: Shape = { cx: 0, cy: 0, r0, lobes, wobble: c.wobbleU, wave: c.waveU, seed, quiet, bay: null }
  const pin = edgeAlong(base, aIn)
  const nIn = outwardAt(base, pin.x, pin.y)
  const bayR = poolR * 1.12
  const bay = { x: pin.x - nIn.x * bayR * 0.3, y: pin.y - nIn.y * bayR * 0.3, r: bayR }
  const shape: Shape = { ...base, bay }
  const ex = [edgeAlong(shape, aMain), edgeAlong(shape, aSide)]
  const exN = ex.map((p) => outwardAt(shape, p.x, p.y))
  const pool = { x: bay.x, y: bay.y }
  const foot = { x: bay.x + nIn.x * bayR, y: bay.y + nIn.y * bayR }
  const mid = { x: (ex[0]!.x + ex[1]!.x) / 2, y: (ex[0]!.y + ex[1]!.y) / 2 }
  const f = between(rng, nw.splitAt)
  const span = len(mid.x - pool.x, mid.y - pool.y)
  const lat = (rng.next() * 2 - 1) * 0.1 * span
  const aim = { x: (mid.x - pool.x) / span - nIn.x, y: (mid.y - pool.y) / span - nIn.y }
  const al = len(aim.x, aim.y)
  const ux = aim.x / al
  const uy = aim.y / al
  const split = { x: pool.x + ux * span * f - uy * lat, y: pool.y + uy * span * f + ux * lat }
  const dIn = { x: split.x - pool.x, y: split.y - pool.y }
  const dl = len(dIn.x, dIn.y)
  dIn.x /= dl
  dIn.y /= dl
  const dirs = ex.map((p) => {
    const l = len(p.x - split.x, p.y - split.y)
    return { x: (p.x - split.x) / l, y: (p.y - split.y) / l }
  })
  const major = dirs[0]!.x * dIn.x + dirs[0]!.y * dIn.y >= dirs[1]!.x * dIn.x + dirs[1]!.y * dIn.y ? 0 : 1
  const minor = 1 - major
  const lean = { x: dIn.x + dirs[major]!.x * 0.5, y: dIn.y + dirs[major]!.y * 0.5 }
  const ll = len(lean.x, lean.y)
  const tS = { x: lean.x / ll, y: lean.y / ll }
  /** 从 tS 朝 to 转 deg 度，不转过 to 以外 limitDeg */
  const turn = (to: Point, deg: number, limitDeg: number): Point => {
    const want = wrapAngle(Math.atan2(to.y, to.x) - Math.atan2(tS.y, tS.x))
    const a = Math.sign(want) * Math.min(deg * DEG, Math.abs(want) + limitDeg * DEG)
    return { x: tS.x * Math.cos(a) - tS.y * Math.sin(a), y: tS.x * Math.sin(a) + tS.y * Math.cos(a) }
  }
  const tMajor = turn(dirs[major]!, between(rng, nw.majorTurnDeg), 0)
  const tMinor = turn(dirs[minor]!, between(rng, nw.minorTurnDeg), 18)
  const qMajor = cfg.flow.discharge * cfg.flow.share
  const qMinor = cfg.flow.discharge - qMajor
  /** 蜿蜒得弯太急就减小幅度再来，减到不蜿蜒还急就不要这一组；起点 skip 格以内（深潭里）不管 */
  const reachOf = (a: Point, ta: Point, b: Point, tb: Point, q: number, level0: number, k: number, widen: number, skip: number): Reach | null => {
    for (const m of [1, 0.55, 0.25, 0]) {
      const r = makeReach(cfg, route(rng, a, ta, b, tb, nw.meanderU * m, seed + 51 + k), q, level0, seed + 61 + k, widen)
      let ok = true
      for (let i = 0; i < r.x.length && ok; i++) if (r.s[i]! > skip && Math.abs(r.curv[i]!) * r.half[i]! * 2 * nw.minBend > 1) ok = false
      if (ok) return r
    }
    return null
  }
  const mainR = reachOf(pool, { x: -nIn.x, y: -nIn.y }, split, tS, cfg.flow.discharge, 0, 0, 0.18, poolR)
  if (!mainR) return null
  const splitLevel = mainR.level[mainR.level.length - 1]!
  const majR = reachOf(split, tMajor, ex[major]!, exN[major]!, qMajor, splitLevel, 1, 0, 0)
  const minR = reachOf(split, tMinor, ex[minor]!, exN[minor]!, qMinor, splitLevel, 2, 0, 0)
  if (!majR || !minR) return null
  const reaches = [mainR, majR, minR]
  if (!fits(cfg, shape, reaches, [{ x: pool.x, y: pool.y }, ex[major]!, ex[minor]!])) return null
  const outlets: Outlet[] = [majR, minR].map((r, k) => {
    const p = ex[k === 0 ? major : minor]!
    const o = exN[k === 0 ? major : minor]!
    const last = r.x.length - 1
    return { x: p.x, y: p.y, nx: o.x, ny: o.y, half: r.half[last]!, level: r.level[last]! }
  })
  const lip = { x: foot.x + nIn.x * cfg.falls.cliffU, y: foot.y + nIn.y * cfg.falls.cliffU }
  const upA = aIn + (rng.next() * 2 - 1) * 0.5
  const far = { x: lip.x + Math.cos(upA) * REACH_OUT_U, y: lip.y + Math.sin(upA) * REACH_OUT_U }
  const upPts = route(rng, far, { x: -Math.cos(upA), y: -Math.sin(upA) }, lip, { x: -nIn.x, y: -nIn.y }, nw.meanderU * 0.8, seed + 54)
  const upstream = makeReach(cfg, upPts, cfg.flow.discharge, 0, seed + 64, 0)
  const lift = cfg.falls.cliffM - upstream.level[upstream.level.length - 1]!
  for (let i = 0; i < upstream.level.length; i++) upstream.level[i] = upstream.level[i]! + lift
  const gorges = outlets.map((o, k) => {
    const a = Math.atan2(o.ny, o.nx) + (rng.next() * 2 - 1) * 0.6
    const end = { x: o.x + Math.cos(a) * REACH_OUT_U, y: o.y + Math.sin(a) * REACH_OUT_U }
    const g = makeReach(cfg, route(rng, o, { x: o.nx, y: o.ny }, end, { x: Math.cos(a), y: Math.sin(a) }, nw.meanderU * 0.5, seed + 71 + k), 1, o.level, seed + 81 + k, 0)
    for (let i = 0; i < g.half.length; i++) {
      g.half[i] = o.half + 0.45 + 0.1 * g.s[i]! + (fbm(g.s[i]! / 3, 9.1, seed + 91 + k, 2) - 0.5) * 0.8
      g.level[i] = o.level - cfg.falls.gorgeM
    }
    return g
  })
  const inlet: Inlet = { x: foot.x, y: foot.y, nx: -nIn.x, ny: -nIn.y, poolX: pool.x, poolY: pool.y, poolR, half: main.half * 0.75, top: cfg.falls.cliffM }
  return { shape, reaches, upstream, gorges, inlet, outlets, aIn, span: (bayR * 1.3 + 2.5) / r0 }
}

/** 河网合格：弯道不急过 minBend 倍河宽；河岸离空地边至少 edgeGapU（出入口附近除外）；两股分开以后之间留出一片地 */
function fits(cfg: RiverConfig, sh: Shape, reaches: readonly Reach[], ports: readonly Point[]): boolean {
  const nw = cfg.network
  for (const r of reaches) {
    const n = r.x.length
    for (let i = 0; i < n; i++) {
      const x = r.x[i]!
      const y = r.y[i]!
      let near = Infinity
      for (const p of ports) near = Math.min(near, len(x - p.x, y - p.y))
      const need = r.half[i]! + cfg.flow.bankU + nw.edgeGapU
      if (near > need + 3 && clearingDepth(sh, x, y) < need) return false
    }
  }
  const [mainR, a, b] = reaches as [Reach, Reach, Reach]
  const sx = a.x[0]!
  const sy = a.y[0]!
  const room = cfg.flow.bankU * 2 + 1.5
  /** 两段河道上任意两点要隔开两岸加一片地，离分叉点近的按离分叉点的远近放宽 */
  const apart = (p: Reach, q: Reach, near: number): boolean => {
    for (let i = 0; i < p.x.length; i += 2) {
      const pd = len(p.x[i]! - sx, p.y[i]! - sy)
      for (let j = 0; j < q.x.length; j += 2) {
        const d = len(p.x[i]! - q.x[j]!, p.y[i]! - q.y[j]!)
        const need = Math.min(p.half[i]! + q.half[j]! + room, near * (pd + len(q.x[j]! - sx, q.y[j]! - sy)))
        if (d < need) return false
      }
    }
    return true
  }
  if (!apart(a, b, 0.42) || !apart(a, mainR, 0.6) || !apart(b, mainR, 0.6)) return false
  return mainR.s[mainR.s.length - 1]! >= 5 && a.s[a.s.length - 1]! >= 8 && b.s[b.s.length - 1]! >= 8
}

/**
 * 地形高程（米）：每段河道各自算出断面、岸坡与滩地，平滑取最低；崖下挖出深潭；进水口背后的空地外立起崖与崖顶的台地，台地上刻出溪沟；
 * 出水口外是深谷；空地外的岩石区隆起成块的岩石，林子里地面略高
 */
function terrainOf(cfg: RiverConfig, d: Draft, forestSeed: number, x0: number, y0: number, cols: number, rows: number): Terrain {
  const cell = cfg.cellU
  const n = cols * rows
  const z = new Float32Array(n)
  const level = new Float32Array(n)
  const edgeF = new Float32Array(n)
  const barF = new Float32Array(n)
  const clear = new Float32Array(n)
  const forest = new Float32Array(n)
  const upF = new Float32Array(n)
  const gorge = new Float32Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const f = cfg.flow
  const fl = cfg.falls
  const seed = d.shape.seed
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = x0 + (cx + 0.5) * cell
      const y = y0 + (cy + 0.5) * cell
      let g = Infinity
      let nearLevel = 0
      let nearD = Infinity
      let bar = 0
      for (const r of d.reaches) {
        project(r, x, y, tmp)
        const h = reachGround(cfg, r, tmp)
        g = g === Infinity ? h : smin(g, h, 0.12)
        const edge = Math.abs(tmp.n) - at(r.half, tmp)
        if (edge < nearD) {
          nearD = edge
          nearLevel = at(r.level, tmp)
          const sh = at(r.shift, tmp)
          bar = sh * tmp.n < 0 ? Math.abs(sh) / Math.max(1e-6, f.thalwegShift) : 0
        }
      }
      const relief = (fbm(x / 6, y / 6, seed + 5, 3) - 0.5) * 2 * f.reliefM + (fbm(x / 1.7, y / 1.7, seed + 6, 2) - 0.5) * 0.08
      g += relief * smooth(0.5, 2.5, nearD - f.bankU)
      const pd = len(x - d.inlet.poolX, y - d.inlet.poolY) / d.inlet.poolR
      if (pd < 1) g = Math.min(g, -fl.poolM * (1 - pd ** 2.4))
      const inside = clearingDepth(d.shape, x, y)
      const out = -inside
      const up = out > 0 ? upland(d, d.aIn, d.span, x, y, tmp) : 0
      const fo = forestness(cfg, forestSeed, x, y)
      const i = cy * cols + cx
      if (out > 0) {
        const rise = smooth(0, fl.cliffU, out) * (fl.cliffM + (fbm(x / 3, y / 3, seed + 7, 2) - 0.5) * 0.5) * up
        const q = cellNearest(x * 0.8, y * 0.8, seed + 9)
        const block = (0.6 + 0.8 * q.h) * smooth(0, 1.4, out) * (1 - fo)
        g = Math.max(g, nearLevel + f.bankM) + rise + block * 1.3 + fo * 0.08 * smooth(0, 1, out)
        if (up > 0 && out > fl.cliffU * 0.95) {
          project(d.upstream, x, y, tmp)
          if (tmp.s > 0.05) {
            g = Math.min(g, reachGround(cfg, d.upstream, tmp) + (fbm(x / 2, y / 2, seed + 8, 2) - 0.5) * 0.3 * smooth(1, 3, tmp.d))
            const edge = Math.abs(tmp.n) - at(d.upstream.half, tmp)
            if (edge < nearD) {
              nearD = edge
              nearLevel = at(d.upstream.level, tmp)
              bar = 0
            }
          }
        }
      }
      const gd = gorgeDepthAt(d, x, y, tmp)
      if (gd > -0.7) {
        const wall = smooth(-0.7, 0.35, gd)
        g = g + (Math.min(g, nearLevel) - fl.gorgeM - g) * wall
      }
      z[i] = g
      level[i] = len(x - d.inlet.poolX, y - d.inlet.poolY) < d.inlet.poolR ? Math.max(0, nearLevel) : nearLevel
      edgeF[i] = nearD
      barF[i] = bar
      clear[i] = inside
      forest[i] = fo
      upF[i] = up
      gorge[i] = Math.max(-20, gd)
    }
  }
  return { cols, rows, cell, x0, y0, z, level, edge: edgeF, bar: barF, clear, forest, up: upF, gorge }
}

/** 石头顶出地面：圆顶，边上贴着地面 */
function stampBoulders(t: Terrain, boulders: readonly Boulder[]): void {
  const { cols, rows, cell, x0, y0, z } = t
  for (const b of boulders) {
    const c0 = Math.max(0, Math.floor((b.x - b.r - x0) / cell))
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.r - x0) / cell))
    const r0 = Math.max(0, Math.floor((b.y - b.r - y0) / cell))
    const r1 = Math.min(rows - 1, Math.ceil((b.y + b.r - y0) / cell))
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const dd = len(x0 + (cx + 0.5) * cell - b.x, y0 + (cy + 0.5) * cell - b.y) / b.r
        if (dd >= 1) continue
        const i = cy * cols + cx
        z[i] = Math.max(z[i]!, b.top - (b.top - z[i]!) * (1 - Math.sqrt(1 - dd * dd)) ** 1.5)
      }
    }
  }
}

/** 地形上 (x, y) 格处双线性插值的高程 */
export function heightAt(t: Terrain, x: number, y: number): number {
  const u = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / t.cell - 0.5))
  const v = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / t.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * t.cols + ix
  const a = t.z[i]!
  const b = t.z[i + 1]!
  const c = t.z[i + t.cols]!
  const e = t.z[i + t.cols + 1]!
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy
}

/** 离河道多远：到最近一段河道水边的距离，格，水里为负 */
export function waterEdgeAt(reaches: readonly Reach[], x: number, y: number, tmp: Along): number {
  let best = Infinity
  for (const r of reaches) {
    project(r, x, y, tmp)
    best = Math.min(best, Math.abs(tmp.n) - at(r.half, tmp))
  }
  return best
}

/**
 * 树：林子里按泊松盘撒树冠，靠空地的一排树冠伸进空地；再从空地边长出几条林舌，空地里种几丛树和几棵孤树，都离河岸、出入口有一段距离
 */
function plantTrees(cfg: RiverConfig, rng: Rng, d: Draft, forestSeed: number, x0: number, y0: number, x1: number, y1: number): Tree[] {
  const t = cfg.trees
  const trees: Tree[] = []
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const ports: Point[] = [{ x: d.inlet.poolX, y: d.inlet.poolY }, ...d.outlets]
  const free = (x: number, y: number, r: number, overlap: number): boolean => {
    for (const o of trees) if (len(o.x - x, o.y - y) < (o.r + r) * overlap) return false
    return true
  }
  const nearRiver = (x: number, y: number): number => waterEdgeAt(d.reaches, x, y, tmp) - cfg.flow.bankU
  const add = (x: number, y: number, r: number): void => {
    trees.push({ x, y, r, h: 2 * r * cfg.meterPerU * (1.4 + rng.next() * 0.5) })
  }
  const area = (x1 - x0) * (y1 - y0)
  for (let k = 0; k < area * 1.2; k++) {
    const x = x0 + rng.next() * (x1 - x0)
    const y = y0 + rng.next() * (y1 - y0)
    const r = between(rng, t.crownU)
    const out = -clearingDepth(d.shape, x, y)
    if (out < r * 0.35) continue
    if (forestness(cfg, forestSeed, x, y) < 0.5) continue
    if (upland(d, d.aIn, d.span, x, y, tmp) > 0.2 && out < cfg.falls.cliffU + r * 0.8) continue
    if (gorgeDepthAt(d, x, y, tmp) > -r - 0.8) continue
    project(d.upstream, x, y, tmp)
    if (tmp.d < at(d.upstream.half, tmp) + r * 0.6) continue
    if (nearRiver(x, y) < r * 0.5) continue
    let port = Infinity
    for (const p of ports) port = Math.min(port, len(p.x - x, p.y - y))
    if (port < r + 3) continue
    if (!free(x, y, r, 0.78)) continue
    add(x, y, r)
  }
  const inner = (x: number, y: number, r: number, gap: number): boolean => {
    if (clearingDepth(d.shape, x, y) < r + gap) return false
    if (nearRiver(x, y) < r + 1.5) return false
    for (const p of ports) if (len(p.x - x, p.y - y) < r + 5) return false
    return free(x, y, r, 1.05)
  }
  const tongues = Math.round(between(rng, t.tongues))
  for (let k = 0, made = 0; k < 40 && made < tongues; k++) {
    const a = rng.next() * Math.PI * 2
    const e = edgeAlong(d.shape, a)
    if (forestness(cfg, forestSeed, e.x, e.y) < 0.5) continue
    const o = outwardAt(d.shape, e.x, e.y)
    const count = 2 + Math.floor(rng.next() * 3)
    const bendA = (rng.next() * 2 - 1) * 0.5
    const pts: Point[] = []
    let ok = true
    for (let i = 0; i < count; i++) {
      const r = between(rng, t.crownU) * (1 - i * 0.12)
      const dd = 0.4 + i * 1.5
      const a2 = Math.atan2(-o.y, -o.x) + bendA * (i / count)
      const x = e.x + Math.cos(a2) * dd
      const y = e.y + Math.sin(a2) * dd
      if (nearRiver(x, y) < r + 1.5 || !free(x, y, r, 0.7)) {
        ok = false
        break
      }
      for (const p of ports) if (len(p.x - x, p.y - y) < r + 5) ok = false
      pts.push({ x, y })
      add(x, y, r)
    }
    if (ok && pts.length > 0) made++
    else trees.splice(trees.length - pts.length, pts.length)
  }
  const groves = Math.round(between(rng, t.groves))
  for (let k = 0, made = 0; k < 60 && made < groves; k++) {
    const x = d.shape.cx + (rng.next() * 2 - 1) * d.shape.r0
    const y = d.shape.cy + (rng.next() * 2 - 1) * d.shape.r0
    const r = between(rng, t.crownU)
    if (!inner(x, y, r, 2.5)) continue
    add(x, y, r)
    const more = 1 + Math.floor(rng.next() * 3)
    for (let i = 0; i < more; i++) {
      const a = rng.next() * Math.PI * 2
      const r2 = between(rng, t.crownU) * 0.85
      const x2 = x + Math.cos(a) * (r + r2) * 0.75
      const y2 = y + Math.sin(a) * (r + r2) * 0.75
      if (clearingDepth(d.shape, x2, y2) > r2 + 1.5 && nearRiver(x2, y2) > r2 + 1.5 && free(x2, y2, r2, 0.7)) add(x2, y2, r2)
    }
    made++
  }
  const lone = Math.round(between(rng, t.lone))
  for (let k = 0, made = 0; k < 60 && made < lone; k++) {
    const x = d.shape.cx + (rng.next() * 2 - 1) * d.shape.r0
    const y = d.shape.cy + (rng.next() * 2 - 1) * d.shape.r0
    const r = between(rng, t.crownU) * 0.8
    if (!inner(x, y, r, 3)) continue
    add(x, y, r)
    made++
  }
  return trees
}

/** 石头：河里几块露出水面的大石，空地上几块，都不挡死河道、不堵出入口 */
function placeBoulders(cfg: RiverConfig, rng: Rng, d: Draft): Boulder[] {
  const rc = cfg.rocks
  const out: Boulder[] = []
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const ports: Point[] = [{ x: d.inlet.poolX, y: d.inlet.poolY }, ...d.outlets]
  const clear = (x: number, y: number, r: number): boolean => {
    for (const b of out) if (len(b.x - x, b.y - y) < b.r + r + 1.2) return false
    for (const p of ports) if (len(p.x - x, p.y - y) < r + 3.5) return false
    return true
  }
  const inRiver = Math.round(between(rng, rc.inRiver))
  for (let k = 0, made = 0; k < 80 && made < inRiver; k++) {
    const r = d.reaches[Math.floor(rng.next() * d.reaches.length)]!
    const L = r.s[r.s.length - 1]!
    const s = 2 + rng.next() * (L - 4)
    const i = Math.min(r.x.length - 1, Math.round(s / (L / (r.x.length - 1))))
    const half = r.half[i]!
    const rad = between(rng, rc.radiusU) * Math.min(1, half / 3)
    const lat = (rng.next() * 2 - 1) * (half - rad) * 0.7
    const x = r.x[i]! - r.ty[i]! * lat
    const y = r.y[i]! + r.tx[i]! * lat
    if (!clear(x, y, rad)) continue
    let crowded = false
    for (const o of d.reaches) {
      if (o === r) continue
      project(o, x, y, tmp)
      if (Math.abs(tmp.n) < at(o.half, tmp) + 2) crowded = true
    }
    if (crowded) continue
    out.push({ x, y, r: rad, top: r.level[i]! + between(rng, rc.heightM) })
    made++
  }
  const onLand = Math.round(between(rng, rc.onLand))
  for (let k = 0, made = 0; k < 80 && made < onLand; k++) {
    const x = d.shape.cx + (rng.next() * 2 - 1) * d.shape.r0
    const y = d.shape.cy + (rng.next() * 2 - 1) * d.shape.r0
    const rad = between(rng, rc.radiusU)
    if (clearingDepth(d.shape, x, y) < rad + 1.5 || waterEdgeAt(d.reaches, x, y, tmp) < rad + cfg.flow.bankU + 1 || !clear(x, y, rad)) continue
    out.push({ x, y, r: rad, top: NaN })
    made++
  }
  return out
}

/**
 * 能走的地面：空地里扣掉树冠（伸进空地的树冠下留 overhangU 能走）、石头与深谷，再加上出水口断崖外那一小段（水能把东西冲过去）；
 * 只留与开局站位连通的一块
 */
function basinOf(cfg: RiverConfig, d: Draft, trees: readonly Tree[], boulders: readonly Boulder[], start: Point, x0: number, y0: number, cols: number, rows: number, cellU: number): Basin {
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const over = cfg.trees.overhangU
  const lip = (x: number, y: number): boolean => {
    for (const o of d.outlets) {
      const ax = x - o.x
      const ay = y - o.y
      const along = ax * o.nx + ay * o.ny
      const side = ax * -o.ny + ay * o.nx
      if (along > -0.5 && along < cfg.falls.lipU && Math.abs(side) < o.half) return true
    }
    return false
  }
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    if (lip(x, y)) return true
    if (clearingDepth(d.shape, x, y) <= 0) return false
    for (const t of trees) if (len(t.x - x, t.y - y) < t.r - over) return false
    for (const b of boulders) if (len(b.x - x, b.y - y) < b.r) return false
    return gorgeDepthAt(d, x, y, tmp) < -0.6
  }
  return makeBasin(open, x0 * UNIT, y0 * UNIT, cols, rows, cellU * UNIT, { x: start.x * UNIT, y: start.y * UNIT }, cfg.clearing.neckU * UNIT)
}

/** 开局站位：离河岸、树和空地边都至少几格的干地上，挑离空地中心最近的一处 */
function startOf(cfg: RiverConfig, d: Draft, trees: readonly Tree[], boulders: readonly Boulder[]): Point | null {
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  let best: Point | null = null
  let bestD = Infinity
  const r0 = d.shape.r0
  for (let gy = -r0; gy <= r0; gy += 0.5) {
    for (let gx = -r0; gx <= r0; gx += 0.5) {
      const x = d.shape.cx + gx
      const y = d.shape.cy + gy
      if (clearingDepth(d.shape, x, y) < 4) continue
      if (waterEdgeAt(d.reaches, x, y, tmp) < cfg.flow.bankU + 2.5) continue
      let ok = true
      for (const t of trees) if (len(t.x - x, t.y - y) < t.r + 2) ok = false
      for (const b of boulders) if (len(b.x - x, b.y - y) < b.r + 2) ok = false
      if (!ok) continue
      const dd = len(gx, gy)
      if (dd < bestD) {
        bestD = dd
        best = { x, y }
      }
    }
  }
  return best
}

/** 把整张图平移 (dx, dy) 格 */
function shiftDraft(d: Draft, dx: number, dy: number): Draft {
  const move = (r: Reach): Reach => {
    for (let i = 0; i < r.x.length; i++) {
      r.x[i] = r.x[i]! + dx
      r.y[i] = r.y[i]! + dy
    }
    r.box.set(boxOf(r.x, r.y))
    return r
  }
  d.reaches.forEach(move)
  move(d.upstream)
  d.gorges.forEach(move)
  const sh = d.shape
  return {
    ...d,
    shape: { ...sh, cx: sh.cx + dx, cy: sh.cy + dy, bay: sh.bay ? { ...sh.bay, x: sh.bay.x + dx, y: sh.bay.y + dy } : null },
    inlet: { ...d.inlet, x: d.inlet.x + dx, y: d.inlet.y + dy, poolX: d.inlet.poolX + dx, poolY: d.inlet.poolY + dy },
    outlets: d.outlets.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
  }
}

/** 空地的外接框：沿方位角细扫边界 */
function bounds(sh: Shape): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let k = 0; k < 720; k++) {
    const p = edgeAlong(sh, (k / 720) * Math.PI * 2)
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  if (sh.bay) {
    x0 = Math.min(x0, sh.bay.x - sh.bay.r)
    y0 = Math.min(y0, sh.bay.y - sh.bay.r)
    x1 = Math.max(x1, sh.bay.x + sh.bay.r)
    y1 = Math.max(y1, sh.bay.y + sh.bay.r)
  }
  return { x0, y0, x1, y1 }
}

/** 定好形状的一张图：河网、树、石头与开局站位，还没算地形 */
interface Sketch {
  readonly d: Draft
  readonly w: number
  readonly h: number
  readonly trees: readonly Tree[]
  readonly boulders: readonly Boulder[]
  readonly start: Point
  readonly forestSeed: number
}

/** 按半径 r0 定形状：河网不合格就换随机数重来 */
function sketch(cfg: RiverConfig, seed: number, r0: number): Sketch | null {
  const rng = new Rng(scramble(seed))
  const shapeSeed = Math.floor(rng.next() * 0x7fffffff)
  const forestSeed = Math.floor(rng.next() * 0x7fffffff)
  for (let k = 0; k < TRIES; k++) {
    const raw = network(cfg, rng, r0, shapeSeed + k * 131)
    if (!raw) continue
    const box = bounds(raw.shape)
    const pad = cfg.clearing.padU
    const w = Math.ceil(box.x1 - box.x0 + pad * 2)
    const h = Math.ceil(box.y1 - box.y0 + pad * 2)
    const d = shiftDraft(raw, (w - (box.x1 - box.x0)) / 2 - box.x0, (h - (box.y1 - box.y0)) / 2 - box.y0)
    const boulders = placeBoulders(cfg, rng, d)
    const trees = plantTrees(cfg, rng, d, forestSeed, -TERRAIN_PAD_U - 2, -TERRAIN_PAD_U - 2, w + TERRAIN_PAD_U + 2, h + TERRAIN_PAD_U + 2)
    const start = startOf(cfg, d, trees, boulders)
    if (start) return { d, w, h, trees, boulders, start, forestSeed }
  }
  return null
}

/** 能走的地面按 cell 格的格子栅格化，量出面积，格² */
function measured(cfg: RiverConfig, k: Sketch, cell: number): { basin: Basin; area: number } {
  const basin = basinOf(cfg, k.d, k.trees, k.boulders, k.start, -cell, -cell, Math.ceil(k.w / cell) + 2, Math.ceil(k.h / cell) + 2, cell)
  let cells = 0
  for (let i = 0; i < basin.room.length; i++) if (basin.room[i]! > 0) cells++
  return { basin, area: cells * cell * cell }
}

let last: { cfg: RiverConfig; seed: number; plan: RiverPlan } | null = null

/**
 * 按种子生成河流地图：先按目标面积定空地的半径，粗量能走的面积，不在范围里就按面积比缩放半径重定形状；
 * 形状定了再算地形与细的距离场。同一张图的视图与规则各要一次，记住最近一张
 */
export function riverPlan(cfg: RiverConfig, seed: number): RiverPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const [lo, hi] = cfg.clearing.areaU2
  const want = (lo + hi) / 2
  let r0 = Math.sqrt(want / Math.PI) * 1.08
  let k: Sketch | null = null
  for (let n = 0; n < 6; n++) {
    k = sketch(cfg, seed, r0)
    if (!k) throw new Error(`河流地图生成不出来：种子 ${seed}`)
    const area = measured(cfg, k, BASIN_CELL_U * 2).area
    if (Math.abs(area - want) < (hi - lo) * 0.3) break
    r0 *= Math.sqrt(want / area)
  }
  const { d, w, h, trees, start, forestSeed } = k!
  const rng = new Rng(scramble(seed) ^ 0x2b0d)
  const terrain = terrainOf(cfg, d, forestSeed, -TERRAIN_PAD_U, -TERRAIN_PAD_U, Math.ceil((w + TERRAIN_PAD_U * 2) / cfg.cellU), Math.ceil((h + TERRAIN_PAD_U * 2) / cfg.cellU))
  const boulders = k!.boulders.map((b) => (Number.isNaN(b.top) ? { ...b, top: heightAt(terrain, b.x, b.y) + between(rng, cfg.rocks.heightM) } : b))
  stampBoulders(terrain, boulders)
  const { basin, area } = measured(cfg, { ...k!, boulders }, BASIN_CELL_U)
  const plan: RiverPlan = { ...d, seed, w, h, terrain, basin, trees, boulders, start, area, forestSeed }
  last = { cfg, seed, plan }
  return plan
}
