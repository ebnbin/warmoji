import { fbm } from '../../util/noise.ts'
import type { ChannelConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 中线按这个弧长间隔取点，格 */
const STEP_U = 0.2
/** 重力加速度，米/秒² */
export const GRAVITY = 9.81

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
/** 比 Math.hypot 快得多：生成时每格要算上千次距离 */
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)

/** 按流量定河道要的参数：一格多少米与河道的水力几何 */
export interface Channel {
  readonly meterPerU: number
  readonly flow: ChannelConfig
}

/**
 * 一段河道的中线与断面，格与米：逐点的位置、单位切向、离起点的弧长、曲率（朝左法线 (−ty, tx) 转为正），
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
  /** 设计流量（米³/秒）、平均流速（米/秒）与水面坡降 */
  readonly q: number
  readonly speed: number
  readonly slope: number
}

export function hermite(a: Point, ta: Point, b: Point, tb: Point, k: number, n: number): Point[] {
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


/** 按弧长等距重新取点，算出切向、弧长与曲率 */
export function resample(pts: readonly Point[]): { x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array; s: Float64Array; curv: Float64Array } {
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
export function hydraulics(cfg: Channel, q: number): { half: number; dmax: number; slope: number; speed: number } {
  const f = cfg.flow
  const W = f.widthCoef * Math.sqrt(q)
  const D = f.depthCoef * q ** 0.4
  const dmax = (D * (f.bedShape + 1)) / f.bedShape
  const K = (dmax ** (5 / 3) * (W / 2) * conveyanceShape(f.bedShape)) / f.manning
  return { half: W / 2 / cfg.meterPerU, dmax, slope: (q / K) ** 2, speed: q / (W * D) }
}

/**
 * 石槛的槛顶高程（米）：流量 q 按临界流漫过半宽 half 格的槛顶时，槛上游的比能比槛顶高 1.5 倍临界水深 (q²/g)^(1/3)（q 按单宽），
 * 槛顶取设计水位 level 往下这么多，槛上游的水面就托在设计水位上（差一个几厘米的流速水头）
 */
export function crestOf(cfg: Channel, q: number, half: number, level: number): number {
  const unit = q / (2 * half * cfg.meterPerU)
  return level - 1.5 * Math.cbrt((unit * unit) / GRAVITY)
}

/**
 * 把中线做成河道：水面半宽沿程略有起伏，弯顶冲出深潭、两弯之间是浅滩，深泓偏向凹岸（按带正负的弯度平滑，过拐点时连续地换到另一岸）；
 * 水面从 level0 起按坡降往下游降，widen 让末端几格放宽
 */
export function makeReach(cfg: Channel, pts: readonly Point[], q: number, level0: number, seed: number, widen: number, narrow = 1): Reach {
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
  for (let i = 0; i < n; i++) bend[i] = Math.max(-1, Math.min(1, g.curv[i]! * hy.half * 2 * 2.5))
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
    half[i] = hy.half * narrow * (1 + (fbm(s / 4, 3.3, seed, 2) - 0.5) * 0.25) * (1 + widen * smooth(L - 4, L, s))
    depth[i] = hy.dmax * (f.riffle + (f.pool - f.riffle) * Math.abs(b))
    shift[i] = -f.thalwegShift * b
    level[i] = level0 - hy.slope * s * cfg.meterPerU
  }
  return { ...g, half, depth, shift, level, q, speed: hy.speed, slope: hy.slope }
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
  for (let pass = 0; pass < 2; pass++) {
    const from = pass === 0 ? 0 : Math.max(0, bi - PROBE)
    const to = pass === 0 ? n - 1 + PROBE : Math.min(n - 1, bi + PROBE)
    const step = pass === 0 ? PROBE : 1
    for (let k = from; k <= to; k += step) {
      const i = Math.min(k, n - 1)
      const dx = x - r.x[i]!
      const dy = y - r.y[i]!
      const d = dx * dx + dy * dy
      if (d < best) {
        best = d
        bi = i
      }
    }
  }
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
function profile(xi: number, c: number, p: number): number {
  const u = xi >= c ? (xi - c) / (1 - c) : (c - xi) / (1 + c)
  return u >= 1 ? 0 : 1 - u ** p
}

/** 河岸的宽：凸岸的边滩缓、凹岸的切岸陡 */
function bankWidth(cfg: Channel, shift: number, side: number): number {
  const outer = shift * side > 0
  const b = Math.abs(shift) / Math.max(1e-6, cfg.flow.thalwegShift)
  return cfg.flow.bankU * (outer ? 1 - 0.45 * b : 1 + 1.6 * b)
}

/** 一段河道在 (x, y) 处的地面高程（米）：水下是断面，岸坡 S 形升到岸顶，岸顶以外的滩地缓缓抬高 */
export function reachGround(cfg: Channel, r: Reach, p: Along): number {
  const half = at(r.half, p)
  const lv = at(r.level, p)
  const sh = at(r.shift, p)
  const a = Math.abs(p.n)
  if (a < half) return lv - at(r.depth, p) * profile(p.n / half, sh, cfg.flow.bedShape)
  const bw = bankWidth(cfg, sh, Math.sign(p.n))
  const out = a - half
  return lv + cfg.flow.bankM * smooth(0, bw, out) + cfg.flow.floodSlope * Math.max(0, out - bw)
}

/** 一张按格子铺的高程（米）：格子 (0, 0) 的左上角在 (x0, y0) 格，边长 cell 格 */
export interface Heights {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly z: Float32Array
}

/** 地形上 (x, y) 格处双线性插值的高程 */
export function heightAt(t: Heights, x: number, y: number): number {
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
