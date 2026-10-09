import { UNIT } from '../../util/units'
import { roomAt } from '../basin'
import type { Basin } from '../basin'
import type { Point } from '../../util/vec'

/** 绕路的格子边长，像素 */
const STEP = 0.5 * UNIT
/** 身体挤得过去的地方离挡路的东西至少这么远，像素 */
const SQUEEZE = 0.4 * UNIT

/** 八个方向：前四个是正交，后四个是斜的 */
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const
const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const

/** 去队长那里的路程场：半格一格，每格到队长的最短路程（像素）；走不过去的格子不通，格子 (0, 0) 的左上角在 (x0, y0) */
export interface Trail {
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly open: Uint8Array
  readonly cost: Float32Array
  /** 按路程排的小根堆 */
  readonly heap: Int32Array
  /** 上一次从哪一格算起 */
  from: number
}

export function makeTrail(b: Basin): Trail {
  const cols = Math.ceil((b.cols * b.cell) / STEP)
  const rows = Math.ceil((b.rows * b.cell) / STEP)
  const open = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) open[r * cols + c] = roomAt(b, b.x0 + (c + 0.5) * STEP, b.y0 + (r + 0.5) * STEP) >= SQUEEZE ? 1 : 0
  return { cols, rows, x0: b.x0, y0: b.y0, open, cost: new Float32Array(cols * rows).fill(Infinity), heap: new Int32Array(cols * rows * 8), from: -1 }
}

/** (x, y) 所在的格子；那一格不通就找最近的通的一格，八格以内都不通为 −1 */
function cellOf(t: Trail, x: number, y: number): number {
  const cx = Math.min(t.cols - 1, Math.max(0, Math.floor((x - t.x0) / STEP)))
  const cy = Math.min(t.rows - 1, Math.max(0, Math.floor((y - t.y0) / STEP)))
  if (t.open[cy * t.cols + cx]) return cy * t.cols + cx
  let best = -1
  let bd = Infinity
  for (let r = 1; r <= 8 && best < 0; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx
        const yy = cy + dy
        if (xx < 0 || yy < 0 || xx >= t.cols || yy >= t.rows || !t.open[yy * t.cols + xx] || dx * dx + dy * dy >= bd) continue
        bd = dx * dx + dy * dy
        best = yy * t.cols + xx
      }
    }
  }
  return best
}

/** 从队长 (x, y) 起按八邻接重算路程（斜着走不能切过不通的角）；队长还在同一格就不算 */
export function trailFrom(t: Trail, x: number, y: number): void {
  const start = cellOf(t, x, y)
  if (start < 0 || start === t.from) return
  t.from = start
  const { cols, rows, open, cost, heap } = t
  cost.fill(Infinity)
  cost[start] = 0
  let size = 0
  const less = (a: number, b: number): boolean => cost[heap[a]!]! < cost[heap[b]!]!
  const swap = (a: number, b: number): void => {
    const v = heap[a]!
    heap[a] = heap[b]!
    heap[b] = v
  }
  const push = (i: number): void => {
    heap[size] = i
    let k = size++
    while (k > 0) {
      const p = (k - 1) >> 1
      if (!less(k, p)) break
      swap(k, p)
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    heap[0] = heap[--size]!
    let k = 0
    for (;;) {
      const l = k * 2 + 1
      let m = k
      if (l < size && less(l, m)) m = l
      if (l + 1 < size && less(l + 1, m)) m = l + 1
      if (m === k) break
      swap(k, m)
      k = m
    }
    return top
  }
  // 同一格可能进堆多次：出堆时比一下路程，旧的跳过
  const seen = new Float32Array(cols * rows).fill(-1)
  push(start)
  while (size > 0) {
    const i = pop()
    const d = cost[i]!
    if (seen[i] === d) continue
    seen[i] = d
    const ix = i % cols
    const iy = (i - ix) / cols
    for (let k = 0; k < 8; k++) {
      const nx = ix + DX[k]!
      const ny = iy + DY[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!open[j] || (k >= 4 && (!open[iy * cols + nx] || !open[ny * cols + ix]))) continue
      const nd = d + COST[k]! * STEP
      if (nd >= cost[j]! || size >= heap.length) continue
      cost[j] = nd
      push(j)
    }
  }
}

/** 路程场在 (x, y) 处的双线性插值；四角有不通的就是 Infinity */
function costAt(t: Trail, x: number, y: number): number {
  const u = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / STEP - 0.5))
  const v = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / STEP - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * t.cols + ix
  const c = t.cost
  return (c[i]! * (1 - fx) + c[i + 1]! * fx) * (1 - fy) + (c[i + t.cols]! * (1 - fx) + c[i + t.cols + 1]! * fx) * fy
}

/** 顺着路程场往队长那里走的方向：四周都通时按插值的梯度走，平滑；贴着不通的格子时挑周围八格里路程最短的一格；哪儿也去不了为 null */
export function trailDir(t: Trail, x: number, y: number): Point | null {
  const h = STEP * 0.5
  const gx = costAt(t, x + h, y) - costAt(t, x - h, y)
  const gy = costAt(t, x, y + h) - costAt(t, x, y - h)
  if (Number.isFinite(gx) && Number.isFinite(gy)) {
    const len = Math.hypot(gx, gy)
    if (len > 1e-6) return { x: -gx / len, y: -gy / len }
  }
  const ix = Math.min(t.cols - 1, Math.max(0, Math.floor((x - t.x0) / STEP)))
  const iy = Math.min(t.rows - 1, Math.max(0, Math.floor((y - t.y0) / STEP)))
  const here = t.cost[iy * t.cols + ix]!
  let best = here
  let bx = 0
  let by = 0
  for (let k = 0; k < 8; k++) {
    const nx = ix + DX[k]!
    const ny = iy + DY[k]!
    if (nx < 0 || ny < 0 || nx >= t.cols || ny >= t.rows) continue
    const d = t.cost[ny * t.cols + nx]!
    if (d >= best) continue
    best = d
    bx = t.x0 + (nx + 0.5) * STEP - x
    by = t.y0 + (ny + 0.5) * STEP - y
  }
  if (best === here || !Number.isFinite(best)) return null
  const len = Math.hypot(bx, by)
  return len > 1e-9 ? { x: bx / len, y: by / len } : null
}

/** 半径 rad 的身体能不能沿直线从 a 走到 b 而不蹭到挡路的东西：沿线按离挡路的东西的距离跳着走 */
export function straight(b: Basin, ax: number, ay: number, bx: number, by: number, rad: number): boolean {
  const len = Math.hypot(bx - ax, by - ay)
  if (len < 1e-6) return true
  const min = b.cell * 0.4
  let s = 0
  for (let k = 0; k < 256; k++) {
    const d = roomAt(b, ax + ((bx - ax) * s) / len, ay + ((by - ay) * s) / len)
    if (d < rad) return false
    if (s >= len) return true
    s = Math.min(len, s + Math.max(d - rad, min))
  }
  return true
}
