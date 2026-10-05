import { fbm } from '../../util/noise'

/** 一团扬尘：边沿被噪声扰得参差，里面一絮一絮的浓淡；贴图边上一定透明 */
export function drawDust(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c
      const d = r * (1 + (0.5 - fbm(x / 9, y / 9, 37, 4)) * 0.8)
      const a = Math.min(1, Math.max(0, 1 - d) ** 1.2 * (0.6 + 0.55 * fbm(x / 5, y / 5, 41, 3))) * Math.min(1, Math.max(0, 1 - r) * 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一块碎石：不规则的多边形，左上方受光、右下方背光 */
export function drawChip(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const pts: [number, number][] = []
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + Math.sin(k * 2.7) * 0.3
    const r = size * (0.32 + 0.12 * Math.abs(Math.sin(k * 1.9 + 0.4)))
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r])
  }
  const g = ctx.createLinearGradient(size * 0.2, size * 0.2, size * 0.8, size * 0.85)
  g.addColorStop(0, '#e6dcc4')
  g.addColorStop(0.5, '#b8a888')
  g.addColorStop(1, '#6e624e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,50,38,0.55)'
  ctx.lineWidth = size * 0.04
  ctx.stroke()
}

/** 一根木头碎片：细长的浅色木条，带一道木纹 */
export function drawSplinter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#9c7650'
  ctx.beginPath()
  ctx.moveTo(w * 0.04, h * 0.5)
  ctx.lineTo(w * 0.3, h * 0.18)
  ctx.lineTo(w * 0.96, h * 0.38)
  ctx.lineTo(w * 0.7, h * 0.82)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,40,22,0.6)'
  ctx.lineWidth = h * 0.08
  ctx.beginPath()
  ctx.moveTo(w * 0.15, h * 0.5)
  ctx.lineTo(w * 0.85, h * 0.52)
  ctx.stroke()
}

/**
 * 从上往下看的鸽子，三帧排成一行：收着翅膀站着、翅膀展平、翅膀往上收。灰蓝的身子圆滚滚的，收起的翅上两道深色横斑，
 * 颈上一圈绿紫的光泽，尾羽末端一道深色；头朝上
 */
export function drawPigeon(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let k = 0; k < 3; k++) {
    const cx = k * w + w / 2
    const cy = h * 0.52
    ctx.save()
    if (k > 0) {
      const span = k === 1 ? 0.49 : 0.34
      const lift = k === 1 ? 0 : -h * 0.08
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#8f97a6'
        ctx.beginPath()
        ctx.moveTo(cx + side * w * 0.06, cy - h * 0.12)
        ctx.quadraticCurveTo(cx + side * w * span * 0.6, cy - h * 0.24 + lift, cx + side * w * span, cy - h * 0.06 + lift)
        ctx.quadraticCurveTo(cx + side * w * span * 0.7, cy + h * 0.06, cx + side * w * 0.06, cy + h * 0.1)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#3b3f49'
        ctx.beginPath()
        ctx.moveTo(cx + side * w * span * 0.72, cy - h * 0.14 + lift)
        ctx.quadraticCurveTo(cx + side * w * span * 0.94, cy - h * 0.13 + lift, cx + side * w * span, cy - h * 0.06 + lift)
        ctx.quadraticCurveTo(cx + side * w * span * 0.86, cy - h * 0.02, cx + side * w * span * 0.68, cy - h * 0.04)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,42,50,0.75)'
        ctx.lineWidth = h * 0.035
        ctx.beginPath()
        ctx.moveTo(cx + side * w * span * 0.3, cy - h * 0.1)
        ctx.lineTo(cx + side * w * span * 0.36, cy + h * 0.04)
        ctx.moveTo(cx + side * w * span * 0.44, cy - h * 0.11)
        ctx.lineTo(cx + side * w * span * 0.5, cy + h * 0.03)
        ctx.stroke()
      }
    }
    // 尾羽
    ctx.fillStyle = '#7f8794'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.07, cy + h * 0.18)
    ctx.lineTo(cx + w * 0.07, cy + h * 0.18)
    ctx.lineTo(cx + w * 0.09, cy + h * 0.4)
    ctx.lineTo(cx - w * 0.09, cy + h * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2f3239'
    ctx.fillRect(cx - w * 0.09, cy + h * 0.35, w * 0.18, h * 0.05)
    // 身子
    ctx.fillStyle = '#a1a8b5'
    ctx.beginPath()
    ctx.ellipse(cx, cy, w * 0.13, h * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()
    if (k === 0) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#8c94a2'
        ctx.beginPath()
        ctx.ellipse(cx + side * w * 0.075, cy + h * 0.05, w * 0.085, h * 0.22, side * 0.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,42,50,0.8)'
        ctx.lineWidth = h * 0.035
        ctx.beginPath()
        ctx.moveTo(cx + side * w * 0.03, cy + h * 0.0)
        ctx.lineTo(cx + side * w * 0.13, cy + h * 0.02)
        ctx.moveTo(cx + side * w * 0.03, cy + h * 0.09)
        ctx.lineTo(cx + side * w * 0.13, cy + h * 0.11)
        ctx.stroke()
      }
    }
    // 头与颈上的光泽
    ctx.fillStyle = 'rgba(112,152,126,0.85)'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.17, w * 0.1, h * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5c6870'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.25, w * 0.075, h * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d6ad66'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.02, cy - h * 0.31)
    ctx.lineTo(cx + w * 0.02, cy - h * 0.31)
    ctx.lineTo(cx, cy - h * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
