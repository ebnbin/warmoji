/** 格子上 (x, y) 像素处双线性插值：格子 (i, j) 的格心在 (ox, oy) + ((i + 0.5)·cell, (j + 0.5)·cell)，越界取 outside */
export function bilinear(a: Float32Array, cols: number, rows: number, cell: number, ox: number, oy: number, x: number, y: number, outside: number): number {
  const u = (x - ox) / cell - 0.5
  const v = (y - oy) / cell - 0.5
  if (u < 0 || v < 0 || u >= cols - 1 || v >= rows - 1) return outside
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const s = a[i + cols]!
  const t = a[i + cols + 1]!
  return p + (q - p) * fx + (s - p) * fy + (p - q - s + t) * fx * fy
}
