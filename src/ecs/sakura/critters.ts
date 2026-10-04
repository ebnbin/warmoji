/** 樱庭的花瓣：从上往下看、尖头朝贴图的右边（x 正向），用 Canvas 画一次 */

/** 一片樱花瓣：倒卵形，尖头那端有一道小缺口；花瓣根部带一点粉，往外渐白。白底，着色得到深浅不同的粉 */
export function drawPetal(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const L = size * 0.46
  const W = size * 0.3
  ctx.save()
  ctx.translate(c, c)
  ctx.beginPath()
  ctx.moveTo(-L, 0)
  ctx.bezierCurveTo(-L * 0.4, -W * 1.05, L * 0.55, -W * 1.05, L, -W * 0.28)
  ctx.lineTo(L * 0.72, 0)
  ctx.lineTo(L, W * 0.28)
  ctx.bezierCurveTo(L * 0.55, W * 1.05, -L * 0.4, W * 1.05, -L, 0)
  ctx.closePath()
  const g = ctx.createLinearGradient(-L, 0, L, 0)
  g.addColorStop(0, '#f2c9d6')
  g.addColorStop(0.45, '#fcebf0')
  g.addColorStop(1, '#ffffff')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(214, 150, 172, 0.35)'
  ctx.lineWidth = Math.max(1, size * 0.04)
  ctx.beginPath()
  ctx.moveTo(-L * 0.8, 0)
  ctx.lineTo(L * 0.45, 0)
  ctx.stroke()
  ctx.restore()
}
