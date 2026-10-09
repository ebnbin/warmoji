import type Phaser from 'phaser'


type Matrix = Phaser.GameObjects.Components.TransformMatrix

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

export function quad(
  o: Scratch, m: Matrix,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
  color: number,
): void {
  tri(o, m, ax, ay, bx, by, cx, cy, color)
  tri(o, m, ax, ay, cx, cy, dx, dy, color)
}

function segsFor(radius: number): number {
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

/** 平躺在地上的一圈：横半径 rx、竖半径 ry，fill 填满，line 是宽 width 的边、内外各让半个线宽 */
export function ellipse(
  o: Scratch, m: Matrix,
  cx: number, cy: number, rx: number, ry: number, width: number, fill: number, line: number,
): void {
  const n = segsFor(rx)
  const d = (Math.PI * 2) / n
  const h = width / 2
  for (let k = 0; k < n; k++) {
    const ca = Math.cos(k * d)
    const sa = Math.sin(k * d)
    const cb = Math.cos((k + 1) * d)
    const sb = Math.sin((k + 1) * d)
    if (fill >>> 24) tri(o, m, cx, cy, cx + ca * rx, cy + sa * ry, cx + cb * rx, cy + sb * ry, fill)
    quad(
      o, m,
      cx + ca * (rx - h), cy + sa * (ry - h),
      cx + ca * (rx + h), cy + sa * (ry + h),
      cx + cb * (rx + h), cy + sb * (ry + h),
      cx + cb * (rx - h), cy + sb * (ry - h),
      line,
    )
  }
}

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

/** 把按世界坐标画好的三角形乘上镜头，接到 o 后面 */
export function place(o: Scratch, m: Matrix, src: Scratch): void {
  const base = o.c.length
  const v = src.v
  for (let k = 0; k < v.length; k += 2) o.v.push(m.getX(v[k]!, v[k + 1]!), m.getY(v[k]!, v[k + 1]!))
  for (const c of src.c) o.c.push(c)
  for (const i of src.i) o.i.push(base + i)
}
