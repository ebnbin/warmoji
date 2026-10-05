import { FRAME_U, SPAWN_CLEAR_U, UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { FRAME_MID } from '../frame.ts'
import { bilinear } from '../grid.ts'
import { Rng } from '../../util/rng.ts'
import type { FloeConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'

/** 重力加速度，米/秒² */
export const GRAVITY = 9.81

const DEG = Math.PI / 180

/** 一道重新冻住的裂缝：中线上的点与各点的半宽，像素 */
export interface Seam {
  readonly line: readonly Point[]
  readonly half: readonly number[]
}

/**
 * 一块浮冰：轮廓（像素，首尾不重复，冰心在方框正中）、新冰缝，以及铺满方框的格子上的场——到冰缘的有符号距离（格，冰上为正）、
 * 积雪深（米）、新冰的覆盖（0 到 1）。格子 (i, j) 的格心在 ((i + 0.5)·cell, (j + 0.5)·cell) 像素
 */
export interface FloeField {
  readonly outline: readonly Point[]
  readonly seams: readonly Seam[]
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly edge: Float32Array
  readonly snow: Float32Array
  readonly young: Float32Array
  /** 冰面的形心，像素 */
  readonly cx: number
  readonly cy: number
  /** 盛行风吹去的方向，弧度：雪堆顺着它拉长，阵风也从这边来 */
  readonly windAngle: number
  /** 老冰（不算雪）与新冰的冰面高出海面多少，米 */
  readonly freeboard: number
  readonly youngFreeboard: number
  readonly seed: number
}

/** 顶点的来历：大的角与豁口会被撞圆，长边中途的拐折圆得少，水道保持窄而尖 */
const CORNER = 0
const BEND = 1
const LEAD = 2

interface Vertex {
  x: number
  y: number
  k: typeof CORNER | typeof BEND | typeof LEAD
}

const lerp = (r: Rng, [a, b]: readonly [number, number]): number => a + (b - a) * r.next()
export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 保留 n·p ≤ d 的一侧 */
function clip(poly: Vertex[], nx: number, ny: number, d: number): Vertex[] {
  const out: Vertex[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const da = a.x * nx + a.y * ny - d
    const db = b.x * nx + b.y * ny - d
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, k: CORNER })
    }
  }
  return out
}

function centroid(p: readonly Point[]): Point {
  let cx = 0
  let cy = 0
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!
    const b = p[(i + 1) % p.length]!
    const c = a.x * b.y - b.x * a.y
    s += c
    cx += (a.x + b.x) * c
    cy += (a.y + b.y) * c
  }
  return { x: cx / (3 * s), y: cy / (3 * s) }
}

/** 四条主断裂边围出一块接近方形的冰，再随机用斜裂缝切掉几个角 */
function fractured(r: Rng, s: FloeConfig['shape'], half: number): Vertex[] {
  const big = half * 3
  let poly: Vertex[] = [
    { x: -big, y: -big, k: CORNER },
    { x: big, y: -big, k: CORNER },
    { x: big, y: big, k: CORNER },
    { x: -big, y: big, k: CORNER },
  ]
  const turn = (r.next() * 2 - 1) * s.turnDeg * DEG
  for (let i = 0; i < 4; i++) {
    const a = turn + (i * Math.PI) / 2 + (r.next() * 2 - 1) * s.sideDeg * DEG
    poly = clip(poly, Math.cos(a), Math.sin(a), half + (r.next() * 2 - 1) * s.sideU)
  }
  for (const c of poly.slice()) {
    if (r.next() >= s.cutChance) continue
    const a = Math.atan2(c.y, c.x) + (r.next() * 2 - 1) * 0.35
    const nx = Math.cos(a)
    const ny = Math.sin(a)
    poly = clip(poly, nx, ny, c.x * nx + c.y * ny - lerp(r, s.cutU))
  }
  return poly
}

/** 边 a→b 朝冰外的单位法线：轮廓顺时针走（y 朝下），冰在走向的右手边 */
function outward(a: Point, b: Point): Point {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
}

/** 长边上的裂缝不笔直：中途拐一两下，往里或往外 */
function bend(r: Rng, poly: Vertex[], bendU: number): Vertex[] {
  const out: Vertex[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    out.push(a)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 6) continue
    const n = outward(a, b)
    const at = len > 14 ? [0.2 + r.next() * 0.25, 0.55 + r.next() * 0.25] : [0.3 + r.next() * 0.4]
    for (const t of at) {
      const off = (r.next() * 2 - 1) * bendU * Math.min(1, len / 14)
      out.push({ x: a.x + (b.x - a.x) * t + n.x * off, y: a.y + (b.y - a.y) * t + n.y * off, k: BEND })
    }
  }
  return out
}

/** 挑一条够长、还没动过的边，按长度加权 */
function pickEdge(r: Rng, poly: readonly Vertex[], minLen: number, used: ReadonlySet<number>): number {
  let sum = 0
  const lens = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const ok = l >= minLen && !used.has(i) && a.k !== LEAD && b.k !== LEAD
    if (ok) sum += l
    return ok ? l : 0
  })
  if (sum <= 0) return -1
  let pick = r.next() * sum
  for (let i = 0; i < lens.length; i++) {
    pick -= lens[i]!
    if (lens[i]! > 0 && pick <= 0) return i
  }
  return lens.findIndex((l) => l > 0)
}

/** 边上掰掉一块：两三道裂缝伸进冰里交在一起，留下 V 形或梯形的豁口 */
function bite(r: Rng, poly: Vertex[], s: FloeConfig['shape'], used: Set<number>): Vertex[] {
  const w = lerp(r, s.biteWidthU)
  const i = pickEdge(r, poly, w + 4, used)
  if (i < 0) return poly
  const a = poly[i]!
  const b = poly[(i + 1) % poly.length]!
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const n = outward(a, b)
  const depth = lerp(r, s.biteDepthU)
  const lo = (w / 2 + 2) / len
  const mid = (lo + r.next() * (1 - 2 * lo)) * len
  const at = (t: number, d: number): Vertex => ({ x: a.x + ux * t - n.x * d, y: a.y + uy * t - n.y * d, k: CORNER })
  const skew = (r.next() * 2 - 1) * 0.25 * w
  const notch: Vertex[] = [at(mid - w / 2, 0)]
  if (r.next() < 0.4) notch.push(at(mid + skew, depth))
  else {
    const inner = w * (0.25 + r.next() * 0.3)
    notch.push(at(mid + skew - inner / 2, depth * (0.85 + r.next() * 0.15)), at(mid + skew + inner / 2, depth * (0.85 + r.next() * 0.15)))
  }
  notch.push(at(mid + w / 2, 0))
  const out = [...poly.slice(0, i + 1), ...notch, ...poly.slice(i + 1)]
  const shifted = new Set<number>()
  for (const u of used) shifted.add(u > i ? u + notch.length : u)
  used.clear()
  for (const u of shifted) used.add(u)
  for (let k = 0; k <= notch.length; k++) used.add(i + k)
  return out
}

/** 在多边形里吗（奇偶规则） */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** (x, y) 到线段 ab 的距离，及最近处在 ab 上的比例 */
function toSegment(x: number, y: number, a: Point, b: Point): { d: number; t: number } {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1)))
  return { d: Math.hypot(x - a.x - ex * t, y - a.y - ey * t), t }
}

/** 到轮廓的有符号距离：在冰上为正 */
export function depth(poly: readonly Point[], x: number, y: number): number {
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, toSegment(x, y, poly[j]!, poly[i]!).d)
  return inside(poly, x, y) ? d : -d
}

/** 裂缝中线上相邻两点的间距，格 */
const CRACK_STEP = 0.5

/**
 * 一道横贯冰面的裂缝：从一条边上的一点出发，一段段直着裂、段与段之间折一个角，大方向朝里，直到穿出冰面或在冰里止住。
 * 靠近起点的一段还没冻上（概率 leadChance），是一条越往里越窄的水道，挖进轮廓；其余部分冻成了宽窄不一的新冰
 */
function crack(r: Rng, poly: Vertex[], s: FloeConfig['shape'], used: Set<number>): { poly: Vertex[]; seam: Point[]; half: number[] } {
  const i = pickEdge(r, poly, 8, used)
  if (i < 0) return { poly, seam: [], half: [] }
  const a = poly[i]!
  const b = poly[(i + 1) % poly.length]!
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const n = outward(a, b)
  const t0 = (0.3 + r.next() * 0.4) * len
  const start = { x: a.x + ux * t0, y: a.y + uy * t0 }
  const base = Math.atan2(-n.y, -n.x) + (r.next() * 2 - 1) * 25 * DEG
  const line: Point[] = [start]
  const reach = s.spanU * (r.next() < 0.35 ? 0.45 + r.next() * 0.35 : 3)
  let heading = base
  let run = 0
  for (let seg = 0; seg < 40 && run < reach; seg++) {
    heading += (r.next() * 2 - 1) * 32 * DEG + (base - heading) * 0.45
    const steps = Math.max(2, Math.round((1.4 + r.next() * 3.6) / CRACK_STEP))
    let out = false
    for (let k = 0; k < steps; k++) {
      const p = line[line.length - 1]!
      const q = { x: p.x + Math.cos(heading) * CRACK_STEP, y: p.y + Math.sin(heading) * CRACK_STEP }
      line.push(q)
      run += CRACK_STEP
      if (line.length > 6 && !inside(poly, q.x, q.y)) {
        out = true
        break
      }
    }
    if (out) break
  }
  const width = lerp(r, s.seamWidthU) / 2
  const wobble = Math.floor(r.next() * 1e6)
  const half = line.map((_, k) => width * (0.5 + 0.8 * fbm(k * 0.11, 0.5, wobble, 2) + 0.25 * (fbm(k * 0.9, 3.5, wobble + 7, 2) - 0.5)))
  if (r.next() >= s.leadChance) return { poly, seam: line, half }
  const leadLen = lerp(r, s.leadU)
  const mouth = lerp(r, s.leadWidthU)
  const left: Vertex[] = []
  const right: Vertex[] = []
  let opened = 0
  let tip = 0
  for (let k = 1; k < line.length - 1 && opened < leadLen; k++) {
    const p = line[k - 1]!
    const q = line[k]!
    const o = line[k + 1]!
    opened += Math.hypot(q.x - p.x, q.y - p.y)
    tip = k
    const w = (mouth / 2) * Math.max(0, 1 - opened / leadLen) ** 0.8
    if (w < 0.05) break
    const d = Math.hypot(o.x - p.x, o.y - p.y) || 1
    const px = -(o.y - p.y) / d
    const py = (o.x - p.x) / d
    left.push({ x: q.x + px * w, y: q.y + py * w, k: LEAD })
    right.push({ x: q.x - px * w, y: q.y - py * w, k: LEAD })
  }
  const end = line[tip]!
  const dir0x = line[1]!.x - start.x
  const dir0y = line[1]!.y - start.y
  const side = dir0x * -uy + dir0y * ux
  const near: Vertex = { x: start.x - ux * (mouth / 2), y: start.y - uy * (mouth / 2), k: CORNER }
  const far: Vertex = { x: start.x + ux * (mouth / 2), y: start.y + uy * (mouth / 2), k: CORNER }
  const first = side >= 0 ? left : right
  const second = side >= 0 ? right : left
  const notch: Vertex[] = [near, ...first, { x: end.x, y: end.y, k: LEAD }, ...second.slice().reverse(), far]
  const out = [...poly.slice(0, i + 1), ...notch, ...poly.slice(i + 1)]
  for (let k = 0; k <= notch.length; k++) used.add(i + k)
  const from = Math.max(0, tip - 3)
  return { poly: out, seam: line.slice(from), half: half.slice(from) }
}

/** 凸角被撞圆，凹角稍微磨一点：用二次贝塞尔从角两边的切点过渡；水道里的点不动 */
function rounded(r: Rng, poly: readonly Vertex[], s: FloeConfig['shape']): Vertex[] {
  const out: Vertex[] = []
  for (let i = 0; i < poly.length; i++) {
    const v = poly[i]!
    const p = poly[(i + poly.length - 1) % poly.length]!
    const q = poly[(i + 1) % poly.length]!
    if (v.k === LEAD) {
      out.push(v)
      continue
    }
    const l1 = Math.hypot(v.x - p.x, v.y - p.y)
    const l2 = Math.hypot(q.x - v.x, q.y - v.y)
    const d1x = (v.x - p.x) / l1
    const d1y = (v.y - p.y) / l1
    const d2x = (q.x - v.x) / l2
    const d2y = (q.y - v.y) / l2
    const turn = Math.acos(Math.min(1, Math.max(-1, d1x * d2x + d1y * d2y)))
    if (turn < 0.12) {
      out.push(v)
      continue
    }
    const convex = d1x * d2y - d1y * d2x > 0
    const radius = convex ? lerp(r, s.roundU) * (v.k === BEND ? 0.5 : 1) : 0.4
    const inner = Math.PI - turn
    const t = Math.min(radius / Math.tan(inner / 2), 0.42 * Math.min(l1, l2))
    const ax = v.x - d1x * t
    const ay = v.y - d1y * t
    const bx = v.x + d2x * t
    const by = v.y + d2y * t
    const m = Math.max(2, Math.ceil(turn / 0.25))
    for (let k = 0; k <= m; k++) {
      const u = k / m
      const w0 = (1 - u) * (1 - u)
      const w1 = 2 * (1 - u) * u
      const w2 = u * u
      out.push({ x: ax * w0 + v.x * w1 + bx * w2, y: ay * w0 + v.y * w1 + by * w2, k: v.k })
    }
  }
  return out
}

/**
 * 断口的锯齿：沿轮廓每隔一小段取点，顺着法线按两层折线噪声推出推进——折线而不是平滑的波，断口才像一个个小断面；
 * 水道不推，免得把窄缝挤死，它自己的弯折已经够乱
 */
function jagged(r: Rng, poly: readonly Vertex[], jagU: number): Point[] {
  const n = poly.length
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % n]!
    cum[i + 1] = cum[i]! + Math.hypot(b.x - a.x, b.y - a.y)
  }
  const total = cum[n]!
  const coarse = Array.from({ length: Math.max(3, Math.round(total / 0.9)) }, () => r.next() * 2 - 1)
  const fine = Array.from({ length: Math.max(3, Math.round(total / 0.32)) }, () => r.next() * 2 - 1)
  const wave = (arr: readonly number[], s: number): number => {
    const f = (s / total) * arr.length
    const k = Math.floor(f)
    const t = f - k
    return arr[k % arr.length]! * (1 - t) + arr[(k + 1) % arr.length]! * t
  }
  const out: Point[] = []
  const count = Math.round(total / 0.25)
  let seg = 0
  for (let j = 0; j < count; j++) {
    const s = (j / count) * total
    while (seg < n - 1 && cum[seg + 1]! <= s) seg++
    const a = poly[seg]!
    const b = poly[(seg + 1) % n]!
    const l = cum[seg + 1]! - cum[seg]!
    const t = l > 0 ? (s - cum[seg]!) / l : 0
    const o = outward(a, b)
    const amp = a.k === LEAD || b.k === LEAD ? 0 : jagU
    const d = amp * (wave(coarse, s) * 0.7 + wave(fine, s) * 0.45)
    out.push({ x: a.x + (b.x - a.x) * t + o.x * d, y: a.y + (b.y - a.y) * t + o.y * d })
  }
  return out
}

/** 线段 ab 与 cd 相交（不算端点相接） */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, s: Point): number => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x)
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** 轮廓不自交 */
export function simple(p: readonly Point[]): boolean {
  const n = p.length
  for (let i = 0; i < n; i++) {
    const a = p[i]!
    const b = p[(i + 1) % n]!
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (crosses(a, b, p[j]!, p[(j + 1) % n]!)) return false
    }
  }
  return true
}

/** 新冰缝的边缘软过渡的半宽，格 */
const YOUNG_SOFT_U = 0.2

/** 新冰缝在 (x, y) 处的覆盖，0 到 1：到中线的距离比半宽近就是新冰，边缘留 soft 的过渡 */
function youngAt(line: readonly Point[], half: readonly number[], soft: number, x: number, y: number): number {
  let v = 0
  for (let i = 0; i + 1 < line.length; i++) {
    const { d, t } = toSegment(x, y, line[i]!, line[i + 1]!)
    const h = half[i]! + (half[i + 1]! - half[i]!) * t
    v = Math.max(v, 1 - smooth(h - soft, h + soft, d))
  }
  return v
}

/** 找冰心时一圈圈往外的步子，格 */
const HEART_STEP_U = 0.5

/**
 * 冰心，格：队伍从这里出发。冰心对准方框正中后，冰面要缩放到从冰心往四边最远伸出 reach 格，所以冰心离冰面外框的正中越近，冰面缩得越少：
 * 从外框正中一圈圈往外找，脚下不是新冰、缩放后离冰缘至少 room 格的点，最先找到的一圈里挑缩放后离冰缘最远的
 */
function heartOf(poly: readonly Point[], line: readonly Point[], half: readonly number[], reach: number, room: number): Point {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of poly) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  let best = { x: cx, y: cy }
  let top = -Infinity
  for (let n = 0; top < room && n * HEART_STEP_U <= Math.max(x1 - x0, y1 - y0) / 2; n++) {
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== n) continue
        const x = cx + i * HEART_STEP_U
        const y = cy + j * HEART_STEP_U
        if (youngAt(line, half, YOUNG_SOFT_U, x, y) > 0) continue
        const v = (depth(poly, x, y) * reach) / Math.max(x - x0, x1 - x, y - y0, y1 - y)
        if (v <= top) continue
        top = v
        best = { x, y }
      }
    }
  }
  return best
}

/**
 * 按断裂的成因生成一块浮冰的轮廓，格：四条主断裂边围出近似的方形，斜裂缝切掉几个角，长边中途拐折，
 * 边上掰掉一两块留下豁口，可能有一道伸进冰里的水道；大的凸角被撞圆，断口按两层折线噪声起锯齿。
 * 最后把冰心挪到原点，整体缩放到从冰心往四边最远伸出 spanU / 2 格。偶尔锯齿让轮廓自交，就换一组随机数重来
 */
export function floeOutline(seed: number, cfg: FloeConfig): { outline: Point[]; seams: { line: Point[]; half: number[] }[] } {
  const s = cfg.shape
  const half = s.spanU / 2
  for (let attempt = 0; ; attempt++) {
    const r = new Rng((seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0)
    let poly = bend(r, fractured(r, s, half), s.bendU)
    const used = new Set<number>()
    const bites = r.int(s.bites[0], s.bites[1])
    for (let k = 0; k < bites; k++) poly = bite(r, poly, s, used)
    const c = crack(r, poly, s, used)
    poly = c.poly
    const out = jagged(r, rounded(r, poly, s), s.jagU)
    const o = heartOf(out, c.seam, c.half, half, SPAWN_CLEAR_U)
    let reach = 0
    for (const p of out) reach = Math.max(reach, Math.abs(p.x - o.x), Math.abs(p.y - o.y))
    const k = half / reach
    const scale = (p: Point): Point => ({ x: (p.x - o.x) * k, y: (p.y - o.y) * k })
    const outline = out.map(scale)
    if (!simple(outline) && attempt < 40) continue
    return { outline, seams: c.seam.length > 1 ? [{ line: c.seam.map(scale), half: c.half.map((h) => h * k) }] : [] }
  }
}

const FAR = 1e9

/** 一维平方距离变换：d[q] = min_p (q − p)² + f[p] */
function sq1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -FAR
  z[1] = FAR
  for (let q = 1; q < n; q++) {
    let p = v[k]!
    let s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p)
    while (s <= z[k]!) {
      k--
      p = v[k]!
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p)
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = FAR
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!
  }
}

/** 每格到最近的 on 格的格心距离，以格计 */
function distanceTo(on: Uint8Array, cols: number, rows: number): Float64Array {
  const out = new Float64Array(cols * rows)
  const n = Math.max(cols, rows)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let i = 0; i < out.length; i++) out[i] = on[i] ? 0 : FAR
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = out[y * cols + x]!
    sq1d(f, rows, d, v, z)
    for (let y = 0; y < rows; y++) out[y * cols + x] = d[y]!
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = out[y * cols + x]!
    sq1d(f, cols, d, v, z)
    for (let x = 0; x < cols; x++) out[y * cols + x] = Math.sqrt(d[x]!)
  }
  return out
}

/** 精确算到冰缘距离的那一圈有多宽，格：再远的用格心之间的距离变换 */
const EXACT_U = 3

/**
 * 到冰缘的有符号距离，格：冰缘附近逐条边算到线段的精确距离，远处用距离变换补上；里外按格心在不在轮廓里定
 */
function edgeField(outline: readonly Point[], cols: number, rows: number, cell: number): Float32Array {
  const n = cols * rows
  const inside = new Uint8Array(n)
  const xs: number[] = []
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cell
    xs.length = 0
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!
      const b = outline[(i + 1) % outline.length]!
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k]! / cell - 0.5))
      const c1 = Math.min(cols - 1, Math.floor(xs[k + 1]! / cell - 0.5))
      for (let c = c0; c <= c1; c++) inside[r * cols + c] = 1
    }
  }
  const exact = new Float32Array(n).fill(FAR)
  const band = EXACT_U * UNIT
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len2 = ex * ex + ey * ey || 1
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - band) / cell))
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + band) / cell))
    const r0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - band) / cell))
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(a.y, b.y) + band) / cell))
    for (let r = r0; r <= r1; r++) {
      const y = (r + 0.5) * cell
      for (let c = c0; c <= c1; c++) {
        const x = (c + 0.5) * cell
        const u = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey) / len2))
        const dx = x - a.x - ex * u
        const dy = y - a.y - ey * u
        const d = Math.sqrt(dx * dx + dy * dy)
        const k = r * cols + c
        if (d < exact[k]!) exact[k] = d
      }
    }
  }
  const outside = new Uint8Array(n)
  for (let i = 0; i < n; i++) outside[i] = inside[i] ? 0 : 1
  const toOut = distanceTo(outside, cols, rows)
  const toIn = distanceTo(inside, cols, rows)
  const edge = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const far = (inside[i] ? toOut[i]! - 0.5 : toIn[i]! - 0.5) * cell
    const d = exact[i]! < band ? exact[i]! : Math.max(band, far)
    edge[i] = (inside[i] ? d : -d) / UNIT
  }
  return edge
}

/** 噪声拉开对比度落到 [0, 1] */
const spread = (n: number): number => Math.min(1, Math.max(0, (n - 0.5) * 2.4 + 0.5))

/** 新冰的覆盖：逐段在中线附近一圈里算到线段的距离，半宽沿线段插值，边缘留一点过渡 */
function youngField(seams: readonly Seam[], cols: number, rows: number, cell: number): Float32Array {
  const out = new Float32Array(cols * rows)
  const soft = YOUNG_SOFT_U * UNIT
  for (const s of seams) {
    for (let i = 0; i + 1 < s.line.length; i++) {
      const a = s.line[i]!
      const b = s.line[i + 1]!
      const ha = s.half[i]!
      const hb = s.half[i + 1]!
      const reach = Math.max(ha, hb) + soft
      const ex = b.x - a.x
      const ey = b.y - a.y
      const len2 = ex * ex + ey * ey || 1
      const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach) / cell))
      const c1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + reach) / cell))
      const r0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach) / cell))
      const r1 = Math.min(rows - 1, Math.ceil((Math.max(a.y, b.y) + reach) / cell))
      for (let r = r0; r <= r1; r++) {
        const y = (r + 0.5) * cell
        for (let c = c0; c <= c1; c++) {
          const x = (c + 0.5) * cell
          const u = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey) / len2))
          const dx = x - a.x - ex * u
          const dy = y - a.y - ey * u
          const d = Math.sqrt(dx * dx + dy * dy)
          const h = ha + (hb - ha) * u
          const v = 1 - smooth(h - soft, h + soft, d)
          const k = r * cols + c
          if (v > out[k]!) out[k] = v
        }
      }
    }
  }
  return out
}

/**
 * 按种子生成一块浮冰：先定轮廓与新冰缝，冰心摆到方框正中，再在铺满方框的格子上铺到冰缘的距离、新冰与积雪。
 * 积雪沿盛行风拉长成一条条雪堆，冰缘一圈被浪花打湿留不住雪，新冰上也没有雪；冰面高出海面多少按阿基米德由冰厚与平均雪载定
 */
export function makeFloe(seed: number, cfg: FloeConfig): FloeField {
  const { outline: shapeU, seams: seamsU } = floeOutline(seed, cfg)
  const cell = cfg.cellU * UNIT
  const cols = Math.ceil(FRAME_U / cfg.cellU)
  const rows = cols
  const toPx = (p: Point): Point => ({ x: FRAME_MID.x + p.x * UNIT, y: FRAME_MID.y + p.y * UNIT })
  const outline = shapeU.map(toPx)
  const seams = seamsU.map((s) => ({ line: s.line.map(toPx), half: s.half.map((h) => h * UNIT) }))
  const edge = edgeField(outline, cols, rows, cell)
  const n = cols * rows
  const young = youngField(seams, cols, rows, cell)
  const snow = new Float32Array(n)
  const r = new Rng(seed ^ 0x51ce)
  const windAngle = r.next() * Math.PI * 2
  const wc = Math.cos(windAngle)
  const ws = Math.sin(windAngle)
  const sn = cfg.snow
  const noiseSeed = Math.floor(r.next() * 0x7fffffff)
  let snowSum = 0
  let iceCells = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      const e = edge[k]!
      if (e <= 0) {
        young[k] = 0
        continue
      }
      const x = (i + 0.5) * cell
      const y = (j + 0.5) * cell
      const yg = young[k]!
      const xu = x / UNIT
      const yu = y / UNIT
      const along = (xu * wc + yu * ws) / (sn.waveU * 1.6)
      const across = (-xu * ws + yu * wc) / sn.waveU
      const drift = smooth(1 - sn.cover - 0.2, 1 - sn.cover + 0.2, spread(fbm(along, across, noiseSeed, 3)))
      const lumps = 0.5 + 0.5 * fbm(xu / 2.3, yu / 2.3, noiseSeed + 11, 2)
      const depth = sn.maxM * drift ** 1.5 * lumps * smooth(sn.bareU * 0.4, sn.bareU * 1.3, e) * (1 - yg)
      snow[k] = depth
      snowSum += depth
      iceCells++
    }
  }
  const c = centroid(outline)
  const ice = cfg.ice
  const sink = 1 - ice.density / ice.seaDensity
  const freeboard = ice.thicknessM * sink - ((iceCells > 0 ? snowSum / iceCells : 0) * sn.density) / ice.seaDensity
  return { outline, seams, cols, rows, cell, edge, snow, young, cx: c.x, cy: c.y, windAngle, freeboard, youngFreeboard: ice.youngM * sink, seed: noiseSeed }
}

const fieldCache = new WeakMap<FloeConfig, { readonly seed: number; readonly field: FloeField }>()

/** 同一个种子与配置只生成一次：视图排版时与模拟开局时各要一次 */
export function floeFor(seed: number, cfg: FloeConfig): FloeField {
  const hit = fieldCache.get(cfg)
  if (hit?.seed === seed) return hit.field
  const field = makeFloe(seed, cfg)
  fieldCache.set(cfg, { seed, field })
  return field
}

/** 浮冰的格子上 (x, y) 像素处双线性插值 */
export function sample(f: Pick<FloeField, 'cols' | 'rows' | 'cell'>, a: Float32Array, x: number, y: number, outside: number): number {
  return bilinear(a, f.cols, f.rows, f.cell, 0, 0, x, y, outside)
}

/** 离冰缘多远，格：冰上为正、水里为负，地图外按远海 */
export function edgeAt(f: FloeField, x: number, y: number): number {
  return sample(f, f.edge, x, y, -EXACT_U * 4)
}

/** 冰缘的朝外法线：离冰缘越来越近的方向 */
export function seaward(f: FloeField, x: number, y: number): Point {
  const h = f.cell
  const gx = edgeAt(f, x - h, y) - edgeAt(f, x + h, y)
  const gy = edgeAt(f, x, y - h) - edgeAt(f, x, y + h)
  const l = Math.hypot(gx, gy)
  return l > 1e-9 ? { x: gx / l, y: gy / l } : { x: 0, y: 0 }
}

/** 脚下的冰面：0 是老冰、1 是新冰，雪深（米） */
export function groundAt(f: FloeField, x: number, y: number): { young: number; snow: number } {
  return { young: sample(f, f.young, x, y, 0), snow: sample(f, f.snow, x, y, 0) }
}

/** 脚下与冰面的静、动摩擦系数：雪盖上几厘米就按雪算，新冰按新冰算，其间平滑过渡 */
export function frictionAt(f: FloeField, cfg: FloeConfig, x: number, y: number): { s: number; k: number } {
  const g = groundAt(f, x, y)
  const fr = cfg.friction
  const w = smooth(0.01, 0.05, g.snow)
  const s = fr.ice.static + (fr.snow.static - fr.ice.static) * w
  const k = fr.ice.kinetic + (fr.snow.kinetic - fr.ice.kinetic) * w
  return { s: s + (fr.young.static - s) * g.young, k: k + (fr.young.kinetic - k) * g.young }
}

/** 冰面此处高出海面多少，米：老冰加上雪，新冰更低 */
export function heightAt(f: FloeField, x: number, y: number): number {
  const g = groundAt(f, x, y)
  return (f.freeboard + g.snow) * (1 - g.young) + f.youngFreeboard * g.young
}

const FOOT_SAMPLES = 12

/**
 * 重心撑不撑得住：重心落在冰上，或者半径 foot 的脚下那一圈里踩在冰上的几处把重心围在当中（跨着一道窄缝），就撑得住；
 * 都踩空、或冰只在一侧（重心探出了冰缘），就撑不住
 */
export function standing(f: FloeField, x: number, y: number, foot: number): boolean {
  if (edgeAt(f, x, y) >= 0) return true
  let first = -1
  let run = 0
  let gap = 0
  for (let k = 0; k < FOOT_SAMPLES * 2; k++) {
    const a = ((k % FOOT_SAMPLES) / FOOT_SAMPLES) * Math.PI * 2
    const on = edgeAt(f, x + Math.cos(a) * foot, y + Math.sin(a) * foot) >= 0
    if (on) {
      if (first < 0) first = k
      gap = Math.max(gap, run)
      run = 0
    } else if (first >= 0) run++
    if (first >= 0 && k - first >= FOOT_SAMPLES) break
  }
  return first >= 0 && (gap + 1) * 2 <= FOOT_SAMPLES
}

/** 一个身体在浮冰上的状态，按实体记；uid 对不上就是换了实体 */
export interface Footing {
  uid: number
  /** 站在冰上、正从冰缘往下掉、在水里 */
  mode: typeof ICE | typeof FALLING | typeof SWIMMING
  /** 脚底正打滑：动摩擦；没打滑时是静摩擦 */
  slip: boolean
  /** 已经掉了多久、从多高掉下去，秒、米；脚下的冰面高出海面多少，米 */
  fall: number
  drop: number
  h: number
  /** 上一次走浮冰的物理是什么时刻（毫秒）与那时的速度：之后才开始的脚本位移收尾时按它还原 */
  at: number
  vx: number
  vy: number
}

export const ICE = 0
export const FALLING = 1
export const SWIMMING = 2

/** 掉进水里的一下，给视图溅水花：在哪、身体多大（像素）、什么时候；sink 是金币沉下去 */
export interface Splash {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly at: number
  readonly sink: boolean
}

/** 一局里的浮冰：地形与出怪口用的冰面、地标，各个身体的状态、冰上的路、海流与这一轮阵风 */
export interface FloeState {
  readonly field: FloeField
  readonly ground: Basin
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly feet: Map<number, Footing>
  readonly paths: IcePaths
  readonly current: Point
  gust: Gust
  nextGust: number
  hurtAt: number
  pathAt: number
  splashes: Splash[]
}

/** 冰上的路按多大的格子铺、离冰缘至少多远才算能走，格 */
const PATH_CELL_U = 0.5
const PATH_CLEAR_U = 0.6

/** 新冰缝上的口子沿缝每隔这么远一处，格；口子的半径不超过这么大，格 */
const SEAM_STEP_U = 4
const MARK_R_U = 0.8
/** 雪堆上的口子：积雪至少有最深处的这么多（比例），离冰缘至少这么远，彼此至少隔这么远，格；按这么大的步子找 */
const DRIFT_DEEP = 0.6
const DRIFT_EDGE_U = 1.5
const DRIFT_APART_U = 4.5
const DRIFT_STEP_U = 0.5

/** 冰面当作能站的地面：到冰缘的距离换成像素，格子最外一圈按海 */
function groundOf(f: FloeField): Basin {
  const room = new Float32Array(f.edge.length)
  for (let i = 0; i < room.length; i++) room[i] = f.edge[i]! * UNIT
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      if (i > 0 && j > 0 && i < f.cols - 1 && j < f.rows - 1) continue
      const k = j * f.cols + i
      room[k] = Math.min(room[k]!, -f.cell)
    }
  }
  return { cols: f.cols, rows: f.rows, cell: f.cell, x0: 0, y0: 0, room }
}

/** 浮冰的地标，像素：seam 是新冰缝上每隔一段的一处，drift 是积雪最深的几处雪堆，都在冰面中间、不朝哪边 */
function marksOf(f: FloeField): Record<string, Landmark[]> {
  const seam: Landmark[] = []
  const step = SEAM_STEP_U * UNIT
  for (const sm of f.seams) {
    let at = step / 2
    for (let i = 1; i < sm.line.length; i++) {
      const a = sm.line[i - 1]!
      const b = sm.line[i]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      for (; at <= len; at += step) {
        const t = at / len
        const x = a.x + (b.x - a.x) * t
        const y = a.y + (b.y - a.y) * t
        if (edgeAt(f, x, y) >= 1) seam.push({ x, y, r: Math.min(MARK_R_U * UNIT, sm.half[i]!), nx: 0, ny: 0 })
      }
      at -= len
    }
  }
  const stride = Math.max(1, Math.round((DRIFT_STEP_U * UNIT) / f.cell))
  let deepest = 0
  for (let k = 0; k < f.snow.length; k++) deepest = Math.max(deepest, f.snow[k]!)
  const spots: { x: number; y: number; d: number }[] = []
  for (let j = 0; j < f.rows; j += stride) {
    for (let i = 0; i < f.cols; i += stride) {
      const k = j * f.cols + i
      if (f.snow[k]! < deepest * DRIFT_DEEP || f.edge[k]! < DRIFT_EDGE_U) continue
      spots.push({ x: (i + 0.5) * f.cell, y: (j + 0.5) * f.cell, d: f.snow[k]! })
    }
  }
  const drift: Landmark[] = []
  for (const p of spots.sort((a, b) => b.d - a.d)) {
    if (drift.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < DRIFT_APART_U * UNIT)) continue
    drift.push({ x: p.x, y: p.y, r: MARK_R_U * UNIT, nx: 0, ny: 0 })
  }
  return { seam, drift }
}

export function newFloe(field: FloeField, cfg: FloeConfig): FloeState {
  return {
    field,
    ground: groundOf(field),
    marks: marksOf(field),
    feet: new Map(),
    paths: new IcePaths(field, PATH_CELL_U, PATH_CLEAR_U),
    current: currentOf(field, cfg),
    gust: { at: -Infinity, veer: 0 },
    nextGust: cfg.wind.firstMs,
    hurtAt: cfg.coldTickMs,
    pathAt: 0,
    splashes: [],
  }
}

/** 一个身体的状态：头一回见到或换了实体就从站在冰上开始 */
export function footingOf(s: FloeState, eid: number, uid: number): Footing {
  let f = s.feet.get(eid)
  if (!f || f.uid !== uid) {
    f = { uid, mode: ICE, slip: false, fall: 0, drop: 0, h: 0, at: -1, vx: 0, vy: 0 }
    s.feet.set(eid, f)
  }
  return f
}

/** 这个身体此刻在水里吗 */
export function inWater(s: FloeState, eid: number, uid: number): boolean {
  const f = s.feet.get(eid)
  return f !== undefined && f.uid === uid && f.mode === SWIMMING
}

/** 自由落体掉下 drop 米要多久，秒 */
export function fallTime(drop: number): number {
  return Math.sqrt((2 * Math.max(0.02, drop)) / GRAVITY)
}

/** 积分的子步长上限：抓地的驱动比摩擦硬得多，切细了才不抖 */
const SUB_S = 1 / 120

/**
 * 冰面上的一步，像素与秒。身体想以速率 k 趋近期望速度 (tx, ty)，靠脚下的摩擦力出力，再加上风推的加速度 (wx, wy)：
 * 脚要给的加速度 k·(t − v) − w 不超过最大静摩擦 μs·g 就踩得住，速度照常趋近；超过就打滑，只剩动摩擦 μk·g 朝着要用力的方向，
 * 直到要的力落回 μk·g 以内才重新踩住。身体停着时要的力只有抵住风那一份：风压超过静摩擦就被吹着滑
 */
export function stepOnIce(out: { x: number; y: number; vx: number; vy: number }, foot: Footing, x: number, y: number, vx: number, vy: number, tx: number, ty: number, k: number, mus: number, muk: number, g: number, wx: number, wy: number, dt: number): void {
  let left = dt
  while (left > 1e-9) {
    const h = Math.min(SUB_S, left)
    const ax = k * (tx - vx) - wx
    const ay = k * (ty - vy) - wy
    const need = Math.hypot(ax, ay)
    const cap = (foot.slip ? muk : mus) * g
    if (need <= cap) {
      foot.slip = false
      const e = Math.exp(-k * h)
      const glide = k > 1e-9 ? (1 - e) / k : h
      x += tx * h + (vx - tx) * glide
      y += ty * h + (vy - ty) * glide
      vx = tx + (vx - tx) * e
      vy = ty + (vy - ty) * e
    } else {
      foot.slip = true
      const f = (muk * g) / need
      const nx = vx + (ax * f + wx) * h
      const ny = vy + (ay * f + wy) * h
      x += (vx + nx) * 0.5 * h
      y += (vy + ny) * 0.5 * h
      vx = nx
      vy = ny
    }
    left -= h
  }
  out.x = x
  out.y = y
  out.vx = vx
  out.vy = vy
}

/**
 * 没有脚、自己不出力的东西在冰上滑（金币、碎片）：库仑摩擦 μ·g 逆着速度减速，这一步里能停下就停下
 */
export function slideLoose(out: { x: number; y: number; vx: number; vy: number }, x: number, y: number, vx: number, vy: number, mu: number, g: number, dt: number): void {
  const sp = Math.hypot(vx, vy)
  const drop = mu * g * dt
  if (sp <= drop) {
    const t = sp / (mu * g)
    out.x = x + vx * 0.5 * t
    out.y = y + vy * 0.5 * t
    out.vx = 0
    out.vy = 0
    return
  }
  const k = 1 - drop / sp
  out.x = x + vx * (1 + k) * 0.5 * dt
  out.y = y + vy * (1 + k) * 0.5 * dt
  out.vx = vx * k
  out.vy = vy * k
}

/**
 * 水里的一步，像素与秒：相对海水的速度 u 受二次阻力 |u|·u/L 减速（L = m/c 是阻力长度），游的身体朝 (dx, dy) 出推力 a；
 * 推力 a = vs²/L 让静水里的终速正好是游速 vs。隐式处理阻力，步长再大也不会冲过头
 */
export function stepInWater(out: { x: number; y: number; vx: number; vy: number }, x: number, y: number, vx: number, vy: number, dx: number, dy: number, a: number, len: number, cx: number, cy: number, dt: number): void {
  let left = dt
  while (left > 1e-9) {
    const h = Math.min(SUB_S * 2, left)
    const ux = vx - cx
    const uy = vy - cy
    const damp = 1 + (Math.hypot(ux, uy) * h) / len
    const nx = (ux + dx * a * h) / damp + cx
    const ny = (uy + dy * a * h) / damp + cy
    x += (vx + nx) * 0.5 * h
    y += (vy + ny) * 0.5 * h
    vx = nx
    vy = ny
    left -= h
  }
  out.x = x
  out.y = y
  out.vx = vx
  out.vy = vy
}

/** 阵风的一轮：开始的时刻（毫秒）与这一轮风向偏了多少（弧度） */
export interface Gust {
  at: number
  veer: number
}

/** 阵风此刻吹到几成：先按平滑的 S 形起来、稳住，再按 S 形落回平时的风 */
export function gustLevel(w: FloeConfig['wind'], g: Gust, now: number): number {
  const t = now - g.at
  if (t <= 0) return 0
  if (t < w.riseMs) return smooth(0, w.riseMs, t)
  if (t < w.riseMs + w.holdMs) return 1
  return 1 - smooth(w.riseMs + w.holdMs, w.riseMs + w.holdMs + w.fallMs, t)
}

/** 一轮阵风从开始到落尽多久，毫秒 */
export function gustSpan(w: FloeConfig['wind']): number {
  return w.riseMs + w.holdMs + w.fallMs
}

/** 此刻的风：风速（米/秒）与吹去的方向（弧度） */
export function windAt(f: FloeField, cfg: FloeConfig, g: Gust, now: number): { speed: number; angle: number; level: number } {
  const level = gustLevel(cfg.wind, g, now)
  return { speed: cfg.wind.meanMs + (cfg.wind.gustMs - cfg.wind.meanMs) * level, angle: f.windAngle + g.veer * level, level }
}

/** 浮冰上看到的海流，像素/秒：浮冰顺风漂得比海水快，所以海水朝漂向的反方向流；南半球漂向偏在风向左边 */
export function currentOf(f: FloeField, cfg: FloeConfig): Point {
  const w = cfg.wind
  const a = f.windAngle - w.driftDeg * DEG
  const v = (w.driftRatio * w.meanMs * UNIT) / cfg.meterPerU
  return { x: -Math.cos(a) * v, y: -Math.sin(a) * v }
}

/** 阻力的尺度：半径与质量相对标准身体的倍数，横截面按半径平方、质量按半径立方与密度 */
export function bulk(cfg: FloeConfig, radiusPx: number, mass: number): number {
  return ((radiusPx / (cfg.body.refRadiusU * UNIT)) * mass)
}

/**
 * 风推一个身体的加速度，像素/秒²：½·ρ·(Cd·A/m)·|w − v|·(w − v)，Cd·A/m 与半径、质量成反比（越小越轻吹得越动）；
 * w 是风速，v 是身体的速度，都按米/秒算
 */
export function windPush(cfg: FloeConfig, speed: number, angle: number, vx: number, vy: number, size: number): Point {
  const m = cfg.meterPerU / UNIT
  const rx = Math.cos(angle) * speed - vx * m
  const ry = Math.sin(angle) * speed - vy * m
  const k = (0.5 * cfg.wind.airDensity * cfg.wind.dragArea * Math.hypot(rx, ry)) / size / m
  return { x: k * rx, y: k * ry }
}

/** 把一点挪到冰上离冰缘至少 margin 格处：沿距离场的坡往冰里推，几次就到 */
export function ashore(f: FloeField, x: number, y: number, margin: number): Point {
  let px = x
  let py = y
  for (let k = 0; k < 12; k++) {
    const d = edgeAt(f, px, py)
    if (d >= margin) break
    const n = seaward(f, px, py)
    if (n.x === 0 && n.y === 0) return { x: FRAME_MID.x, y: FRAME_MID.y }
    const step = (margin - d) * UNIT + f.cell * 0.5
    px -= n.x * step
    py -= n.y * step
  }
  return edgeAt(f, px, py) >= margin * 0.5 ? { x: px, y: py } : { x: FRAME_MID.x, y: FRAME_MID.y }
}

/**
 * 冰上的路：粗格子上从队长脚下（队长在水里就是离他最近的冰）往外的最短路，离冰缘近的格子走起来贵，所以路绕着冰缘走；
 * 身体顺着最短路往下走就能绕过豁口与水道
 */
export class IcePaths {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  private readonly cost: Float32Array
  readonly dist: Float32Array
  private readonly heap: Int32Array
  /** 每个格子最近的能走的格子，查过才填：能走的格子不变，查一次就一直对 */
  private readonly near: Int32Array
  source = -1

  constructor(f: FloeField, cellU: number, clearU: number) {
    this.cell = cellU * UNIT
    this.cols = Math.ceil(f.cols * f.cell / this.cell)
    this.rows = this.cols
    const n = this.cols * this.rows
    this.cost = new Float32Array(n)
    this.dist = new Float32Array(n).fill(Infinity)
    this.heap = new Int32Array(n * 8)
    this.near = new Int32Array(n).fill(-2)
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const e = edgeAt(f, (i + 0.5) * this.cell, (j + 0.5) * this.cell)
        this.cost[j * this.cols + i] = e < clearU ? Infinity : 1 + Math.max(0, 2 - e)
      }
    }
  }

  cellOf(x: number, y: number): number {
    const i = Math.floor(x / this.cell)
    const j = Math.floor(y / this.cell)
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1
    return j * this.cols + i
  }

  walkable(c: number): boolean {
    return c >= 0 && this.cost[c]! < Infinity
  }

  /** 离 (x, y) 最近的能走的格子：沿着一圈圈方框的边往外找 */
  nearest(x: number, y: number): number {
    const c = this.cellOf(Math.min(Math.max(x, 0), this.cols * this.cell - 1), Math.min(Math.max(y, 0), this.rows * this.cell - 1))
    const known = this.near[c]!
    if (known !== -2) return known
    let found = -1
    if (this.walkable(c)) found = c
    const ci = c % this.cols
    const cj = Math.floor(c / this.cols)
    let bd = Infinity
    const visit = (i: number, j: number): void => {
      if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return
      const k = j * this.cols + i
      const d = (i - ci) ** 2 + (j - cj) ** 2
      if (d < bd && this.walkable(k)) {
        bd = d
        found = k
      }
    }
    for (let r = 1; found < 0 && r < this.cols; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        visit(i, cj - r)
        visit(i, cj + r)
      }
      for (let j = cj - r + 1; j <= cj + r - 1; j++) {
        visit(ci - r, j)
        visit(ci + r, j)
      }
    }
    this.near[c] = found
    return found
  }

  /** 从 source 格往外铺一遍最短路（八邻域的 Dijkstra） */
  build(source: number): void {
    this.source = source
    const { cols, rows, cost, dist, heap } = this
    dist.fill(Infinity)
    if (source < 0) return
    let size = 0
    const key = (c: number): number => dist[c]!
    const push = (c: number): void => {
      let i = size++
      heap[i] = c
      while (i > 0) {
        const p = (i - 1) >> 1
        if (key(heap[p]!) <= key(heap[i]!)) break
        const t = heap[p]!
        heap[p] = heap[i]!
        heap[i] = t
        i = p
      }
    }
    const pop = (): number => {
      const top = heap[0]!
      heap[0] = heap[--size]!
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < size && key(heap[l]!) < key(heap[m]!)) m = l
        if (r < size && key(heap[r]!) < key(heap[m]!)) m = r
        if (m === i) break
        const t = heap[m]!
        heap[m] = heap[i]!
        heap[i] = t
        i = m
      }
      return top
    }
    dist[source] = 0
    push(source)
    while (size > 0) {
      const c = pop()
      const ci = c % cols
      const cj = (c - ci) / cols
      const dc = dist[c]!
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const i = ci + di
          const j = cj + dj
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue
          const k = j * cols + i
          if (cost[k] === Infinity) continue
          if (di !== 0 && dj !== 0 && (cost[cj * cols + i] === Infinity || cost[j * cols + ci] === Infinity)) continue
          const nd = dc + ((cost[c]! + cost[k]!) / 2) * (di !== 0 && dj !== 0 ? Math.SQRT2 : 1)
          if (nd < dist[k]!) {
            dist[k] = nd
            if (size < heap.length) push(k)
          }
        }
      }
    }
  }

  /** 从 (x, y) 顺着最短路往下走的单位方向；不在路上返回 null */
  downhill(x: number, y: number): Point | null {
    const c = this.cellOf(x, y)
    if (!this.walkable(c) || this.dist[c] === Infinity) return null
    if (c === this.source) return { x: 0, y: 0 }
    const ci = c % this.cols
    const cj = (c - ci) / this.cols
    let best = this.dist[c]!
    let bi = ci
    let bj = cj
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue
        const d = this.dist[j * this.cols + i]!
        if (d < best) {
          best = d
          bi = i
          bj = j
        }
      }
    }
    const tx = (bi + 0.5) * this.cell - x
    const ty = (bj + 0.5) * this.cell - y
    const l = Math.hypot(tx, ty)
    return l > 1e-6 ? { x: tx / l, y: ty / l } : null
  }

  /** 格心，像素 */
  center(c: number): Point {
    const i = c % this.cols
    return { x: (i + 0.5) * this.cell, y: (Math.floor(c / this.cols) + 0.5) * this.cell }
  }
}
