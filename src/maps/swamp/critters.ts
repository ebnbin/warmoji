/** 泥潭里的小生灵的贴图，都是从上往下看、头朝贴图的右边（x 正向），用 Canvas 画一次 */

/** 蜻蜓：细长的蓝绿身子一节节，头上两只大复眼；两对透明的翅膀横着张开，翅脉细细的，翅尖一点深色的翅痣 */
export function drawDragonfly(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  ctx.save()
  ctx.translate(c, c)
  for (const [x, len, tilt] of [
    [size * 0.08, size * 0.42, 0.18],
    [-size * 0.06, size * 0.4, -0.12],
  ] as const) {
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(x, 0)
      ctx.rotate(s * (Math.PI / 2 - tilt))
      ctx.fillStyle = 'rgba(226, 240, 246, 0.42)'
      ctx.strokeStyle = 'rgba(160, 182, 190, 0.6)'
      ctx.lineWidth = Math.max(1, size * 0.012)
      ctx.beginPath()
      ctx.ellipse(len / 2, 0, len / 2, size * 0.055, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(len * 0.95, 0)
      ctx.stroke()
      ctx.fillStyle = 'rgba(70, 60, 50, 0.8)'
      ctx.fillRect(len * 0.8, -size * 0.02, len * 0.08, size * 0.04)
      ctx.restore()
    }
  }
  // 腹部：一节节，越往后越细
  for (let i = 0; i < 8; i++) {
    const x = -size * 0.06 - i * size * 0.045
    const r = size * (0.04 - i * 0.003)
    ctx.fillStyle = i % 2 === 0 ? '#2c8f9c' : '#1f6a75'
    ctx.beginPath()
    ctx.ellipse(x, 0, size * 0.03, r, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#3aa7a8'
  ctx.beginPath()
  ctx.ellipse(size * 0.03, 0, size * 0.07, size * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#25464f'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(size * 0.12, s * size * 0.03, size * 0.032, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 青蛙：蹲着的绿背，背上两道浅色的背褶和几块深斑，后腿折在两边，前脚撑在前面，两只鼓眼睛 */
export function drawFrog(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  ctx.save()
  ctx.translate(c, c)
  ctx.fillStyle = '#4c6b2c'
  for (const s of [-1, 1]) {
    // 后腿：折起来的大腿与长长的脚
    ctx.beginPath()
    ctx.ellipse(-size * 0.16, s * size * 0.2, size * 0.17, size * 0.08, s * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(-size * 0.02, s * size * 0.3, size * 0.13, size * 0.045, -s * 0.3, 0, Math.PI * 2)
    ctx.fill()
    // 前脚
    ctx.beginPath()
    ctx.ellipse(size * 0.2, s * size * 0.17, size * 0.08, size * 0.03, s * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createRadialGradient(-size * 0.02, -size * 0.04, size * 0.04, 0, 0, size * 0.3)
  g.addColorStop(0, '#8fb04e')
  g.addColorStop(1, '#4f7230')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.28, size * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(214, 214, 140, 0.7)'
  ctx.lineWidth = Math.max(1, size * 0.02)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(-size * 0.2, s * size * 0.1)
    ctx.quadraticCurveTo(0, s * size * 0.13, size * 0.18, s * size * 0.08)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(40, 56, 24, 0.7)'
  for (const [x, y, r] of [
    [-0.08, 0.02, 0.04],
    [0.04, -0.04, 0.03],
    [-0.14, -0.05, 0.025],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#6f8f3a'
    ctx.beginPath()
    ctx.arc(size * 0.2, s * size * 0.08, size * 0.06, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#20180e'
    ctx.beginPath()
    ctx.arc(size * 0.21, s * size * 0.085, size * 0.035, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 240, 0.8)'
    ctx.beginPath()
    ctx.arc(size * 0.2, s * size * 0.075, size * 0.012, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 白鹭站着：从上往下看是一个白色的纺锤形身子，长脖子往前弯成 S，细长的黄嘴；背上几缕蓑羽往后披 */
export function drawEgret(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cy = h / 2
  ctx.save()
  const body = ctx.createRadialGradient(w * 0.38, cy - h * 0.06, h * 0.05, w * 0.4, cy, h * 0.42)
  body.addColorStop(0, '#ffffff')
  body.addColorStop(1, '#d8dcd8')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(w * 0.4, cy, w * 0.22, h * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(236, 240, 236, 0.9)'
  ctx.lineWidth = Math.max(1, h * 0.03)
  for (const s of [-1, 0, 1]) {
    ctx.beginPath()
    ctx.moveTo(w * 0.32, cy + s * h * 0.08)
    ctx.quadraticCurveTo(w * 0.16, cy + s * h * 0.16, w * 0.06, cy + s * h * 0.2)
    ctx.stroke()
  }
  ctx.strokeStyle = '#f4f6f2'
  ctx.lineCap = 'round'
  ctx.lineWidth = h * 0.12
  ctx.beginPath()
  ctx.moveTo(w * 0.56, cy)
  ctx.bezierCurveTo(w * 0.68, cy - h * 0.22, w * 0.72, cy + h * 0.2, w * 0.8, cy + h * 0.02)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(w * 0.81, cy, w * 0.04, h * 0.09, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8b62c'
  ctx.beginPath()
  ctx.moveTo(w * 0.84, cy - h * 0.035)
  ctx.lineTo(w * 0.99, cy)
  ctx.lineTo(w * 0.84, cy + h * 0.035)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 白鹭飞着：一对宽大的白翅膀张开，翅尖的飞羽一根根分开；脖子缩回来，两条黑腿往后伸 */
export function drawEgretFlying(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  ctx.save()
  ctx.translate(c, c)
  ctx.strokeStyle = '#2b2b26'
  ctx.lineWidth = Math.max(1, size * 0.018)
  ctx.beginPath()
  ctx.moveTo(-size * 0.12, -size * 0.015)
  ctx.lineTo(-size * 0.42, -size * 0.02)
  ctx.moveTo(-size * 0.12, size * 0.015)
  ctx.lineTo(-size * 0.42, size * 0.02)
  ctx.stroke()
  for (const s of [-1, 1]) {
    const g = ctx.createLinearGradient(0, 0, 0, s * size * 0.48)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#e2e6e2')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(size * 0.08, s * size * 0.04)
    ctx.quadraticCurveTo(size * 0.14, s * size * 0.3, size * 0.02, s * size * 0.47)
    for (let i = 0; i < 5; i++) ctx.lineTo(-size * (0.02 + i * 0.035), s * size * (0.44 - i * 0.025))
    ctx.quadraticCurveTo(-size * 0.16, s * size * 0.2, -size * 0.1, s * size * 0.04)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.16, size * 0.065, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(size * 0.17, 0, size * 0.05, size * 0.04, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8b62c'
  ctx.beginPath()
  ctx.moveTo(size * 0.21, -size * 0.015)
  ctx.lineTo(size * 0.32, 0)
  ctx.lineTo(size * 0.21, size * 0.015)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
