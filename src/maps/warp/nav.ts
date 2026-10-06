import { FRAME_U, UNIT } from '../../util/units'
import { roomAt } from '../basin'
import type { Basin } from '../basin'
import type { Point } from '../../util/vec'

/** 寻路的格子边长，格 */
const NAV_U = 0.5
const N = Math.round(FRAME_U / NAV_U)
/** 格心离壁至少这么远才算走得通，格 */
const CLEAR_U = 0.3
const DIAG = Math.SQRT2
const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAG],
  [1, -1, DIAG],
  [-1, 1, DIAG],
  [-1, -1, DIAG],
] as const

/** 一张步数场：每格到目标要走多远（格），走不到为 Infinity */
export interface NavField {
  readonly dist: Float32Array
}

/** 一间房的寻路底子：哪些格走得通 */
export interface NavGrid {
  readonly open: Uint8Array
}

export function navGrid(b: Basin): NavGrid {
  const open = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) open[j * N + i] = roomAt(b, (i + 0.5) * NAV_U * UNIT, (j + 0.5) * NAV_U * UNIT) >= CLEAR_U * UNIT ? 1 : 0
  return { open }
}

function cellOf(x: number, y: number): number {
  const i = Math.min(N - 1, Math.max(0, Math.floor(x / UNIT / NAV_U)))
  const j = Math.min(N - 1, Math.max(0, Math.floor(y / UNIT / NAV_U)))
  return j * N + i
}

/** 离 (x, y)（像素）最近的走得通的格，四周两格以内都没有为 −1 */
function nearOpen(g: NavGrid, x: number, y: number): number {
  const c = cellOf(x, y)
  if (g.open[c]) return c
  const ci = c % N
  const cj = (c - ci) / N
  let best = -1
  let bd = Infinity
  for (let dj = -4; dj <= 4; dj++) {
    for (let di = -4; di <= 4; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= N || j >= N || !g.open[j * N + i]) continue
      const d = di * di + dj * dj
      if (d < bd) {
        bd = d
        best = j * N + i
      }
    }
  }
  return best
}

/** 从 (x, y)（像素）铺一张步数场：按八邻接的走法，不切过墙角 */
export function flowTo(g: NavGrid, x: number, y: number, out?: NavField): NavField {
  const dist = out?.dist ?? new Float32Array(N * N)
  dist.fill(Infinity)
  const start = nearOpen(g, x, y)
  if (start < 0) return { dist }
  dist[start] = 0
  const heap: number[] = [start]
  const key = (c: number): number => dist[c]!
  const push = (c: number): void => {
    heap.push(c)
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (key(heap[p]!) <= key(heap[k]!)) break
      ;[heap[p], heap[k]] = [heap[k]!, heap[p]!]
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = k * 2 + 1
        const r = l + 1
        let m = k
        if (l < heap.length && key(heap[l]!) < key(heap[m]!)) m = l
        if (r < heap.length && key(heap[r]!) < key(heap[m]!)) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k]!, heap[m]!]
        k = m
      }
    }
    return top
  }
  const done = new Uint8Array(N * N)
  while (heap.length > 0) {
    const c = pop()
    if (done[c]) continue
    done[c] = 1
    const ci = c % N
    const cj = (c - ci) / N
    for (const [di, dj, w] of NEIGHBORS) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= N || j >= N) continue
      const n = j * N + i
      if (!g.open[n] || done[n]) continue
      if (di !== 0 && dj !== 0 && (!g.open[cj * N + i] || !g.open[j * N + ci])) continue
      const d = dist[c]! + w * NAV_U
      if (d < dist[n]!) {
        dist[n] = d
        push(n)
      }
    }
  }
  return { dist }
}

/** (x, y)（像素）离步数场的目标还要走多远，格；走不到为 Infinity */
export function navDist(g: NavGrid, f: NavField, x: number, y: number): number {
  const c = nearOpen(g, x, y)
  return c < 0 ? Infinity : f.dist[c]!
}

/** 顺着步数场往下走一步的方向（单位向量）：挑周围八格里最近的；走不到为 null */
export function flowDir(g: NavGrid, f: NavField, x: number, y: number): Point | null {
  const c = nearOpen(g, x, y)
  if (c < 0 || f.dist[c] === Infinity) return null
  const ci = c % N
  const cj = (c - ci) / N
  let best = c
  let bd = f.dist[c]!
  for (const [di, dj] of NEIGHBORS) {
    const i = ci + di
    const j = cj + dj
    if (i < 0 || j < 0 || i >= N || j >= N) continue
    const n = j * N + i
    if (f.dist[n]! < bd) {
      bd = f.dist[n]!
      best = n
    }
  }
  const bi = best % N
  const bj = (best - bi) / N
  const tx = (bi + 0.5) * NAV_U * UNIT
  const ty = (bj + 0.5) * NAV_U * UNIT
  const dx = tx - x
  const dy = ty - y
  const len = Math.hypot(dx, dy)
  return len > 1e-6 ? { x: dx / len, y: dy / len } : null
}

/** 半径 r 像素的身体从 a 沿直线走到 b（像素）一路不碰壁 */
export function clearWalk(b: Basin, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const dx = bx - ax
  const dy = by - ay
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (0.35 * UNIT)))
  const need = Math.min(r, 0.45 * UNIT) * 0.85
  for (let k = 1; k <= n; k++) if (roomAt(b, ax + (dx * k) / n, ay + (dy * k) / n) < need) return false
  return true
}
