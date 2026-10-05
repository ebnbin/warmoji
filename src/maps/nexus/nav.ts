import { roomAt } from '../basin.ts'
import { UNIT } from '../../util/units.ts'
import type { Basin } from '../basin'
import type { Hall, WarpSpot } from './layout'

/** 寻路的格子多大，格：门线落在格线上，也就落在寻路格的格线上 */
export const NAV_CELL_U = 0.5
/** 格心离障碍至少这么远（格）才算走得通 */
const NAV_ROOM_U = 0.3

/** 一格的四边里被门线挡住的：越过门线不是走到隔壁，而是走到另一扇门那边 */
const EAST = 1
const WEST = 2
const SOUTH = 4
const NORTH = 8
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const

/**
 * 认得传送门的寻路：大厅外接方形上 NAV_CELL_U 格一格，从队长那一格往外按 Dijkstra 算到每一格要走多远、下一步往哪一格走。
 * 一格越过门线的那一边不通隔壁，通到另一扇门另一侧的对应格（走一格的路）；hop 记着往下一步走时穿过的是哪扇门
 */
export interface NavGrid {
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly rows: number
  /** 只看地面走不走得通 */
  readonly base: Uint8Array
  /** 再扣掉此刻门柱占着的格 */
  readonly open: Uint8Array
  readonly sides: Uint8Array
  readonly link: Int32Array
  readonly linkWarp: Int16Array
  /** 到队长那一格的路长，格（不是寻路格）；走不到为 Infinity */
  readonly dist: Float32Array
  readonly next: Int32Array
  readonly hop: Int16Array
  src: number
  readonly heap: Heap
}

/** 按路长取最小的二叉堆：同一格可以进堆多次，取出时比路长认旧 */
interface Heap {
  readonly key: Float64Array
  readonly val: Int32Array
  size: number
}

function push(h: Heap, k: number, v: number): void {
  let i = h.size++
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h.key[p]! <= k) break
    h.key[i] = h.key[p]!
    h.val[i] = h.val[p]!
    i = p
  }
  h.key[i] = k
  h.val[i] = v
}

function pop(h: Heap): number {
  const top = h.val[0]!
  const k = h.key[--h.size]!
  const v = h.val[h.size]!
  let i = 0
  for (;;) {
    let c = 2 * i + 1
    if (c >= h.size) break
    if (c + 1 < h.size && h.key[c + 1]! < h.key[c]!) c++
    if (h.key[c]! >= k) break
    h.key[i] = h.key[c]!
    h.val[i] = h.val[c]!
    i = c
  }
  h.key[i] = k
  h.val[i] = v
  return top
}

/** 寻路格铺满大厅的外接方形，按能走的地面定哪些格走得通 */
export function makeNav(hall: Hall, basin: Basin): NavGrid {
  const x0 = Math.floor(hall.x0)
  const y0 = Math.floor(hall.y0)
  const cols = Math.ceil((hall.x1 - x0) / NAV_CELL_U)
  const rows = Math.ceil((hall.y1 - y0) / NAV_CELL_U)
  const n = cols * rows
  const base = new Uint8Array(n)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * NAV_CELL_U
      const y = y0 + (r + 0.5) * NAV_CELL_U
      base[r * cols + c] = roomAt(basin, x * UNIT, y * UNIT) >= NAV_ROOM_U * UNIT ? 1 : 0
    }
  }
  return {
    x0,
    y0,
    cols,
    rows,
    base,
    open: new Uint8Array(n),
    sides: new Uint8Array(n),
    link: new Int32Array(n).fill(-1),
    linkWarp: new Int16Array(n).fill(-1),
    dist: new Float32Array(n).fill(Infinity),
    next: new Int32Array(n).fill(-1),
    hop: new Int16Array(n).fill(-1),
    src: -1,
    heap: { key: new Float64Array(n * DIRS.length + n + 1), val: new Int32Array(n * DIRS.length + n + 1), size: 0 },
  }
}

/** (x, y)（格）落在哪一格，格子外为 −1 */
export function navCell(nav: NavGrid, x: number, y: number): number {
  const c = Math.floor((x - nav.x0) / NAV_CELL_U)
  const r = Math.floor((y - nav.y0) / NAV_CELL_U)
  return c < 0 || r < 0 || c >= nav.cols || r >= nav.rows ? -1 : r * nav.cols + c
}

/** 第 i 格的格心，格 */
export function navCenter(nav: NavGrid, i: number): { x: number; y: number } {
  const c = i % nav.cols
  return { x: nav.x0 + (c + 0.5) * NAV_CELL_U, y: nav.y0 + ((i - c) / nav.cols + 0.5) * NAV_CELL_U }
}

/**
 * 按此刻的门重铺：posts（格）是挡身体的门柱，占着的格不通；门线两侧的格互不相通，改通到另一扇门另一侧的对应格。
 * warps 按对排，第 k 扇的另一扇是 k ^ 1（正挪着的门照旧通，到时候才换）
 */
export function relink(nav: NavGrid, warps: readonly WarpSpot[], posts: readonly { x: number; y: number }[], len: number, post: number): void {
  const { cols, rows, open, sides, link, linkWarp } = nav
  const reach = post + NAV_ROOM_U
  open.set(nav.base)
  sides.fill(0)
  link.fill(-1)
  linkWarp.fill(-1)
  for (const p of posts) {
    for (let r = Math.max(0, Math.floor((p.y - reach - nav.y0) / NAV_CELL_U)); r < rows && nav.y0 + r * NAV_CELL_U < p.y + reach; r++) {
      for (let c = Math.max(0, Math.floor((p.x - reach - nav.x0) / NAV_CELL_U)); c < cols && nav.x0 + c * NAV_CELL_U < p.x + reach; c++) {
        const x = nav.x0 + (c + 0.5) * NAV_CELL_U
        const y = nav.y0 + (r + 0.5) * NAV_CELL_U
        if (Math.hypot(x - p.x, y - p.y) < reach) open[r * cols + c] = 0
      }
    }
  }
  const steps = Math.round(len / NAV_CELL_U)
  warps.forEach((w, i) => {
    const o = warps[i ^ 1]
    if (!o) return
    // 门线左上侧的那一排（列）与右下侧的那一排（列），以及另一扇门的
    const line = Math.round(((w.axis === 0 ? w.x - nav.x0 : w.y - nav.y0) / NAV_CELL_U))
    const from = Math.round(((w.axis === 0 ? w.y - nav.y0 : w.x - nav.x0) / NAV_CELL_U))
    const oline = Math.round(((o.axis === 0 ? o.x - nav.x0 : o.y - nav.y0) / NAV_CELL_U))
    const ofrom = Math.round(((o.axis === 0 ? o.y - nav.y0 : o.x - nav.x0) / NAV_CELL_U))
    const at = (ln: number, k: number): number => {
      const c = w.axis === 0 ? ln : k
      const r = w.axis === 0 ? k : ln
      return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c
    }
    for (let k = 0; k < steps; k++) {
      const neg = at(line - 1, from + k)
      const pos = at(line, from + k)
      if (neg >= 0) sides[neg]! |= w.axis === 0 ? EAST : SOUTH
      if (pos >= 0) sides[pos]! |= w.axis === 0 ? WEST : NORTH
      // 从负侧越过这扇门，到另一扇门的正侧；从正侧越过，到另一扇门的负侧
      const oneg = at(oline - 1, ofrom + k)
      const opos = at(oline, ofrom + k)
      if (neg >= 0 && opos >= 0 && open[neg] && open[opos]) {
        link[neg] = opos
        linkWarp[neg] = i
      }
      if (pos >= 0 && oneg >= 0 && open[pos] && open[oneg]) {
        link[pos] = oneg
        linkWarp[pos] = i
      }
    }
  })
  nav.src = -1
}

/** 从 a 格往 (dx, dy) 迈一步过不过得去：门线挡着的那一边不通，斜着走要两条折线都通 */
function passable(nav: NavGrid, a: number, dx: number, dy: number): boolean {
  const { cols, open, sides } = nav
  const ax = a % cols
  const ay = (a - ax) / cols
  const bx = ax + dx
  const by = ay + dy
  if (bx < 0 || by < 0 || bx >= cols || by >= nav.rows || !open[by * cols + bx]) return false
  if (dx !== 0 && dy !== 0) return passable(nav, a, dx, 0) && passable(nav, ay * cols + bx, 0, dy) && passable(nav, a, 0, dy) && passable(nav, by * cols + ax, dx, 0)
  const s = sides[a]!
  if (dx > 0) return (s & EAST) === 0
  if (dx < 0) return (s & WEST) === 0
  if (dy > 0) return (s & SOUTH) === 0
  return (s & NORTH) === 0
}

/** 走得通、最近的一格：(x, y) 所在的格不通就看四周一圈，格 */
export function navNear(nav: NavGrid, x: number, y: number): number {
  const i = navCell(nav, x, y)
  if (i >= 0 && nav.open[i]) return i
  let best = -1
  let bestD = Infinity
  const cx = Math.floor((x - nav.x0) / NAV_CELL_U)
  const cy = Math.floor((y - nav.y0) / NAV_CELL_U)
  for (let r = cy - 2; r <= cy + 2; r++) {
    for (let c = cx - 2; c <= cx + 2; c++) {
      if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) continue
      const j = r * nav.cols + c
      if (!nav.open[j]) continue
      const p = navCenter(nav, j)
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bestD) {
        bestD = d
        best = j
      }
    }
  }
  return best
}

/** 从 (x, y)（格）那一格往外算：每格到它要走多远、下一步往哪走 */
export function flowNav(nav: NavGrid, x: number, y: number): void {
  const src = navNear(nav, x, y)
  nav.src = src
  const { dist, next, hop, link, linkWarp, heap } = nav
  dist.fill(Infinity)
  next.fill(-1)
  hop.fill(-1)
  if (src < 0) return
  heap.size = 0
  dist[src] = 0
  push(heap, 0, src)
  const cols = nav.cols
  while (heap.size > 0) {
    const d0 = heap.key[0]!
    const a = pop(heap)
    if (d0 > dist[a]!) continue
    const ax = a % cols
    const ay = (a - ax) / cols
    for (const [dx, dy, cost] of DIRS) {
      if (!passable(nav, a, dx, dy)) continue
      const b = (ay + dy) * cols + ax + dx
      const nd = d0 + cost * NAV_CELL_U
      if (nd >= dist[b]!) continue
      dist[b] = nd
      next[b] = a
      hop[b] = -1
      push(heap, nd, b)
    }
    // 穿门的那一步：从 b 越过它跟前的门到 a
    const b = link[a]!
    if (b < 0) continue
    const nd = d0 + NAV_CELL_U
    if (nd >= dist[b]!) continue
    dist[b] = nd
    next[b] = a
    hop[b] = linkWarp[b]!
    push(heap, nd, b)
  }
}

/** 从 (x, y)（格）走到源头要走多远，格；走不到为 Infinity */
export function navDist(nav: NavGrid, x: number, y: number): number {
  const i = navNear(nav, x, y)
  if (i < 0) return Infinity
  const p = navCenter(nav, i)
  return nav.dist[i]! + Math.hypot(p.x - x, p.y - y)
}
