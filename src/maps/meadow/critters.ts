/** 草甸上的小生灵与飘絮的贴图，都是从上往下看、头朝贴图的右边（x 正向），用 Canvas 画一次 */

/** 羊的身子：椭圆的一团羊毛，中间鼓、边上暗，毛面上是一个个小卷；屁股后面一截短尾巴。羊会转身，所以光只从正上方来 */
export function drawSheep(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  const rx = w * 0.42
  const ry = h * 0.4
  ctx.fillStyle = '#d6cdb9'
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.98, cy, rx * 0.1, ry * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx / ry, 1)
  const g = ctx.createRadialGradient(0, 0, ry * 0.15, 0, 0, ry)
  g.addColorStop(0, '#fbf8f2')
  g.addColorStop(0.72, '#eee8db')
  g.addColorStop(1, '#c6bca8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, ry, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 毛卷：按黄金角撒在椭圆里，越靠边越暗
  const curl = h * 0.075
  ctx.lineWidth = Math.max(1, h * 0.025)
  for (let i = 0; i < 70; i++) {
    const d = Math.sqrt((i + 0.5) / 70) * 0.9
    const a = i * 2.39996
    const x = cx + Math.cos(a) * rx * d
    const y = cy + Math.sin(a) * ry * d
    const shade = 1 - d * 0.2
    ctx.strokeStyle = `rgba(${Math.round(206 * shade)}, ${Math.round(197 * shade)}, ${Math.round(178 * shade)}, 0.55)`
    ctx.beginPath()
    ctx.arc(x, y, curl * (0.8 + ((i * 37) % 5) * 0.08), a, a + Math.PI * 1.4)
    ctx.stroke()
  }
}

/** 羊头：长长的黑脸，口鼻浅一点；两只耳朵往两边支着，头顶连着身子的地方一撮白毛 */
export function drawSheepHead(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  ctx.fillStyle = '#2f2723'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(c - size * 0.1, c + s * size * 0.27, size * 0.16, size * 0.075, s * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createLinearGradient(c - size * 0.25, 0, c + size * 0.42, 0)
  g.addColorStop(0, '#26201c')
  g.addColorStop(0.75, '#3b322c')
  g.addColorStop(1, '#5a4c42')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(c + size * 0.06, c, size * 0.34, size * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ece6d8'
  ctx.beginPath()
  ctx.ellipse(c - size * 0.2, c, size * 0.12, size * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 蝴蝶：前翅大、后翅小，白色，翅尖发黑；着色得到别的颜色 */
export function drawButterfly(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(c + size * 0.08, c + s * size * 0.2, size * 0.17, size * 0.2, s * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8e8e8'
    ctx.beginPath()
    ctx.ellipse(c - size * 0.12, c + s * size * 0.15, size * 0.12, size * 0.14, -s * 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2e2a26'
    ctx.beginPath()
    ctx.ellipse(c + size * 0.17, c + s * size * 0.32, size * 0.07, size * 0.06, s * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#2e2a26'
  ctx.beginPath()
  ctx.ellipse(c, c, size * 0.2, size * 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 小鸟：展开的翅膀、叉开的尾巴，灰褐色 */
export function drawBird(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  ctx.fillStyle = '#5e5248'
  ctx.beginPath()
  ctx.moveTo(cx + w * 0.08, cy)
  ctx.quadraticCurveTo(cx + w * 0.02, cy - h * 0.5, cx - w * 0.16, cy - h * 0.48)
  ctx.quadraticCurveTo(cx - w * 0.06, cy - h * 0.2, cx - w * 0.08, cy)
  ctx.quadraticCurveTo(cx - w * 0.06, cy + h * 0.2, cx - w * 0.16, cy + h * 0.48)
  ctx.quadraticCurveTo(cx + w * 0.02, cy + h * 0.5, cx + w * 0.08, cy)
  ctx.fill()
  ctx.fillStyle = '#7a6b5c'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * 0.2, h * 0.09, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4b4139'
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.16, cy)
  ctx.lineTo(cx - w * 0.36, cy - h * 0.1)
  ctx.lineTo(cx - w * 0.3, cy)
  ctx.lineTo(cx - w * 0.36, cy + h * 0.1)
  ctx.closePath()
  ctx.fill()
}

/** 鹰：宽翅膀，翅尖分叉，扇形的尾巴，背上褐色、翅膀边浅一些 */
export function drawHawk(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.5
  const cy = h * 0.5
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#5b4434'
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.08, cy + s * h * 0.04)
    ctx.quadraticCurveTo(cx + w * 0.1, cy + s * h * 0.32, cx + w * 0.02, cy + s * h * 0.49)
    for (let k = 0; k < 4; k++) ctx.lineTo(cx - w * (0.02 + k * 0.035), cy + s * h * (0.47 - k * 0.012) + s * (k % 2) * h * 0.03)
    ctx.quadraticCurveTo(cx - w * 0.12, cy + s * h * 0.25, cx - w * 0.08, cy + s * h * 0.04)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#8a6c52'
    ctx.beginPath()
    ctx.ellipse(cx + w * 0.02, cy + s * h * 0.18, w * 0.05, h * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#4e3a2c'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.02, cy, w * 0.2, h * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.14, cy)
  ctx.lineTo(cx - w * 0.36, cy - h * 0.11)
  ctx.quadraticCurveTo(cx - w * 0.4, cy, cx - w * 0.36, cy + h * 0.11)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#d9cbb0'
  ctx.beginPath()
  ctx.arc(cx + w * 0.2, cy, h * 0.05, 0, Math.PI * 2)
  ctx.fill()
}

/** 蒲公英的种子：一个软软的白点，周围一圈细绒 */
export function drawFluff(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const rays = 0.5 + 0.5 * Math.cos(Math.atan2(y - c, x - c) * 9)
      const a = Math.max(0, 1 - d) ** 2.2 + Math.max(0, 1 - d) * 0.35 * rays
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.min(1, a) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
