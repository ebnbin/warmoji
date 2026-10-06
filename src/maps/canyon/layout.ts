import { FRAME_U, SAFE_U, UNIT } from '../../util/units.ts'
import { fbm, valueNoise } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { CanyonConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 台沿按这么多个方向记半径 */
export const RIM_N = 192
/** 能站的台面、谷底的格子边长，格 */
const TOP_CELL_U = 0.125
/** 方框里峡谷两岸的台沿：北岸离方框上边、南岸离方框下边多远，格；起伏多少 */
const BANK_U = { north: 3.2, south: 3.4, wave: 0.9 } as const
/** 摆石台试多少次 */
const TRIES = 400
/** 桥头离台沿往台里缩多少，格：桩子打在实地上 */
export const POST_IN_U = 0.35
/** 绳梯脚下离崖脚多远，格 */
const FOOT_OUT_U = 0.5
/** 爬上来落在台沿往里多远，格 */
const TOP_IN_U = 0.7
/** 怪爬上来的崖边隔多远一处，格；离桥头、绳梯至少多远 */
const LEDGE_STEP_U = 2.6
const LEDGE_CLEAR_U = 1.4
/** 绳梯离桥头至少多远，格 */
const CLIMB_CLEAR_U = 1.8

/** 一座石台，格：台心、名义半径、各个方向上台沿离台心多远（从 +x 起顺着 y 朝下的方向转）；seed 定它的纹理 */
export interface Mesa {
  readonly cx: number
  readonly cy: number
  readonly r: number
  readonly rim: Float32Array
  /** 外接框：x0、y0、x1、y1 */
  readonly box: readonly [number, number, number, number]
  readonly seed: number
}

/** 一座吊桥，格：从台 a 的台沿 (ax, ay) 搭到台 b 的台沿 (bx, by)；kind 是结实程度在 CanyonConfig.bridge.kinds 里的序号 */
export interface Span {
  readonly a: number
  readonly b: number
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly kind: number
}

/** 一根绳梯，格：挂在台 mesa 的台沿 (x, y)，崖面朝外 (nx, ny)；脚下在谷底的 foot，爬上来落在台面的 top */
export interface Climb {
  readonly mesa: number
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly foot: Point
  readonly top: Point
}

/** 台沿上一处，格：位置与朝台外的法线 */
export interface RimPoint {
  readonly mesa: number
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/**
 * 谷底的路：每格离最近的绳梯脚下还要走多远（像素，走不到是 Infinity）与那是第几根；格子同谷底的 Basin
 */
export interface FloorNav {
  readonly dist: Float32Array
  readonly to: Int16Array
}

/** 一局的峡谷，格：石台、吊桥、绳梯、怪爬上来的崖边、谷底的河（折线与各点半宽）、两岸的台沿；台面与谷底能走的地方（像素） */
export interface CanyonPlan {
  readonly seed: number
  readonly depth: number
  readonly mesas: readonly Mesa[]
  readonly spans: readonly Span[]
  readonly climbs: readonly Climb[]
  readonly ledges: readonly RimPoint[]
  readonly river: { readonly pts: Float32Array; readonly half: Float32Array }
  /** 两岸的台沿：方框里每隔 1/BANK_PER_U 格一个，北岸台沿的 y 与南岸台沿的 y */
  readonly banks: { readonly north: Float32Array; readonly south: Float32Array }
  readonly top: Basin
  readonly floor: Basin
  readonly nav: FloorNav
}

export const BANK_PER_U = 4

const lerp = (r: Rng, [a, b]: readonly [number, number]): number => a + (b - a) * r.next()
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

/** 台沿在方向 a（弧度）上离台心多远，格 */
export function rimAt(m: Mesa, a: number): number {
  const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * RIM_N
  const i = Math.floor(f)
  const t = f - i
  return m.rim[i % RIM_N]! * (1 - t) + m.rim[(i + 1) % RIM_N]! * t
}

/** (x, y) 格在台面上多深：台沿以内为正，按台沿那个方向上的半径差近似，格 */
export function insideBy(m: Mesa, x: number, y: number): number {
  const dx = x - m.cx
  const dy = y - m.cy
  return rimAt(m, Math.atan2(dy, dx)) - Math.hypot(dx, dy)
}

/** (x, y) 格落在哪座台上，都不在是 −1 */
export function mesaAt(mesas: readonly Mesa[], x: number, y: number): number {
  for (let i = 0; i < mesas.length; i++) {
    const m = mesas[i]!
    if (x < m.box[0] || x > m.box[2] || y < m.box[1] || y > m.box[3]) continue
    if (insideBy(m, x, y) > 0) return i
  }
  return -1
}

/** 方向 a 上的台沿点与朝外的法线，格 */
export function rimPoint(m: Mesa, a: number): { x: number; y: number; nx: number; ny: number } {
  const r = rimAt(m, a)
  const h = 0.01
  const dr = (rimAt(m, a + h) - rimAt(m, a - h)) / (2 * h)
  const c = Math.cos(a)
  const s = Math.sin(a)
  // 极坐标曲线的切线是 (dr·c − r·s, dr·s + r·c)，朝外的法线把它顺时针转 90°
  const tx = dr * c - r * s
  const ty = dr * s + r * c
  const l = Math.hypot(tx, ty) || 1
  return { x: m.cx + c * r, y: m.cy + s * r, nx: ty / l, ny: -tx / l }
}

/** (x, y) 格在台 m 露在谷底的那片里吗：台面往下透视推 depth 格扫过的地方都算 */
export function inSweep(m: Mesa, depth: number, x: number, y: number): boolean {
  if (x < m.box[0] || x > m.box[2] || y < m.box[1] || y > m.box[3] + depth) return false
  for (let s = 0; s <= depth + 1e-6; s += 0.1) if (insideBy(m, x, y - s) > 0) return true
  return false
}

/** 北岸、南岸台沿在 x 格处的 y */
export function bankAt(banks: CanyonPlan['banks'], x: number): { north: number; south: number } {
  const f = clamp(x * BANK_PER_U, 0, banks.north.length - 1.001)
  const i = Math.floor(f)
  const t = f - i
  return {
    north: banks.north[i]! * (1 - t) + banks.north[i + 1]! * t,
    south: banks.south[i]! * (1 - t) + banks.south[i + 1]! * t,
  }
}

/** 一座台：七到十一道崩塌面围成的多边形，角上崩掉一块、边上咬进去几个豁口，再按细噪声毛一毛边 */
function makeMesa(rng: Rng, cx: number, cy: number, r: number, wobble: number): Mesa {
  const seed = Math.floor(rng.next() * 1e9)
  const n = rng.int(7, 11)
  const turn = rng.next() * Math.PI * 2
  const tau = Math.PI * 2
  const corners = Array.from({ length: n }, (_, k) => ({
    a: (((turn + ((k + (rng.next() - 0.5) * 0.55) / n) * tau) % tau) + tau) % tau,
    r: 1 + (rng.next() * 2 - 1) * wobble,
  })).sort((p, q) => p.a - q.a)
  const bites = Array.from({ length: rng.int(1, 3) }, () => ({ at: rng.next() * Math.PI * 2, w: 0.12 + rng.next() * 0.2, d: 0.08 + rng.next() * 0.14 }))
  const rim = new Float32Array(RIM_N)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < RIM_N; i++) {
    const a = (i / RIM_N) * Math.PI * 2
    // 落在哪两个角之间：按两角连成的直边算这个方向上的半径
    let k = corners.findIndex((c) => c.a > a)
    if (k < 0) k = 0
    const p = corners[(k - 1 + n) % n]!
    const q = corners[k]!
    const pa = p.a
    let qa = q.a
    while (qa <= pa) qa += Math.PI * 2
    let at = a
    while (at < pa) at += Math.PI * 2
    const px = Math.cos(pa) * p.r
    const py = Math.sin(pa) * p.r
    const qx = Math.cos(qa) * q.r
    const qy = Math.sin(qa) * q.r
    const dx = Math.cos(at)
    const dy = Math.sin(at)
    // 射线 t·(dx, dy) 与直边 p→q 的交点
    const ex = qx - px
    const ey = qy - py
    const den = dx * ey - dy * ex
    let k1 = Math.abs(den) > 1e-9 ? (px * ey - py * ex) / den : p.r
    k1 += (fbm(Math.cos(a) * 3 + 7, Math.sin(a) * 3 + 3, seed & 0xffff, 3) - 0.5) * 0.09
    k1 += (valueNoise(a * 18, 1.5, seed & 0xffff) - 0.5) * 0.03
    for (const b of bites) {
      const d = Math.atan2(Math.sin(a - b.at), Math.cos(a - b.at))
      k1 -= b.d * Math.max(0, 1 - (d / b.w) ** 2)
    }
    const rr = r * clamp(k1, 0.62, 1.3)
    rim[i] = rr
    x0 = Math.min(x0, cx + Math.cos(a) * rr)
    x1 = Math.max(x1, cx + Math.cos(a) * rr)
    y0 = Math.min(y0, cy + Math.sin(a) * rr)
    y1 = Math.max(y1, cy + Math.sin(a) * rr)
  }
  return { cx, cy, r, rim, box: [x0, y0, x1, y1], seed }
}

/** 两座台的边隔多远，格：按台心连线上的台沿点 */
function gapOf(a: Mesa, b: Mesa): { gap: number; pa: ReturnType<typeof rimPoint>; pb: ReturnType<typeof rimPoint> } {
  const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx)
  const pa = rimPoint(a, ang)
  const pb = rimPoint(b, ang + Math.PI)
  return { gap: Math.hypot(pb.x - pa.x, pb.y - pa.y), pa, pb }
}

/** 两座台之间最窄处，格：沿 a 的台沿逐点找离 b 最近的 */
function nearest(a: Mesa, b: Mesa): number {
  let best = Infinity
  for (let i = 0; i < RIM_N; i += 4) {
    const p = rimPoint(a, (i / RIM_N) * Math.PI * 2)
    best = Math.min(best, -insideBy(b, p.x, p.y))
  }
  return best
}

/** 两座台露在谷底的那片之间还留得出 clear 格的路：各自往下推 depth 格扫过的地方互相比 */
function passable(a: Mesa, b: Mesa, depth: number, clear: number): boolean {
  const lift = (p: Mesa, s: number): Mesa => ({ ...p, cy: p.cy + s, box: [p.box[0], p.box[1] + s, p.box[2], p.box[3] + s] })
  for (let s = 0; s <= depth; s += depth / 4) {
    if (nearest(lift(a, s), b) < clear || nearest(lift(b, s), a) < clear) return false
  }
  return true
}

/** 中间那座台的轮廓只按这么多倍的起伏揉：开局站的地方要方正些 */
export const CENTER_WOBBLE = 0.7

/** 安全区的四边，格 */
const LO = SAFE_U
const HI = FRAME_U - SAFE_U

/** 摆石台：正中一座，周围一圈错开摆；都放得进安全区，朝镜头那面的崖脚下还留得出绳梯 */
function placeMesas(cfg: CanyonConfig, rng: Rng): Mesa[] {
  const m = cfg.mesas
  const mid = FRAME_U / 2
  const depth = cfg.depthU
  const out: Mesa[] = [makeMesa(rng, mid, mid, lerp(rng, m.centerU), m.wobble * CENTER_WOBBLE)]
  const want = rng.int(m.count[0], m.count[1])
  const apart = ((Math.PI * 2) / (want - 1)) * 0.55
  const angles: number[] = []
  for (let tries = 0; out.length < want && tries < TRIES; tries++) {
    const a = rng.next() * Math.PI * 2
    if (angles.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < apart)) continue
    const d = lerp(rng, m.ringU)
    const r = lerp(rng, m.radiusU)
    // 往下摆得近一点：南边的台脚下还要留出崖壁和绳梯
    const c = makeMesa(rng, mid + Math.cos(a) * d, mid + Math.sin(a) * d * (Math.sin(a) > 0 ? 0.8 : 0.95), r, m.wobble)
    const [x0, y0, x1, y1] = c.box
    if (x0 < LO + 0.5 || y0 < LO + 0.5 || x1 > HI - 0.5 || y1 + depth + FOOT_OUT_U + 1 > HI) continue
    if (out.some((o) => nearest(c, o) < m.gapU[0] || nearest(o, c) < m.gapU[0] || !passable(c, o, depth, m.clearU))) continue
    out.push(c)
    angles.push(a)
  }
  return out
}

/** 线段 p→q 与 u→v 相交（不算端点） */
function crosses(p: Point, q: Point, u: Point, v: Point): boolean {
  const d = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p, q, u)
  const d2 = d(p, q, v)
  const d3 = d(u, v, p)
  const d4 = d(u, v, q)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** 能搭的桥：两台隔得不远，桥面一路都悬在峡谷上、离别的台都留得出桥宽 */
function candidates(cfg: CanyonConfig, mesas: readonly Mesa[]): { a: number; b: number; gap: number; pa: Point; pb: Point }[] {
  const out: { a: number; b: number; gap: number; pa: Point; pb: Point }[] = []
  const half = cfg.bridge.widthU / 2
  for (let a = 0; a < mesas.length; a++) {
    for (let b = a + 1; b < mesas.length; b++) {
      const g = gapOf(mesas[a]!, mesas[b]!)
      if (g.gap < cfg.mesas.gapU[0] || g.gap > cfg.mesas.gapU[1]) continue
      let ok = true
      for (let s = 0.04; s <= 0.96 && ok; s += 0.04) {
        const x = g.pa.x + (g.pb.x - g.pa.x) * s
        const y = g.pa.y + (g.pb.y - g.pa.y) * s
        // 桥面两侧也悬空：沿垂直方向各探半个桥宽
        const nx = -(g.pb.y - g.pa.y) / g.gap
        const ny = (g.pb.x - g.pa.x) / g.gap
        for (const k of [-1, 0, 1]) {
          const px = x + nx * half * k
          const py = y + ny * half * k
          if (mesas.some((m, i) => insideBy(m, px, py) > (i === a || i === b ? -0.05 : -0.6))) ok = false
        }
      }
      if (ok) out.push({ a, b, gap: g.gap, pa: { x: g.pa.x, y: g.pa.y }, pb: { x: g.pb.x, y: g.pb.y } })
    }
  }
  return out
}

/** 搭桥：先按由短到长连通所有石台，再多搭几座成环；桥不交叉；结实程度每种至少一座，其余随机 */
function buildSpans(cfg: CanyonConfig, mesas: readonly Mesa[], rng: Rng): Span[] | null {
  const cand = candidates(cfg, mesas).sort((p, q) => p.gap - q.gap)
  const root = mesas.map((_, i) => i)
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)))
  const chosen: typeof cand = []
  const clash = (c: (typeof cand)[number]): boolean => chosen.some((o) => crosses(c.pa, c.pb, o.pa, o.pb))
  const rest: typeof cand = []
  for (const c of cand) {
    const ra = find(c.a)
    const rb = find(c.b)
    if (ra === rb || clash(c)) {
      rest.push(c)
      continue
    }
    root[ra] = rb
    chosen.push(c)
  }
  if (chosen.length !== mesas.length - 1) return null
  const more = rng.int(cfg.bridge.extra[0], cfg.bridge.extra[1])
  for (let k = 0; k < more; k++) {
    const left = rest.filter((c) => !chosen.includes(c) && !clash(c))
    if (left.length === 0) break
    chosen.push(left[Math.floor(rng.next() * left.length)]!)
  }
  const n = cfg.bridge.kinds.length
  const kinds = chosen.map((_, i) => (i < n ? i : Math.floor(rng.next() * n)))
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = kinds[i]!
    kinds[i] = kinds[j]!
    kinds[j] = t
  }
  return chosen.map((c, i) => ({ a: c.a, b: c.b, ax: c.pa.x, ay: c.pa.y, bx: c.pb.x, by: c.pb.y, kind: kinds[i]! }))
}

/** 两岸的台沿：方框上下各一道，按噪声起伏 */
function makeBanks(seed: number): CanyonPlan['banks'] {
  const n = FRAME_U * BANK_PER_U + 1
  const north = new Float32Array(n)
  const south = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i / BANK_PER_U
    north[i] = BANK_U.north + (fbm(x * 0.13, 0.5, seed + 11, 4) - 0.5) * 2 * BANK_U.wave
    south[i] = FRAME_U - BANK_U.south + (fbm(x * 0.13, 9.5, seed + 29, 4) - 0.5) * 2 * BANK_U.wave
  }
  return { north, south }
}

/** 谷底露出来、身体走得到的地方：安全区里，不在石台露在谷底的那片下面 */
function floorOpen(mesas: readonly Mesa[], depth: number, x: number, y: number): boolean {
  if (x < LO || x > HI || y < LO || y > HI) return false
  return !mesas.some((m) => inSweep(m, depth, x, y))
}

/** 半径 r 格的身体在谷底这一点站得开：四周八个方向都还在谷底 */
function roomy(mesas: readonly Mesa[], depth: number, x: number, y: number, r: number): boolean {
  if (!floorOpen(mesas, depth, x, y)) return false
  for (let k = 0; k < 8; k++) if (!floorOpen(mesas, depth, x + Math.cos((k * Math.PI) / 4) * r, y + Math.sin((k * Math.PI) / 4) * r)) return false
  return true
}

/** 绳梯：挂在朝着镜头的台沿上，躲开桥头，彼此隔开；脚下在谷底站得开 */
function placeClimbs(cfg: CanyonConfig, mesas: readonly Mesa[], spans: readonly Span[], rng: Rng): Climb[] {
  const out: Climb[] = []
  const depth = cfg.depthU
  mesas.forEach((m, mi) => {
    const heads = spans.flatMap((s) => (s.a === mi ? [{ x: s.ax, y: s.ay }] : s.b === mi ? [{ x: s.bx, y: s.by }] : []))
    const list: { c: Climb; score: number }[] = []
    for (let i = 0; i < RIM_N; i++) {
      const p = rimPoint(m, (i / RIM_N) * Math.PI * 2)
      if (p.ny < 0.55) continue
      if (heads.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < CLIMB_CLEAR_U)) continue
      const foot = { x: p.x, y: p.y + depth + FOOT_OUT_U }
      if (!roomy(mesas, depth, foot.x, foot.y, 0.45) || foot.y > HI - 0.5) continue
      const top = { x: p.x - p.nx * TOP_IN_U, y: p.y - p.ny * TOP_IN_U }
      if (insideBy(m, top.x, top.y) < 0.4) continue
      list.push({ c: { mesa: mi, x: p.x, y: p.y, nx: p.nx, ny: p.ny, foot, top }, score: p.ny + rng.next() * 0.4 })
    }
    list.sort((p, q) => q.score - p.score)
    const want = mi === 0 ? cfg.climb.perMesa[1] : rng.int(cfg.climb.perMesa[0], cfg.climb.perMesa[1])
    const mine: Climb[] = []
    for (const { c } of list) {
      if (mine.length >= want) break
      if (mine.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < cfg.climb.spacingU)) continue
      mine.push(c)
    }
    out.push(...mine)
  })
  return out
}

/** 怪爬上来的崖边：朝镜头那一侧的台沿，每隔一段一处，躲开桥头与绳梯 */
function placeLedges(mesas: readonly Mesa[], spans: readonly Span[], climbs: readonly Climb[]): RimPoint[] {
  const out: RimPoint[] = []
  mesas.forEach((m, mi) => {
    const avoid = [
      ...spans.flatMap((s) => (s.a === mi ? [{ x: s.ax, y: s.ay }] : s.b === mi ? [{ x: s.bx, y: s.by }] : [])),
      ...climbs.filter((c) => c.mesa === mi),
    ]
    let last: Point | null = null
    for (let i = 0; i < RIM_N; i++) {
      const p = rimPoint(m, (i / RIM_N) * Math.PI * 2)
      if (p.ny < 0.2) continue
      if (avoid.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < LEDGE_CLEAR_U)) continue
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < LEDGE_STEP_U) continue
      out.push({ mesa: mi, x: p.x, y: p.y, nx: p.nx, ny: p.ny })
      last = p
    }
  })
  return out
}

/** 谷底的河：从方框左边流到右边，在峡谷中段左右摆着弯，弯到石台后面的那几段就被台挡住看不见 */
function makeRiver(cfg: CanyonConfig, rng: Rng, seed: number): CanyonPlan['river'] {
  const mid = FRAME_U / 2 + (rng.next() - 0.5) * 6
  const amp = 4 + rng.next() * 4
  const len = 26 + rng.next() * 14
  const phase = rng.next() * Math.PI * 2
  const out: number[] = []
  const half: number[] = []
  for (let x = -1; x <= FRAME_U + 1; x += 0.25) {
    const y = mid + Math.sin((x / len) * Math.PI * 2 + phase) * amp + (fbm(x * 0.09, 2.3, seed + 3, 3) - 0.5) * 7
    out.push(x, clamp(y, LO + 2, HI - 2))
    half.push(cfg.gorge.riverU[0] + (cfg.gorge.riverU[1] - cfg.gorge.riverU[0]) * valueNoise(x * 0.18, 3.7, seed + 41))
  }
  return { pts: Float32Array.from(out), half: Float32Array.from(half) }
}

/** 谷底离绳梯脚下还要走多远：从所有脚下同时往外按八邻格铺 */
function floorNav(floor: Basin, climbs: readonly Climb[]): FloorNav {
  const { cols, rows, cell, x0, y0 } = floor
  const dist = new Float32Array(cols * rows).fill(Infinity)
  const to = new Int16Array(cols * rows).fill(-1)
  const open: number[] = []
  climbs.forEach((c, k) => {
    const i = Math.floor((c.foot.x * UNIT - x0) / cell)
    const j = Math.floor((c.foot.y * UNIT - y0) / cell)
    const at = j * cols + i
    if (floor.room[at]! <= 0) return
    dist[at] = 0
    to[at] = k
    open.push(at)
  })
  // 一层层往外铺：按距离排的桶，每桶半格
  const buckets: number[][] = [open]
  const done = new Uint8Array(cols * rows)
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b]
    if (!list) continue
    for (const cur of list) {
      if (done[cur]) continue
      done[cur] = 1
      const ci = cur % cols
      const cj = (cur - ci) / cols
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const i = ci + di
          const j = cj + dj
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue
          const k = j * cols + i
          if (done[k] || floor.room[k]! <= 0) continue
          // 斜着走要两边的格子都通，免得贴着崖角抄近路
          if (di !== 0 && dj !== 0 && (floor.room[cj * cols + i]! <= 0 || floor.room[j * cols + ci]! <= 0)) continue
          const nd = dist[cur]! + Math.hypot(di, dj) * cell
          if (nd >= dist[k]!) continue
          dist[k] = nd
          to[k] = to[cur]!
          const nb = Math.floor(nd / (cell * 0.5))
          ;(buckets[nb] ??= []).push(k)
        }
      }
    }
  }
  return { dist, to }
}

/** 谷底还要走多远才到绳梯脚下，像素；走不到是 Infinity */
export function navDist(p: CanyonPlan, x: number, y: number): number {
  const f = p.floor
  const i = Math.floor((x - f.x0) / f.cell)
  const j = Math.floor((y - f.y0) / f.cell)
  if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return Infinity
  return p.nav.dist[j * f.cols + i]!
}

/** 谷底 (x, y) 像素处往哪走离绳梯脚下更近：看四周两圈格子里离绳梯最近的那格，没有路是 null；同时给出走向第几根 */
export function navStep(p: CanyonPlan, x: number, y: number): { x: number; y: number; climb: number } | null {
  const f = p.floor
  const ci = Math.floor((x - f.x0) / f.cell)
  const cj = Math.floor((y - f.y0) / f.cell)
  let best = Infinity
  let bi = -1
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) continue
      const k = j * f.cols + i
      // 往离绳梯最近的那格走：同样近的取离自己近的
      const d = p.nav.dist[k]! + Math.hypot(di, dj) * 1e-3
      if (d < best) {
        best = d
        bi = k
      }
    }
  }
  if (bi < 0 || !Number.isFinite(best)) return null
  const tx = f.x0 + ((bi % f.cols) + 0.5) * f.cell
  const ty = f.y0 + (Math.floor(bi / f.cols) + 0.5) * f.cell
  const l = Math.hypot(tx - x, ty - y)
  return { x: l > 1e-6 ? (tx - x) / l : 0, y: l > 1e-6 ? (ty - y) / l : 0, climb: p.nav.to[bi]! }
}

/** 按种子摆一局的峡谷：摆不出连通的桥就换个种子再摆 */
export function canyonPlan(cfg: CanyonConfig, seed: number): CanyonPlan {
  for (let attempt = 0; ; attempt++) {
    const s = (seed + attempt * 0x9e3779b1) >>> 0
    const plan = tryPlan(cfg, s)
    if (plan) return plan
    if (attempt > 60) throw new Error('峡谷摆不出来：石台摆不开或桥连不通')
  }
}

function tryPlan(cfg: CanyonConfig, seed: number): CanyonPlan | null {
  const rng = new Rng(seed)
  const mesas = placeMesas(cfg, rng)
  if (mesas.length < cfg.mesas.count[0]) { return null }
  const spans = buildSpans(cfg, mesas, rng)
  if (!spans) return null
  const climbs = placeClimbs(cfg, mesas, spans, rng)
  for (let i = 0; i < mesas.length; i++) if (!climbs.some((c) => c.mesa === i)) return null
  const ledges = placeLedges(mesas, spans, climbs)
  const banks = makeBanks(seed & 0xffff)
  const cell = TOP_CELL_U * UNIT
  const cols = Math.round(FRAME_U / TOP_CELL_U)
  const top = makeBasin((x, y) => mesaAt(mesas, x / UNIT, y / UNIT) >= 0, 0, 0, cols, cols, cell, mesas.map((m) => ({ x: m.cx * UNIT, y: m.cy * UNIT })), 0.05 * UNIT)
  const fcell = cfg.gorge.cellU * UNIT
  const fcols = Math.round(FRAME_U / cfg.gorge.cellU)
  const floor = makeBasin((x, y) => floorOpen(mesas, cfg.depthU, x / UNIT, y / UNIT), 0, 0, fcols, fcols, fcell, climbs.map((c) => ({ x: c.foot.x * UNIT, y: c.foot.y * UNIT })), 0.3 * UNIT)
  if (climbs.some((c) => roomAt(floor, c.foot.x * UNIT, c.foot.y * UNIT) < 0.3 * UNIT)) return null
  const river = makeRiver(cfg, rng, seed & 0xffff)
  return { seed, depth: cfg.depthU, mesas, spans, climbs, ledges, river, banks, top, floor, nav: floorNav(floor, climbs) }
}
