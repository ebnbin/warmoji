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
  g.addColorStop(0, '#dedfdd')
  g.addColorStop(0.5, '#a4a7a8')
  g.addColorStop(1, '#585c60')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(40,42,46,0.55)'
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
 * 从上往下看的乌鸦，三帧排成一行：收着翅膀站着、翅膀展平、翅膀往上收。通体乌黑，背上泛着一点蓝紫的光泽，翅尖的飞羽分开几指，
 * 尾羽长、末端略圆；头朝上，喙粗而直
 */
export function drawCrow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let k = 0; k < 3; k++) {
    const cx = k * w + w / 2
    const cy = h * 0.52
    ctx.save()
    if (k > 0) {
      const span = k === 1 ? 0.5 : 0.36
      const lift = k === 1 ? 0 : -h * 0.1
      for (const side of [-1, 1]) {
        // 翅膀：前缘平直、后缘弧着收向身子
        ctx.fillStyle = '#1a1a1f'
        ctx.beginPath()
        ctx.moveTo(cx + side * w * 0.05, cy - h * 0.13)
        ctx.quadraticCurveTo(cx + side * w * span * 0.55, cy - h * 0.22 + lift, cx + side * w * span, cy - h * 0.1 + lift)
        ctx.quadraticCurveTo(cx + side * w * span * 0.75, cy + h * 0.1, cx + side * w * 0.05, cy + h * 0.12)
        ctx.closePath()
        ctx.fill()
        // 翅尖分开的飞羽
        ctx.strokeStyle = '#0c0c10'
        ctx.lineWidth = h * 0.03
        ctx.beginPath()
        for (let f = 0; f < 4; f++) {
          const t = 0.62 + f * 0.11
          ctx.moveTo(cx + side * w * span * t, cy - h * 0.12 + lift * t)
          ctx.lineTo(cx + side * w * span * (t + 0.06), cy + h * (0.02 + f * 0.015) + lift * 0.5)
        }
        ctx.stroke()
        // 翅上的光泽
        ctx.strokeStyle = 'rgba(90,96,150,0.35)'
        ctx.lineWidth = h * 0.025
        ctx.beginPath()
        ctx.moveTo(cx + side * w * 0.08, cy - h * 0.08)
        ctx.quadraticCurveTo(cx + side * w * span * 0.5, cy - h * 0.14 + lift, cx + side * w * span * 0.85, cy - h * 0.1 + lift)
        ctx.stroke()
      }
    }
    // 尾羽：长，末端略圆
    ctx.fillStyle = '#15151a'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.07, cy + h * 0.16)
    ctx.lineTo(cx + w * 0.07, cy + h * 0.16)
    ctx.quadraticCurveTo(cx + w * 0.11, cy + h * 0.36, cx + w * 0.08, cy + h * 0.44)
    ctx.quadraticCurveTo(cx, cy + h * 0.48, cx - w * 0.08, cy + h * 0.44)
    ctx.quadraticCurveTo(cx - w * 0.11, cy + h * 0.36, cx - w * 0.07, cy + h * 0.16)
    ctx.closePath()
    ctx.fill()
    // 身子
    ctx.fillStyle = '#1e1e24'
    ctx.beginPath()
    ctx.ellipse(cx, cy, w * 0.13, h * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    if (k === 0) {
      // 收着的翅膀：两片盖在背上
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#17171c'
        ctx.beginPath()
        ctx.ellipse(cx + side * w * 0.07, cy + h * 0.06, w * 0.085, h * 0.23, side * 0.12, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 背上的光泽
    ctx.fillStyle = 'rgba(96,104,160,0.4)'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.06, w * 0.07, h * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
    // 头与喙
    ctx.fillStyle = '#121216'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.26, w * 0.08, h * 0.085, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2e2e32'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.028, cy - h * 0.32)
    ctx.lineTo(cx + w * 0.028, cy - h * 0.32)
    ctx.lineTo(cx, cy - h * 0.42)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
