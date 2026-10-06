/** 水坑边纯装饰的小生灵与尘埃的贴图，都是从上往下看、头朝贴图的右边（x 正向），用 Canvas 画一次 */

/** 秃鹫：又宽又长的翅膀，翅尖分出一根根“手指”，短短的扇尾；背上深褐，翅膀前缘浅一道，光秃的头是粉灰的 */
export function drawVulture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#3b2c25'
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.07, cy + s * h * 0.03)
    ctx.quadraticCurveTo(cx + w * 0.11, cy + s * h * 0.28, cx + w * 0.05, cy + s * h * 0.47)
    // 翅尖的几根飞羽
    for (let k = 0; k < 6; k++) {
      const fx = cx + w * (0.03 - k * 0.028)
      const fy = cy + s * h * (0.5 - k * 0.006)
      ctx.lineTo(fx, fy)
      ctx.lineTo(fx - w * 0.012, cy + s * h * (0.45 - k * 0.004))
    }
    ctx.quadraticCurveTo(cx - w * 0.13, cy + s * h * 0.24, cx - w * 0.08, cy + s * h * 0.04)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#6e5848'
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.07, cy + s * h * 0.05)
    ctx.quadraticCurveTo(cx + w * 0.1, cy + s * h * 0.26, cx + w * 0.05, cy + s * h * 0.42)
    ctx.lineTo(cx + w * 0.02, cy + s * h * 0.4)
    ctx.quadraticCurveTo(cx + w * 0.06, cy + s * h * 0.24, cx + w * 0.03, cy + s * h * 0.06)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#2f231d'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * 0.17, h * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.12, cy)
  ctx.lineTo(cx - w * 0.3, cy - h * 0.08)
  ctx.quadraticCurveTo(cx - w * 0.33, cy, cx - w * 0.3, cy + h * 0.08)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#d9c6b8'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.15, cy, w * 0.045, h * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c99a7e'
  ctx.beginPath()
  ctx.arc(cx + w * 0.2, cy, h * 0.035, 0, Math.PI * 2)
  ctx.fill()
}

/** 歇在枯枝上的秃鹫：翅膀收拢成一个长长的背，颈上一圈浅色的翎，光秃的小脑袋粉灰 */
export function drawPerched(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  const g = ctx.createLinearGradient(cx - w * 0.4, cy - h * 0.4, cx + w * 0.3, cy + h * 0.4)
  g.addColorStop(0, '#6b5444')
  g.addColorStop(1, '#2d211b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.42, cy)
  ctx.quadraticCurveTo(cx - w * 0.2, cy - h * 0.36, cx + w * 0.12, cy - h * 0.3)
  ctx.quadraticCurveTo(cx + w * 0.24, cy, cx + w * 0.12, cy + h * 0.3)
  ctx.quadraticCurveTo(cx - w * 0.2, cy + h * 0.36, cx - w * 0.42, cy)
  ctx.fill()
  ctx.strokeStyle = 'rgba(160, 130, 105, 0.6)'
  ctx.lineWidth = h * 0.05
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.3, cy + s * h * 0.08)
    ctx.quadraticCurveTo(cx - w * 0.05, cy + s * h * 0.2, cx + w * 0.08, cy + s * h * 0.16)
    ctx.stroke()
  }
  ctx.fillStyle = '#e4d6c6'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.17, cy, w * 0.08, h * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c99a86'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.3, cy, w * 0.08, h * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4a3a30'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.39, cy, w * 0.04, h * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 鬣狗：前高后低的身子，肩宽、腰细、屁股窄；沙黄的毛上一块块深褐的斑，脊背上一溜深色的鬃，圆耳朵，短尾巴是黑的 */
export function drawHyena(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  ctx.fillStyle = '#3a2a1e'
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.3, cy)
  ctx.lineTo(cx - w * 0.44, cy - h * 0.04)
  ctx.lineTo(cx - w * 0.44, cy + h * 0.06)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createLinearGradient(0, cy - h * 0.3, 0, cy + h * 0.3)
  g.addColorStop(0, '#c9a77a')
  g.addColorStop(0.5, '#b38f62')
  g.addColorStop(1, '#8a6a46')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.32, cy)
  ctx.quadraticCurveTo(cx - w * 0.3, cy - h * 0.2, cx - w * 0.05, cy - h * 0.25)
  ctx.quadraticCurveTo(cx + w * 0.16, cy - h * 0.33, cx + w * 0.22, cy - h * 0.14)
  ctx.lineTo(cx + w * 0.22, cy + h * 0.14)
  ctx.quadraticCurveTo(cx + w * 0.16, cy + h * 0.33, cx - w * 0.05, cy + h * 0.25)
  ctx.quadraticCurveTo(cx - w * 0.3, cy + h * 0.2, cx - w * 0.32, cy)
  ctx.fill()
  ctx.fillStyle = 'rgba(70, 46, 28, 0.75)'
  const spots = [[-0.18, -0.08], [-0.1, 0.12], [-0.02, -0.14], [0.05, 0.1], [0.1, -0.06], [-0.22, 0.06], [0.14, 0.14], [0, 0.02]] as const
  for (const [sx, sy] of spots) {
    ctx.beginPath()
    ctx.ellipse(cx + sx * w, cy + sy * h, w * 0.025, h * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = '#3e2c1f'
  ctx.lineWidth = h * 0.06
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.2, cy)
  ctx.lineTo(cx + w * 0.2, cy)
  ctx.stroke()
  ctx.fillStyle = '#a5845b'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.32, cy, w * 0.12, h * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2b1f17'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.43, cy, w * 0.04, h * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#7a5c3e'
    ctx.beginPath()
    ctx.arc(cx + w * 0.27, cy + s * h * 0.17, h * 0.07, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3a2a1e'
    ctx.beginPath()
    ctx.arc(cx + w * 0.27, cy + s * h * 0.17, h * 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 一团软软的烟尘：中间浓、边上散，着色得到红土的颜色 */
export function drawDust(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const swirl = 0.7 + 0.3 * Math.sin(Math.atan2(y - c, x - c) * 3 + d * 6)
      const a = Math.max(0, 1 - d) ** 1.4 * swirl
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.min(1, a) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 跑道上的一道箭头：一个尖朝右的“〉”，边上软 */
export function drawChevron(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = size * 0.16
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(size * 0.32, size * 0.18)
  ctx.lineTo(size * 0.68, size * 0.5)
  ctx.lineTo(size * 0.32, size * 0.82)
  ctx.stroke()
}
