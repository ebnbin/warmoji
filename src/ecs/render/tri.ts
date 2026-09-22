import type Phaser from 'phaser'


type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 复用，稳态零分配 */
export interface Scratch {
  v: number[]
  c: number[]
  i: number[]
}

export function newScratch(): Scratch {
  return { v: [], c: [], i: [] }
}

export function resetScratch(o: Scratch): void {
  o.v.length = 0
  o.c.length = 0
  o.i.length = 0
}

/** 顶点经相机矩阵变换到屏幕空间 */
export function tri(
  o: Scratch, m: Matrix,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  color: number,
): void {
  const base = o.c.length
  o.v.push(m.getX(x0, y0), m.getY(x0, y0), m.getX(x1, y1), m.getY(x1, y1), m.getX(x2, y2), m.getY(x2, y2))
  o.c.push(color, color, color)
  o.i.push(base, base + 1, base + 2)
}

/** 顶点须连续绕 */
export function quad(
  o: Scratch, m: Matrix,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
  color: number,
): void {
  tri(o, m, ax, ay, bx, by, cx, cy, color)
  tri(o, m, ax, ay, cx, cy, dx, dy, color)
}

/** 按屏幕半径自适应取段数 */
export function segsFor(radius: number): number {
  return Math.max(12, Math.min(48, Math.ceil(radius / 3)))
}

export function fan(o: Scratch, m: Matrix, cx: number, cy: number, r: number, color: number): void {
  const n = segsFor(r)
  const d = (Math.PI * 2) / n
  let px = cx + r
  let py = cy
  for (let k = 1; k <= n; k++) {
    const a = k * d
    const nx = cx + Math.cos(a) * r
    const ny = cy + Math.sin(a) * r
    tri(o, m, cx, cy, px, py, nx, ny, color)
    px = nx
    py = ny
  }
}

/** a0/a1 给定即只铺该扇段 */
export function ringStrip(
  o: Scratch, m: Matrix,
  cx: number, cy: number, r: number, width: number, color: number,
  a0 = 0, a1 = Math.PI * 2,
): void {
  const ri = r - width / 2
  const ro = r + width / 2
  const span = a1 - a0
  const n = Math.max(6, Math.ceil(segsFor(r) * (Math.abs(span) / (Math.PI * 2))))
  const d = span / n
  for (let k = 0; k < n; k++) {
    const a = a0 + k * d
    const b = a0 + (k + 1) * d
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const cb = Math.cos(b)
    const sb = Math.sin(b)
    quad(
      o, m,
      cx + ca * ri, cy + sa * ri,
      cx + ca * ro, cy + sa * ro,
      cx + cb * ro, cy + sb * ro,
      cx + cb * ri, cy + sb * ri,
      color,
    )
  }
}

/** 转角处不做接头 */
export function segment(
  o: Scratch, m: Matrix,
  x0: number, y0: number, x1: number, y1: number, width: number, color: number,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (width / 2)
  const ny = (dx / len) * (width / 2)
  quad(o, m, x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny, color)
}
