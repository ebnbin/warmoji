/** 按显示尺寸与像素比调好画布并清空；返回的画笔以 CSS 像素为单位 */
export function fitCanvas(c: HTMLCanvasElement): { readonly ctx: CanvasRenderingContext2D; readonly w: number; readonly h: number } | null {
  const w = c.clientWidth
  const h = c.clientHeight
  const ctx = c.getContext('2d')
  if (!ctx || w === 0 || h === 0) return null
  const dpr = window.devicePixelRatio || 1
  const bw = Math.round(w * dpr)
  const bh = Math.round(h * dpr)
  if (c.width !== bw || c.height !== bh) {
    c.width = bw
    c.height = bh
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

export function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
