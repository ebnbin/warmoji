import { FRAME_U } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import type { TaleConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 按这么细的格子（格）记每一处属于哪一块：规则的地面、分块的邻接与块心都按它 */
export const GRID_U = 0.25
/** 边界按噪声扭开时噪声的波长，格 */
const WARP_WAVE_U = 3.1
/** 两块交界至少这么长（格）才算挨着：只碰上一个角的两块之间走不过去 */
const TOUCH_U = 1.25
/** 太小的块（面积不到块距平方的这么多倍）去掉块心，并进旁边的块 */
const TINY = 0.3
/** 块心之间至少隔块距的这么多倍，离页边至少这么多倍 */
const SEED_GAP = 0.86
const SEED_EDGE = 0.25
/** 开局那一块落在起点角到对角的这么远处 */
const FIRST_AT = 0.3
/** 每块轮廓按块心往外几个方向取点 */
export const RING = 96
/** 画的先后按块心在对角线上的投影排，再抖这么多（占对角线长的比例） */
const RANK_JITTER = 0.06

/** 页面上以格计的一块矩形 */
export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 一块的分区种子：位置与幂距离的权重（格²），权重大的块长得大 */
export interface Seed {
  readonly x: number
  readonly y: number
  readonly w: number
}

/**
 * 一块地面，格：分区种子；离边最远的那一点（块心）与它离边多远；轮廓从块心按 RING 个方向取点，第 k 个在 a0 + 2πk/RING 方向；
 * rank 是作者画它的先后（按对角线排），near 是挨着的块；四季里各画成哪一章（0 或 1）；面积
 */
export interface Patch {
  readonly seed: Seed
  readonly cx: number
  readonly cy: number
  readonly inner: number
  readonly a0: number
  readonly ring: readonly Point[]
  readonly rank: number
  readonly near: readonly number[]
  readonly chapters: readonly [number, number, number, number]
  readonly area: number
}

/**
 * 这一页，格：页面与能画的区域；边界的扭法；各块；开局那一块与开局那一片（按描的先后）；作者从哪一角往哪一角走；
 * 按 GRID_U 的格子记的每处属于哪一块（-1 是页边），格子 (0, 0) 的左上角在页面的左上角
 */
export interface TalePlan {
  readonly page: Box
  readonly inner: Box
  readonly warpU: number
  readonly warpSeed: number
  readonly patches: readonly Patch[]
  readonly first: number
  readonly opening: readonly number[]
  readonly from: Point
  readonly to: Point
  readonly cols: number
  readonly rows: number
  readonly ids: Int16Array
  readonly seed: number
}

/** 一处属于哪一块与离这块的边多远（格）：页边以外是 -1 */
export interface Owner {
  id: number
  edge: number
}

/** 页面摆在方框正中 */
export function pageBox(cfg: TaleConfig): Box {
  const x0 = (FRAME_U - cfg.page.wU) / 2
  const y0 = (FRAME_U - cfg.page.hU) / 2
  return { x0, y0, x1: x0 + cfg.page.wU, y1: y0 + cfg.page.hU }
}

/**
 * (x, y) 格属于哪一块：先按噪声把这一点扭开，再取幂距离 |q − s|² − w 最小的种子；离边多远按扭开以后到两块的根轴的距离、与到能画的区域的边的距离取小
 */
export function ownerAt(seeds: readonly Seed[], inner: Box, warpU: number, warpSeed: number, x: number, y: number, out: Owner): Owner {
  const side = Math.min(x - inner.x0, inner.x1 - x, y - inner.y0, inner.y1 - y)
  if (side < 0) {
    out.id = -1
    out.edge = side
    return out
  }
  const qx = x + (fbm(x / WARP_WAVE_U, y / WARP_WAVE_U, warpSeed, 2) - 0.5) * 2.5 * warpU
  const qy = y + (fbm(x / WARP_WAVE_U, y / WARP_WAVE_U, warpSeed + 77, 2) - 0.5) * 2.5 * warpU
  let best = -1
  let bd = Infinity
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]!
    const d = (qx - s.x) ** 2 + (qy - s.y) ** 2 - s.w
    if (d < bd) {
      bd = d
      best = i
    }
  }
  const b = seeds[best]!
  let edge = side
  for (let j = 0; j < seeds.length; j++) {
    if (j === best) continue
    const s = seeds[j]!
    const gap = Math.hypot(s.x - b.x, s.y - b.y)
    const dj = (qx - s.x) ** 2 + (qy - s.y) ** 2 - s.w
    edge = Math.min(edge, (dj - bd) / (2 * gap))
  }
  out.id = best
  out.edge = edge
  return out
}

/** 块心之间按块距撒点：开局那一块先占住，别的离它更远；页边留一点 */
function scatter(rng: Rng, cfg: TaleConfig, inner: Box, first: Seed): Seed[] {
  const sp = cfg.patch.spacingU
  const out: Seed[] = [first]
  const pad = sp * SEED_EDGE
  const firstGap = cfg.patch.firstU + sp * 0.5
  for (let t = 0; t < 6000; t++) {
    const x = inner.x0 + pad + rng.next() * (inner.x1 - inner.x0 - pad * 2)
    const y = inner.y0 + pad + rng.next() * (inner.y1 - inner.y0 - pad * 2)
    if (Math.hypot(x - first.x, y - first.y) < firstGap) continue
    if (out.some((s, i) => i > 0 && Math.hypot(x - s.x, y - s.y) < sp * SEED_GAP)) continue
    out.push({ x, y, w: 0 })
  }
  return out
}

/** 按种子把能画的区域分进各块：每格属于哪一块，各块占了几格 */
function label(seeds: readonly Seed[], page: Box, inner: Box, warpU: number, warpSeed: number, cols: number, rows: number): { ids: Int16Array; edge: Float32Array; count: Int32Array } {
  const ids = new Int16Array(cols * rows)
  const edge = new Float32Array(cols * rows)
  const count = new Int32Array(seeds.length)
  const o: Owner = { id: -1, edge: 0 }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      ownerAt(seeds, inner, warpU, warpSeed, page.x0 + (c + 0.5) * GRID_U, page.y0 + (r + 0.5) * GRID_U, o)
      ids[i] = o.id
      edge[i] = o.edge
      if (o.id >= 0) count[o.id]!++
    }
  }
  return { ids, edge, count }
}

let last: { cfg: TaleConfig; seed: number; plan: TalePlan } | null = null

/**
 * 这一页，按种子定下：起点是随机的一角，作者往对角走；开局那一块落在离起点三成对角线处，块心按块距撒满能画的区域，太小的块并进旁边；
 * 各块按块心在对角线上的投影（抖一抖）排出画的先后。开局那一片从开局那一块起，每次添上挨着的块里排得最前的，添到全部块数的 share 为止，
 * 再按离开局那一块的远近（隔几块）排出开局描的先后
 */
export function talePlan(cfg: TaleConfig, seed: number): TalePlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(seed)
  const page = pageBox(cfg)
  const m = cfg.page.marginU
  const inner: Box = { x0: page.x0 + m, y0: page.y0 + m, x1: page.x1 - m, y1: page.y1 - m }
  const corner = rng.int(0, 3)
  const from = { x: corner % 2 === 0 ? inner.x0 : inner.x1, y: corner < 2 ? inner.y0 : inner.y1 }
  const to = { x: inner.x0 + inner.x1 - from.x, y: inner.y0 + inner.y1 - from.y }
  const sp = cfg.patch.spacingU
  const f = cfg.patch.firstU
  const keep = f + 0.3
  const fx = Math.min(inner.x1 - keep, Math.max(inner.x0 + keep, from.x + (to.x - from.x) * FIRST_AT))
  const fy = Math.min(inner.y1 - keep, Math.max(inner.y0 + keep, from.y + (to.y - from.y) * FIRST_AT))
  const first: Seed = { x: fx, y: fy, w: f * f - (sp * sp) / 4 }
  const warpSeed = Math.floor(rng.next() * 0x7fffffff)
  const cols = Math.round((page.x1 - page.x0) / GRID_U)
  const rows = Math.round((page.y1 - page.y0) / GRID_U)
  let seeds = scatter(rng, cfg, inner, first)
  let lab = label(seeds, page, inner, cfg.patch.warpU, warpSeed, cols, rows)
  const tiny = (TINY * sp * sp) / (GRID_U * GRID_U)
  if (lab.count.some((n, i) => i > 0 && n < tiny)) {
    seeds = seeds.filter((_, i) => i === 0 || lab.count[i]! >= tiny)
    lab = label(seeds, page, inner, cfg.patch.warpU, warpSeed, cols, rows)
  }
  const { ids, edge, count } = lab
  const n = seeds.length

  // 邻接：两块之间横竖相邻的格边加起来够长
  const touch = new Float32Array(n * n)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = ids[r * cols + c]!
      if (a < 0) continue
      const right = c + 1 < cols ? ids[r * cols + c + 1]! : -1
      const down = r + 1 < rows ? ids[(r + 1) * cols + c]! : -1
      for (const b of [right, down]) {
        if (b < 0 || b === a) continue
        touch[a * n + b]! += GRID_U
        touch[b * n + a]! += GRID_U
      }
    }
  }
  const near: number[][] = Array.from({ length: n }, () => [])
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && touch[a * n + b]! >= TOUCH_U) near[a]!.push(b)

  // 块心：离边最远的格
  const pole = Array.from({ length: n }, () => ({ x: 0, y: 0, d: -Infinity }))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const id = ids[i]!
      if (id < 0 || edge[i]! <= pole[id]!.d) continue
      pole[id] = { x: page.x0 + (c + 0.5) * GRID_U, y: page.y0 + (r + 0.5) * GRID_U, d: edge[i]! }
    }
  }

  // 轮廓：从块心按方向往外走到出了这一块，再二分出边
  const o: Owner = { id: -1, edge: 0 }
  const inside = (id: number, x: number, y: number): boolean => ownerAt(seeds, inner, cfg.patch.warpU, warpSeed, x, y, o).id === id
  const rings = pole.map((p, id) => {
    const a0 = rng.next() * Math.PI * 2
    const ring: Point[] = []
    for (let k = 0; k < RING; k++) {
      const a = a0 + (k / RING) * Math.PI * 2
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      let lo = 0
      let hi = 0.1
      while (hi < sp * 3 && inside(id, p.x + dx * hi, p.y + dy * hi)) {
        lo = hi
        hi += 0.1
      }
      for (let it = 0; it < 7; it++) {
        const mid = (lo + hi) / 2
        if (inside(id, p.x + dx * mid, p.y + dy * mid)) lo = mid
        else hi = mid
      }
      ring.push({ x: p.x + dx * lo, y: p.y + dy * lo })
    }
    return { a0, ring }
  })

  // 画的先后：块心在对角线上的投影
  const ax = to.x - from.x
  const ay = to.y - from.y
  const len2 = ax * ax + ay * ay
  const along = pole.map((p) => ((p.x - from.x) * ax + (p.y - from.y) * ay) / len2 + (rng.next() * 2 - 1) * RANK_JITTER)
  const order = along.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const rank = new Int32Array(n)
  order.forEach((e, k) => (rank[e.i] = k))

  // 开局那一片
  const size = Math.max(1, Math.min(n, Math.round(cfg.share * n)))
  const win = new Set<number>([0])
  while (win.size < size) {
    let pick = -1
    for (const a of win) for (const b of near[a]!) if (!win.has(b) && (pick < 0 || rank[b]! < rank[pick]!)) pick = b
    if (pick < 0) break
    win.add(pick)
  }
  const hops = new Map<number, number>([[0, 0]])
  const queue = [0]
  while (queue.length > 0) {
    const a = queue.shift()!
    for (const b of near[a]!) {
      if (!win.has(b) || hops.has(b)) continue
      hops.set(b, hops.get(a)! + 1)
      queue.push(b)
    }
  }
  const d0 = (i: number): number => Math.hypot(pole[i]!.x - pole[0]!.x, pole[i]!.y - pole[0]!.y)
  const opening = [...win].sort((a, b) => hops.get(a)! - hops.get(b)! || d0(a) - d0(b))

  const patches: Patch[] = seeds.map((s, i) => ({
    seed: s,
    cx: pole[i]!.x,
    cy: pole[i]!.y,
    inner: pole[i]!.d,
    a0: rings[i]!.a0,
    ring: rings[i]!.ring,
    rank: rank[i]!,
    near: near[i]!,
    chapters: [rng.int(0, 1), rng.int(0, 1), rng.int(0, 1), rng.int(0, 1)],
    area: count[i]! * GRID_U * GRID_U,
  }))
  const plan: TalePlan = { page, inner, warpU: cfg.patch.warpU, warpSeed, patches, first: 0, opening, from, to, cols, rows, ids, seed }
  last = { cfg, seed, plan }
  return plan
}

/** (x, y) 格处属于哪一块，页边与页面外是 -1 */
export function patchAt(plan: TalePlan, x: number, y: number): number {
  const c = Math.floor((x - plan.page.x0) / GRID_U)
  const r = Math.floor((y - plan.page.y0) / GRID_U)
  if (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows) return -1
  return plan.ids[r * plan.cols + c]!
}

/** 轮廓上走到 t（0 到 1，从 a0 方向起绕一圈）的那一点，格 */
export function ringAt(p: Patch, t: number): Point {
  const k = (((t % 1) + 1) % 1) * RING
  const i = Math.floor(k)
  const a = p.ring[i % RING]!
  const b = p.ring[(i + 1) % RING]!
  const f = k - i
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}
