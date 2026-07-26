import type Phaser from 'phaser'

// 形状三角化原语：把圆 / 圆环 / 四边形 / 加粗线段拆成三角形，顶点直接经相机矩阵
// 变换到屏幕空间（与核心 FillTri 的做法一致），攒进一个 Scratch 交给 BatchHandlerTriFlat。
//
// 一次性特效（cues.ts）与实体光圈（rings.ts）共用这一份：两者都是「自己三角化、
// 一次批提交」，差别只在数据从哪来——前者是投放队列，后者是世界里的实体。

type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 一帧一带的三角形暂存：plain array 复用，稳态零分配 */
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

/** 追加一个三角形（顶点经相机矩阵变换到屏幕空间，与 FillTri 的做法一致） */
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

/** 四边形 → 两个三角形（顶点须按 TL, BL, BR, TR 顺时针或逆时针连续绕） */
export function quad(
  o: Scratch, m: Matrix,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
  color: number,
): void {
  tri(o, m, ax, ay, bx, by, cx, cy, color)
  tri(o, m, ax, ay, cx, cy, dx, dy, color)
}

/** 圆按屏幕半径自适应取段数：太少会出多边形棱角，太多是白给的三角形 */
export function segsFor(radius: number): number {
  return Math.max(12, Math.min(48, Math.ceil(radius / 3)))
}

/** 填充圆：以圆心为轴的三角扇 */
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

/** 圆环（描边）：内外两圈之间铺一圈四边形。a0/a1 给定即只铺该扇段（斩击弧光用） */
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

/** 有向线段加粗成四边形（闪电每一截）。转角处不做接头——闪电本就锯齿状，看不出 */
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
