import type { Point } from '../../util/vec'

/**
 * 能走的地面：细格子上到最近的不可走地形的有符号距离，像素；能走的地方为正，岩壁里为负。
 * 格子 (0, 0) 的左上角在 (x0, y0) 像素，格子以外都不能走。
 */
export interface Basin {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly room: Float32Array
}

const INF = 1e20

/** 一维平方距离变换（Felzenszwalb–Huttenlocher）：d[q] = min_p (q − p)² + f[p] */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k--
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!
  }
}

/** 每格到最近的 on 格的距离，以格计 */
function distanceTo(on: Uint8Array, cols: number, rows: number): Float64Array {
  const out = new Float64Array(cols * rows)
  const n = Math.max(cols, rows)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let i = 0; i < out.length; i++) out[i] = on[i] ? 0 : INF
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = out[y * cols + x]!
    edt1(f, rows, d, v, z)
    for (let y = 0; y < rows; y++) out[y * cols + x] = d[y]!
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = out[y * cols + x]!
    edt1(f, cols, d, v, z)
    for (let x = 0; x < cols; x++) out[y * cols + x] = Math.sqrt(d[x]!)
  }
  return out
}

/**
 * 按 open 栅格化能走的地面（参数是格心的像素坐标）：窄过 2·neck 像素的缝和尖角填成岩壁，
 * 只留下与 keep 连通的那一块，再算有符号距离。
 */
export function makeBasin(open: (x: number, y: number) => boolean, x0: number, y0: number, cols: number, rows: number, cell: number, keep: Point, neck: number): Basin {
  const n = cols * rows
  const walk = new Uint8Array(n)
  const wall = new Uint8Array(n)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const inside = cx > 0 && cy > 0 && cx < cols - 1 && cy < rows - 1 && open(x0 + (cx + 0.5) * cell, y0 + (cy + 0.5) * cell)
      walk[i] = inside ? 1 : 0
      wall[i] = inside ? 0 : 1
    }
  }
  const toWall = distanceTo(wall, cols, rows)
  const core = new Uint8Array(n)
  for (let i = 0; i < n; i++) core[i] = walk[i] && toWall[i]! * cell > neck ? 1 : 0
  const toCore = distanceTo(core, cols, rows)
  const opened = new Uint8Array(n)
  for (let i = 0; i < n; i++) opened[i] = walk[i] && toCore[i]! * cell <= neck + cell * 0.5 ? 1 : 0
  const reach = new Uint8Array(n)
  const start = Math.min(rows - 1, Math.max(0, Math.floor((keep.y - y0) / cell))) * cols + Math.min(cols - 1, Math.max(0, Math.floor((keep.x - x0) / cell)))
  const stack = [start]
  reach[start] = opened[start]!
  while (stack.length > 0) {
    const i = stack.pop()!
    if (!reach[i]) continue
    const cx = i % cols
    for (const j of [i - 1, i + 1, i - cols, i + cols]) {
      if (j < 0 || j >= n || reach[j] || !opened[j] || (j === i - 1 && cx === 0) || (j === i + 1 && cx === cols - 1)) continue
      reach[j] = 1
      stack.push(j)
    }
  }
  const rock = new Uint8Array(n)
  for (let i = 0; i < n; i++) rock[i] = reach[i] ? 0 : 1
  const out = distanceTo(rock, cols, rows)
  const back = distanceTo(reach, cols, rows)
  const room = new Float32Array(n)
  for (let i = 0; i < n; i++) room[i] = (reach[i] ? out[i]! - 0.5 : 0.5 - back[i]!) * cell
  return { cols, rows, cell, x0, y0, room }
}

/** (x, y) 离最近的不可走地形多远，像素，岩壁里为负 */
export function roomAt(b: Basin, x: number, y: number): number {
  const u = Math.min(b.cols - 1.001, Math.max(0, (x - b.x0) / b.cell - 0.5))
  const v = Math.min(b.rows - 1.001, Math.max(0, (y - b.y0) / b.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * b.cols + ix
  const a = b.room[i]!
  const c = b.room[i + 1]!
  const d = b.room[i + b.cols]!
  const e = b.room[i + b.cols + 1]!
  return a + (c - a) * fx + (d - a) * fy + (a - c - d + e) * fx * fy
}

/** 离岩壁越来越远的单位方向：在岩壁跟前就是壁面朝外的法线 */
export function awayFromWall(b: Basin, x: number, y: number): Point {
  const h = b.cell * 0.5
  const gx = roomAt(b, x + h, y) - roomAt(b, x - h, y)
  const gy = roomAt(b, x, y + h) - roomAt(b, x, y - h)
  const len = Math.hypot(gx, gy)
  return len > 1e-9 ? { x: gx / len, y: gy / len } : { x: 0, y: 0 }
}

/** 半径 rad 的身体走不进岩壁：陷进去多深就沿法线退回壁面，拐角处最多退四次 */
export function keepOut(b: Basin, x: number, y: number, rad: number): Point {
  let px = x
  let py = y
  for (let k = 0; k < 4; k++) {
    const d = roomAt(b, px, py)
    if (d >= rad) break
    const n = awayFromWall(b, px, py)
    px += n.x * (rad - d)
    py += n.y * (rad - d)
  }
  return { x: px, y: py }
}
