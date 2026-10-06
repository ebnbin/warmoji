import { FRAME_U, SAFE_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { fbm } from '../../util/noise.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { SwampConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.2
/** 实地的距离场按这么细的格子存，格；离实地边超过 FIRM_CAP_U 格的按它算 */
const FIRM_CELL_U = 0.1
const FIRM_CAP_U = 3
/** 岸线按多少个方向采样 */
const SHORE_SAMPLES = 256
/** 一圈起伏用几阶谐波；起伏的圆最远伸到半径的这么多倍（摆东西时按它留空） */
const WOBBLE_ORDERS = [2, 3, 5] as const
const WOBBLE_REACH = 1.2
/** 栈道伸进水里的栈桥伸出岸线多远，格；栈道两边的桩隔多远（格） */
const PIER_OUT_U = 2.6
const POST_STEP_U = 2.2
/** 水里的睡莲：几片、叶子半径（格），开花的占几成 */
const LILIES = [46, 70] as const
const LILY_U = [0.22, 0.42] as const
const LILY_BLOOM = 0.16
/** 生成不出合格的布局就换一组随机数，最多试这么多次 */
const TRIES = 40

/** 一圈的起伏：几阶谐波的幅度与相位，r(θ) = 1 + Σ a·sin(kθ + φ) */
export interface Wobble {
  readonly a: readonly number[]
  readonly p: readonly number[]
}

/** 实地的一块土墩：圆心、半径（格），边缘的大起伏，与按噪声的碎起伏（格）与它的种子；kind 是开局土台、落羽杉的盘根土台还是草墩 */
export interface Hummock {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly wob: Wobble
  readonly rag: number
  readonly seed: number
  readonly kind: 'plaza' | 'mound' | 'tussock'
}

/** 土墩边缘按噪声的碎起伏：泥一点点吃进土墩，边是坑坑洼洼的 */
const RAG = { plaza: 0.32, mound: 0.26, tussock: 0.14 } as const

/** 离一块土墩的边多远，格：土墩里为正，大起伏之外再加碎起伏 */
export function moundEdge(h: Hummock, x: number, y: number): number {
  return blobDist(h.x, h.y, h.r, h.wob, x, y) + (fbm(x * 1.5, y * 1.5, h.seed, 2) - 0.5) * 2 * h.rag
}

/** 一棵落羽杉：树干圆心与半径（格），树高（米），树冠半径（格）；inWater 是长在岸外水里的，只露树冠 */
export interface Cypress {
  readonly x: number
  readonly y: number
  readonly trunk: number
  readonly h: number
  readonly crown: number
  readonly inWater: boolean
  readonly seed: number
}

/** 一条木栈道：沿折线（格）铺，宽 width 格；pts 按走过的长度 at 记，breaks 是朽断的几段（按长度）；pier 是伸进水里的栈桥 */
export interface Walk {
  readonly pts: readonly Point[]
  readonly at: readonly number[]
  readonly width: number
  readonly breaks: readonly { readonly a: number; readonly b: number }[]
  readonly pier: boolean
  readonly posts: readonly Point[]
}

/** 水洼：圆心、半径（格）与边缘的起伏 */
export interface Pond {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly wob: Wobble
}

/** 一丛香蒲：长在水里的那一点、多大（格），朝岸里的方向 */
export interface Reed {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly nx: number
  readonly ny: number
  readonly seed: number
}

/** 一片睡莲叶：圆心、半径（格），缺口朝哪（弧度），开不开花 */
export interface Lily {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly rot: number
  readonly bloom: boolean
}

/**
 * 这一局的泥潭，格：方框正中的岸线（每个方向一个半径），能走的地面（岸线以内、水洼与树干以外，加上伸进水里的栈桥）；
 * 实地的距离场（离实地边的有符号距离，实地里为正）；土墩、落羽杉、栈道、水洼、香蒲、泥眼、睡莲，与出怪口用的地标
 */
export interface SwampPlan {
  readonly seed: number
  readonly cx: number
  readonly cy: number
  readonly shore: Float32Array
  readonly basin: Basin
  readonly firm: { readonly cols: number; readonly rows: number; readonly x0: number; readonly y0: number; readonly d: Float32Array }
  readonly hummocks: readonly Hummock[]
  readonly trees: readonly Cypress[]
  readonly walks: readonly Walk[]
  readonly ponds: readonly Pond[]
  readonly reeds: readonly Reed[]
  readonly vents: readonly Point[]
  readonly lilies: readonly Lily[]
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly start: Point
}

const between = (rng: Rng, r: readonly [number, number]): number => r[0] + rng.next() * (r[1] - r[0])

function wobbleOf(rng: Rng, amp: number): Wobble {
  return { a: WOBBLE_ORDERS.map((_, i) => amp * (rng.next() * 0.6 + 0.4) / (i + 1)), p: WOBBLE_ORDERS.map(() => rng.next() * Math.PI * 2) }
}

/** 一圈在方向 a（弧度）上的半径倍数 */
export function wobbleAt(w: Wobble, a: number): number {
  let s = 1
  for (let i = 0; i < WOBBLE_ORDERS.length; i++) s += w.a[i]! * Math.sin(WOBBLE_ORDERS[i]! * a + w.p[i]!)
  return s
}

/** 起伏的圆里离边多远，格：圆里为正 */
export function blobDist(x0: number, y0: number, r: number, w: Wobble, x: number, y: number): number {
  const dx = x - x0
  const dy = y - y0
  return r * wobbleAt(w, Math.atan2(dy, dx)) - Math.hypot(dx, dy)
}

/** 岸线在方向 a 上离正中多远，格 */
export function shoreAt(plan: { readonly shore: Float32Array }, a: number): number {
  const n = plan.shore.length
  const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * n
  const i = Math.floor(f)
  const t = f - i
  return plan.shore[i % n]! * (1 - t) + plan.shore[(i + 1) % n]! * t
}

/** 离岸线多远，格：岸里为正 */
export function inShore(plan: { readonly shore: Float32Array; readonly cx: number; readonly cy: number }, x: number, y: number): number {
  const dx = x - plan.cx
  const dy = y - plan.cy
  return shoreAt(plan, Math.atan2(dy, dx)) - Math.hypot(dx, dy)
}

/** 点到折线最近处：离中线多远（格）、那一点沿线走过的长度，与越过两头多远（栈道两头是平的，越过端头的按端头那段的延长线量） */
export function nearWalk(w: Walk, x: number, y: number): { d: number; s: number; over: number } {
  let best = Infinity
  let s = 0
  let over = 0
  let off = 0
  const last = w.pts.length - 1
  for (let i = 1; i <= last; i++) {
    const a = w.pts[i - 1]!
    const b = w.pts[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const len = Math.sqrt(l2)
    const raw = l2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0
    const t = Math.max(0, Math.min(1, raw))
    const beyond = (i === 1 && raw < 0 ? -raw : 0) + (i === last && raw > 1 ? raw - 1 : 0)
    const d = beyond > 0 ? Math.abs((x - a.x) * dy - (y - a.y) * dx) / (len || 1) : Math.hypot(x - a.x - dx * t, y - a.y - dy * t)
    const reach = Math.hypot(d, beyond * len)
    if (reach < best) {
      best = reach
      s = w.at[i - 1]! + len * t
      over = beyond * len
      off = d
    }
  }
  return { d: off, s, over }
}

/** 栈道上离板边多远，格：板上为正，两头是平的；朽断的那几段不算栈道 */
export function walkDist(w: Walk, x: number, y: number): number {
  const n = nearWalk(w, x, y)
  const d = Math.min(w.width / 2 - n.d, n.over > 0 ? -n.over : Infinity)
  if (d <= -1) return d
  for (const b of w.breaks) if (n.s > b.a && n.s < b.b) return Math.min(d, -Math.min(n.s - b.a, b.b - n.s))
  return d
}

/** (x, y) 离实地边的有符号距离（格），实地里为正：土墩与栈道取最近的那块 */
export function firmExact(plan: Pick<SwampPlan, 'hummocks' | 'walks'>, x: number, y: number): number {
  let d = -Infinity
  for (const h of plan.hummocks) {
    if (Math.abs(x - h.x) > h.r * 1.6 + FIRM_CAP_U || Math.abs(y - h.y) > h.r * 1.6 + FIRM_CAP_U) continue
    d = Math.max(d, moundEdge(h, x, y))
  }
  for (const w of plan.walks) d = Math.max(d, walkDist(w, x, y))
  return Math.max(-FIRM_CAP_U, Math.min(FIRM_CAP_U, d))
}

/** (x, y) 像素处离实地边多远，格，实地里为正：从存好的距离场插值 */
export function firmAt(plan: SwampPlan, x: number, y: number): number {
  const f = plan.firm
  const u = Math.min(f.cols - 1.001, Math.max(0, x / UNIT / FIRM_CELL_U - f.x0 / FIRM_CELL_U - 0.5))
  const v = Math.min(f.rows - 1.001, Math.max(0, y / UNIT / FIRM_CELL_U - f.y0 / FIRM_CELL_U - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * f.cols + ix
  const a = f.d[i]!
  const b = f.d[i + 1]!
  const c = f.d[i + f.cols]!
  const e = f.d[i + f.cols + 1]!
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy
}

/** 在不在某个水洼里，格：水洼里为正 */
export function inPond(plan: Pick<SwampPlan, 'ponds'>, x: number, y: number): number {
  let d = -Infinity
  for (const p of plan.ponds) d = Math.max(d, blobDist(p.x, p.y, p.r, p.wob, x, y))
  return d
}

/** 在不在某棵落羽杉的树干里，格：树干里为正 */
export function inTrunk(plan: Pick<SwampPlan, 'trees'>, x: number, y: number): number {
  let d = -Infinity
  for (const t of plan.trees) if (!t.inWater) d = Math.max(d, t.trunk - Math.hypot(x - t.x, y - t.y))
  return d
}

/** 折线按走过的长度记下每个点 */
function lengths(pts: readonly Point[]): number[] {
  const at = [0]
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  return at
}

/** 沿折线走到 s 处的点与方向 */
export function walkPoint(w: Walk, s: number): { x: number; y: number; dx: number; dy: number } {
  for (let i = 1; i < w.pts.length; i++) {
    if (s > w.at[i]! && i < w.pts.length - 1) continue
    const a = w.pts[i - 1]!
    const b = w.pts[i]!
    const len = w.at[i]! - w.at[i - 1]! || 1
    const t = (s - w.at[i - 1]!) / len
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len }
  }
  const p = w.pts[0]!
  return { x: p.x, y: p.y, dx: 1, dy: 0 }
}

/** 从 from 到 to 的一条栈道：中间拐一下；在泥里那一截挑几处朽断；两边每隔一段立一根桩 */
function layWalk(rng: Rng, cfg: SwampConfig, from: Point, to: Point, pier: boolean, breakable: (x: number, y: number) => boolean): Walk {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const ny = dx / len
  const t = 0.4 + rng.next() * 0.25
  const bend = (rng.next() * 2 - 1) * Math.min(1.6, len * 0.12)
  const pts = [from, { x: from.x + dx * t + nx * bend, y: from.y + dy * t + ny * bend }, to]
  const at = lengths(pts)
  const total = at[at.length - 1]!
  const base: Walk = { pts, at, width: cfg.walks.widthU, breaks: [], pier, posts: [] }
  // 栈道上落在泥里的那几段：只在这里面挑朽断的地方，离两头的实地至少一格
  const open: number[] = []
  for (let s = 0; s <= total; s += 0.25) {
    const p = walkPoint(base, s)
    if (breakable(p.x, p.y)) open.push(s)
  }
  const breaks: { a: number; b: number }[] = []
  const want = rng.int(cfg.walks.breaks[0], cfg.walks.breaks[1])
  for (let k = 0, tries = 0; k < want && tries < 30 && open.length > 0; tries++) {
    const s = open[Math.floor(rng.next() * open.length)]!
    const half = between(rng, cfg.walks.breakU) / 2
    if (!open.includes(Math.round((s - half - 1) * 4) / 4) || !open.includes(Math.round((s + half + 1) * 4) / 4)) continue
    if (breaks.some((b) => s + half + 1.5 > b.a && s - half - 1.5 < b.b)) continue
    breaks.push({ a: s - half, b: s + half })
    k++
  }
  const posts: Point[] = []
  for (let s = POST_STEP_U * (0.3 + rng.next() * 0.4); s < total; s += POST_STEP_U) {
    if (breaks.some((b) => s > b.a - 0.2 && s < b.b + 0.2)) continue
    const p = walkPoint(base, s)
    for (const side of [-1, 1]) posts.push({ x: p.x - p.dy * side * (cfg.walks.widthU / 2 + 0.04), y: p.y + p.dx * side * (cfg.walks.widthU / 2 + 0.04) })
  }
  return { ...base, breaks, posts }
}

let last: { cfg: SwampConfig; seed: number; plan: SwampPlan } | null = null

/**
 * 这一局的泥潭，按种子定下：岸线是方框正中一圈起伏的圆；中间是开局站的土台，往外一圈落羽杉的盘根土台，中间散着几处水洼；
 * 泥里散着草墩；木栈道从开局土台通往几座落羽杉土台，另一条伸出岸外成一座栈桥；岸边水里长着香蒲与几棵落羽杉，泥里有冒泡的泥眼；水面漂着睡莲。
 * 生成不出该有的东西（土台、栈道摆不下）就换一组随机数
 */
export function swampPlan(cfg: SwampConfig, seed: number): SwampPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(seed)
  let plan: SwampPlan | null = null
  for (let i = 0; i < TRIES && !plan; i++) plan = tryPlan(cfg, rng, seed)
  if (!plan) throw new Error(`泥潭种子 ${seed} 试了 ${TRIES} 次也摆不下`)
  last = { cfg, seed, plan }
  return plan
}

function tryPlan(cfg: SwampConfig, rng: Rng, seed: number): SwampPlan | null {
  const cx = FRAME_U / 2
  const cy = FRAME_U / 2
  const maxR = FRAME_U / 2 - SAFE_U
  // 岸线：几阶谐波叠出起伏，夹在给的范围里
  const [r0, r1] = cfg.shore.radiusU
  const mid = (r0 + r1) / 2
  const amp = (r1 - r0) / 2
  const shore = new Float32Array(SHORE_SAMPLES)
  const orders = [2, 3, 4, 6, 9].map((k) => ({ k, a: (rng.next() * 0.7 + 0.3) / Math.sqrt(k), p: rng.next() * Math.PI * 2 }))
  const norm = orders.reduce((s, o) => s + o.a, 0)
  for (let i = 0; i < SHORE_SAMPLES; i++) {
    const a = (i / SHORE_SAMPLES) * Math.PI * 2
    let s = 0
    for (const o of orders) s += o.a * Math.sin(o.k * a + o.p)
    shore[i] = Math.min(maxR, mid + (amp * s) / norm * 1.6)
  }
  const sh = { shore, cx, cy }
  const angleOf = (x: number, y: number): number => Math.atan2(y - cy, x - cx)

  const hummocks: Hummock[] = [{ x: cx, y: cy, r: cfg.plaza.radiusU, wob: wobbleOf(rng, cfg.plaza.wobble), rag: RAG.plaza, seed: Math.floor(rng.next() * 0xffff), kind: 'plaza' }]
  const trees: Cypress[] = []
  const ponds: Pond[] = []
  const clearOf = (x: number, y: number, r: number, gap: number): boolean => hummocks.every((h) => Math.hypot(x - h.x, y - h.y) >= (h.r + r) * WOBBLE_REACH + gap) && ponds.every((p) => Math.hypot(x - p.x, y - p.y) >= (p.r + r) * WOBBLE_REACH + gap)

  // 落羽杉的盘根土台：在一圈上大致均匀地摆开
  const c = cfg.cypress
  const want = rng.int(c.count[0], c.count[1])
  const turn = rng.next() * Math.PI * 2
  for (let k = 0; k < want; k++) {
    let ok = false
    for (let t = 0; t < 24 && !ok; t++) {
      const a = turn + ((k + 0.5 + (rng.next() - 0.5) * 0.6) / want) * Math.PI * 2
      const r = between(rng, c.moundU)
      const d = between(rng, c.ringU)
      const x = cx + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      if (inShore(sh, x, y) < r * WOBBLE_REACH + 1.2 || !clearOf(x, y, r, c.gapU)) continue
      hummocks.push({ x, y, r, wob: wobbleOf(rng, 0.14), rag: RAG.mound, seed: Math.floor(rng.next() * 0xffff), kind: 'mound' })
      const off = rng.next() * Math.PI * 2
      const lean = rng.next() * r * 0.18
      trees.push({ x: x + Math.cos(off) * lean, y: y + Math.sin(off) * lean, trunk: between(rng, c.trunkU), h: between(rng, c.heightM), crown: r * (0.78 + rng.next() * 0.14), inWater: false, seed: Math.floor(rng.next() * 0x7fffffff) })
      ok = true
    }
  }
  if (trees.length < c.count[0]) return null

  // 水洼：落在土台之间的泥里
  const np = rng.int(cfg.ponds.count[0], cfg.ponds.count[1])
  for (let k = 0, t = 0; k < np && t < 80; t++) {
    const a = rng.next() * Math.PI * 2
    const r = between(rng, cfg.ponds.radiusU)
    const d = cfg.plaza.radiusU + cfg.ponds.clearU + r + rng.next() * 8
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    if (inShore(sh, x, y) < r * WOBBLE_REACH + cfg.ponds.clearU || !clearOf(x, y, r, cfg.ponds.clearU)) continue
    ponds.push({ x, y, r, wob: wobbleOf(rng, 0.18) })
    k++
  }
  if (ponds.length < cfg.ponds.count[0]) return null

  // 木栈道：通往最近的几座土台，再挑一处没有土台挡着的岸伸出一座栈桥
  const breakable = (x: number, y: number): boolean => hummocks.every((h) => moundEdge(h, x, y) < -0.3) && inShore(sh, x, y) > 0.8 && inPond({ ponds }, x, y) < -0.8
  const dry = (w: Walk): boolean => {
    for (let s = 0; s <= w.at[w.at.length - 1]!; s += 0.25) {
      const p = walkPoint(w, s)
      if (inPond({ ponds }, p.x, p.y) > -w.width) return false
    }
    return true
  }
  const walks: Walk[] = []
  const nw = rng.int(cfg.walks.count[0], cfg.walks.count[1])
  const mounds = hummocks.filter((h) => h.kind === 'mound').sort(() => rng.next() - 0.5)
  for (const m of mounds) {
    if (walks.length >= nw) break
    // 栈道铺到土台上离树干还有一截的地方
    const t = trees.find((q) => Math.hypot(q.x - m.x, q.y - m.y) < m.r)!
    const d = Math.hypot(t.x - cx, t.y - cy)
    const stop = Math.max(m.r * 0.5, t.trunk * 1.5 + 0.5)
    const ux = (t.x - cx) / d
    const uy = (t.y - cy) / d
    const from = cfg.plaza.radiusU * 0.6
    const w = layWalk(rng, cfg, { x: cx + ux * from, y: cy + uy * from }, { x: t.x - ux * stop, y: t.y - uy * stop }, false, breakable)
    if (dry(w)) walks.push(w)
  }
  if (walks.length < cfg.walks.count[0]) return null
  const taken = [...mounds.map((m) => angleOf(m.x, m.y)), ...ponds.map((p) => angleOf(p.x, p.y))]
  let pierA = 0
  let best = -1
  // 栈桥伸得出去（岸外留得下）的方向里，挑离土台与水洼最远的；哪个方向都伸不出去就换一组随机数
  for (let k = 0; k < 36; k++) {
    const a = rng.next() * Math.PI * 2
    if (maxR - 0.5 - shoreAt(sh, a) < PIER_OUT_U) continue
    const gap = Math.min(...taken.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))))
    if (gap > best) {
      best = gap
      pierA = a
    }
  }
  if (best < 0) return null
  const reach = shoreAt(sh, pierA) + PIER_OUT_U
  const from = cfg.plaza.radiusU * 0.6
  const pier = layWalk(rng, cfg, { x: cx + Math.cos(pierA) * from, y: cy + Math.sin(pierA) * from }, { x: cx + Math.cos(pierA) * reach, y: cy + Math.sin(pierA) * reach }, true, breakable)
  if (!dry(pier)) return null
  walks.push(pier)

  // 草墩：散在泥里
  const t = cfg.tussocks
  const nt = rng.int(t.count[0], t.count[1])
  const walkSolid = (x: number, y: number, r: number): boolean => walks.some((w) => nearWalk(w, x, y).d < w.width / 2 + r + t.gapU)
  for (let k = 0, tries = 0; k < nt && tries < 400; tries++) {
    const r = between(rng, t.radiusU)
    const a = rng.next() * Math.PI * 2
    const d = cfg.plaza.radiusU + 1.5 + rng.next() * (mid - cfg.plaza.radiusU)
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    if (inShore(sh, x, y) < r + 1 || !clearOf(x, y, r, t.gapU) || walkSolid(x, y, r)) continue
    hummocks.push({ x, y, r, wob: wobbleOf(rng, 0.2), rag: RAG.tussock, seed: Math.floor(rng.next() * 0xffff), kind: 'tussock' })
    k++
  }

  // 岸外水里的落羽杉：只露树冠，挡在方框以内
  const ns = rng.int(c.shoreCount[0], c.shoreCount[1])
  for (let k = 0; k < ns; k++) {
    const a = rng.next() * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - pierA), Math.cos(a - pierA))) < 0.35) continue
    const d = shoreAt(sh, a) + 0.8 + rng.next() * 2.4
    const crown = between(rng, c.moundU) * 1.2
    const x = Math.min(FRAME_U - crown, Math.max(crown, cx + Math.cos(a) * d))
    const y = Math.min(FRAME_U - crown, Math.max(crown, cy + Math.sin(a) * d))
    trees.push({ x, y, trunk: between(rng, c.trunkU), h: between(rng, c.heightM), crown, inWater: true, seed: Math.floor(rng.next() * 0x7fffffff) })
  }

  const solid = { hummocks, walks }
  const basinSide = Math.ceil((2 * (maxR + 1)) / BASIN_CELL_U)
  const b0 = (cx - (basinSide * BASIN_CELL_U) / 2) * UNIT
  const wet = { shore, cx, cy, ponds, trees }
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    if (inTrunk(wet, x, y) > 0) return false
    if (walks.some((w) => w.pier && walkDist(w, x, y) > 0)) return true
    return inShore(wet, x, y) > 0 && inPond(wet, x, y) < 0
  }
  const basin = makeBasin(open, b0, b0, basinSide, basinSide, BASIN_CELL_U * UNIT, { x: cx * UNIT, y: cy * UNIT }, cfg.shore.neckU * UNIT)

  const fc = Math.ceil((2 * (maxR + 1)) / FIRM_CELL_U)
  const fx0 = cx - (fc * FIRM_CELL_U) / 2
  const d = new Float32Array(fc * fc)
  for (let j = 0; j < fc; j++) for (let i = 0; i < fc; i++) d[j * fc + i] = firmExact(solid, fx0 + (i + 0.5) * FIRM_CELL_U, fx0 + (j + 0.5) * FIRM_CELL_U)
  const firm = { cols: fc, rows: fc, x0: fx0, y0: fx0, d }

  // 泥眼：泥里离实地、岸与水洼都远一点的地方
  const vents: Point[] = []
  const nv = rng.int(cfg.vents.count[0], cfg.vents.count[1])
  for (let k = 0, tries = 0; k < nv && tries < 400; tries++) {
    const a = rng.next() * Math.PI * 2
    const r = cfg.plaza.radiusU + 1 + rng.next() * (mid - cfg.plaza.radiusU)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (firmExact(solid, x, y) > -cfg.vents.clearU || inShore(wet, x, y) < 1.8 || inPond(wet, x, y) > -1.5 || inTrunk(wet, x, y) > -1) continue
    if (vents.some((v) => Math.hypot(v.x - x, v.y - y) < 3)) continue
    vents.push({ x, y })
    k++
  }

  // 香蒲：岸边水里一丛丛，避开栈桥
  const reeds: Reed[] = []
  const nr = rng.int(cfg.reeds[0], cfg.reeds[1])
  for (let k = 0, tries = 0; k < nr && tries < 200; tries++) {
    const a = rng.next() * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - pierA), Math.cos(a - pierA))) < 0.3) continue
    if (reeds.some((r) => Math.abs(Math.atan2(Math.sin(a - Math.atan2(r.y - cy, r.x - cx)), Math.cos(a - Math.atan2(r.y - cy, r.x - cx)))) < 0.32)) continue
    const R = shoreAt(sh, a)
    const out = 0.5 + rng.next() * 0.6
    reeds.push({ x: cx + Math.cos(a) * (R + out), y: cy + Math.sin(a) * (R + out), r: 0.8 + rng.next() * 0.7, nx: -Math.cos(a), ny: -Math.sin(a), seed: Math.floor(rng.next() * 0x7fffffff) })
    k++
  }

  // 睡莲：岸外一圈与水洼里，一簇簇的
  const lilies: Lily[] = []
  const nl = rng.int(LILIES[0], LILIES[1])
  for (let tries = 0; lilies.length < nl && tries < 2000; tries++) {
    let x: number
    let y: number
    if (rng.next() < 0.22 && ponds.length > 0) {
      const p = ponds[Math.floor(rng.next() * ponds.length)]!
      const a = rng.next() * Math.PI * 2
      const r = Math.sqrt(rng.next()) * p.r
      x = p.x + Math.cos(a) * r
      y = p.y + Math.sin(a) * r
      if (inPond(wet, x, y) < 0.35) continue
    } else {
      const a = rng.next() * Math.PI * 2
      const r = shoreAt(sh, a) + 0.5 + rng.next() * rng.next() * 6
      x = cx + Math.cos(a) * r
      y = cy + Math.sin(a) * r
      if (x < 0.5 || y < 0.5 || x > FRAME_U - 0.5 || y > FRAME_U - 0.5) continue
    }
    const r = between(rng, LILY_U)
    if (lilies.some((l) => Math.hypot(l.x - x, l.y - y) < l.r + r)) continue
    if (walks.some((w) => w.pier && nearWalk(w, x, y).d < w.width / 2 + r + 0.2)) continue
    lilies.push({ x, y, r, rot: rng.next() * Math.PI * 2, bloom: rng.next() < LILY_BLOOM })
  }

  const marks: Record<string, Landmark[]> = {
    reeds: reeds.map((r) => {
      const a = Math.atan2(r.y - cy, r.x - cx)
      const R = shoreAt(sh, a) - 0.4
      return { x: (cx + Math.cos(a) * R) * UNIT, y: (cy + Math.sin(a) * R) * UNIT, r: 0.6 * UNIT, nx: r.nx, ny: r.ny }
    }),
    bog: vents.map((v) => ({ x: v.x * UNIT, y: v.y * UNIT, r: 0.5 * UNIT, nx: 0, ny: 0 })),
    pond: ponds.flatMap((p) => [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2 + p.x
      const R = p.r * wobbleAt(p.wob, a) + 0.5
      return { x: (p.x + Math.cos(a) * R) * UNIT, y: (p.y + Math.sin(a) * R) * UNIT, r: 0.5 * UNIT, nx: Math.cos(a), ny: Math.sin(a) }
    })),
  }
  return { seed, cx, cy, shore, basin, firm, hummocks, trees, walks, ponds, reeds, vents, lilies, marks, start: { x: cx, y: cy } }
}
