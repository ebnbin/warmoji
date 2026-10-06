import { fbm } from '../../util/noise'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function ease(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 火苗：底下一圈发蓝的焰根，往上是白黄的焰心、橙红的外焰，尖上淡出；画在 w×h 的画布上，焰根在下 */
export function drawFlame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5
      const v = (y + 0.5) / h
      // 从下往上：v = 1 是焰根，v = 0 是焰尖；半宽先鼓后收
      const rise = 1 - v
      const half = 0.4 * Math.sin(Math.PI * Math.min(1, rise * 1.1 + 0.05)) ** 0.75 * (0.3 + 0.7 * v)
      const d = half > 0 ? Math.abs(u) / half : 2
      const a = clamp01(1 - d) ** 0.7 * ease(0, 0.3, rise) * ease(1, 0.86, rise)
      const core = clamp01(1 - d * 1.7) * ease(0.15, 0.55, rise) * ease(0.85, 0.5, rise)
      const base = ease(0.25, 0.05, rise) * clamp01(1 - d)
      const o = (y * w + x) * 4
      img.data[o] = Math.round(255 - 120 * base)
      img.data[o + 1] = Math.round(110 + 120 * core + 30 * a - 40 * base)
      img.data[o + 2] = Math.round(40 + 170 * core + 180 * base)
      img.data[o + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 柔和的光点：中心实、往外按平方淡出，靠着色得到颜色 */
export function drawGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(clamp01(1 - d) ** 2 * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一团烟：中心实、边缘絮状地淡出 */
export function drawSmoke(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const fluff = 0.7 + 0.3 * fbm(x / 9, y / 9, 41, 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(clamp01(1 - d) ** 1.5 * fluff * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 从上往下看的一只飞蛾：灰白的身子，前翅长、后翅圆，翅上一道淡紫的纹；头朝画布上方 */
export function drawMoth(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h / 2
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#e9e1d2'
    ctx.beginPath()
    ctx.moveTo(cx + side * w * 0.04, cy - h * 0.12)
    ctx.quadraticCurveTo(cx + side * w * 0.3, cy - h * 0.42, cx + side * w * 0.47, cy - h * 0.1)
    ctx.quadraticCurveTo(cx + side * w * 0.32, cy + h * 0.06, cx + side * w * 0.05, cy + h * 0.04)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#d6cbb8'
    ctx.beginPath()
    ctx.moveTo(cx + side * w * 0.04, cy + h * 0.02)
    ctx.quadraticCurveTo(cx + side * w * 0.34, cy + h * 0.06, cx + side * w * 0.3, cy + h * 0.3)
    ctx.quadraticCurveTo(cx + side * w * 0.14, cy + h * 0.36, cx + side * w * 0.04, cy + h * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(150,120,190,0.6)'
    ctx.lineWidth = w * 0.025
    ctx.beginPath()
    ctx.moveTo(cx + side * w * 0.1, cy - h * 0.1)
    ctx.quadraticCurveTo(cx + side * w * 0.26, cy - h * 0.2, cx + side * w * 0.38, cy - h * 0.12)
    ctx.stroke()
  }
  ctx.fillStyle = '#8f8476'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * 0.05, h * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 从上往下看的一只蝙蝠：紫黑的身子与一对尖耳，两片膜翼张开，翼骨从腕上分出去撑起扇形的后缘，翼膜透一点紫；头朝画布上方 */
export function drawBat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const X = (u: number): number => cx + u * w
  const Y = (v: number): number => v * h
  for (const side of [-1, 1]) {
    const sx = (u: number): number => X(side * u)
    // 肩、腕、翼尖，后缘在指骨之间一段段往里凹
    const shoulder = [sx(0.05), Y(0.32)] as const
    const wrist = [sx(0.24), Y(0.12)] as const
    const tip = [sx(0.48), Y(0.3)] as const
    const fingers = [
      [sx(0.4), Y(0.62)],
      [sx(0.28), Y(0.72)],
      [sx(0.15), Y(0.66)],
    ] as const
    const hip = [sx(0.05), Y(0.62)] as const
    ctx.fillStyle = 'rgba(64, 36, 92, 0.94)'
    ctx.beginPath()
    ctx.moveTo(shoulder[0], shoulder[1])
    ctx.lineTo(wrist[0], wrist[1])
    ctx.lineTo(tip[0], tip[1])
    let prev: readonly [number, number] = tip
    for (const f of [...fingers, hip]) {
      ctx.quadraticCurveTo((prev[0] + f[0]) / 2 - side * w * 0.015, (prev[1] + f[1]) / 2 - h * 0.08, f[0], f[1])
      prev = f
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(132, 98, 172, 0.85)'
    ctx.lineWidth = Math.max(1, w * 0.02)
    ctx.beginPath()
    ctx.moveTo(shoulder[0], shoulder[1])
    ctx.lineTo(wrist[0], wrist[1])
    ctx.lineTo(tip[0], tip[1])
    for (const f of fingers) {
      ctx.moveTo(wrist[0], wrist[1])
      ctx.lineTo(f[0], f[1])
    }
    ctx.stroke()
    // 耳朵
    ctx.fillStyle = '#24142f'
    ctx.beginPath()
    ctx.moveTo(sx(0.02), Y(0.2))
    ctx.lineTo(sx(0.055), Y(0.04))
    ctx.lineTo(sx(0.07), Y(0.2))
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#24142f'
  ctx.beginPath()
  ctx.ellipse(cx, Y(0.46), w * 0.055, h * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, Y(0.22), w * 0.05, 0, Math.PI * 2)
  ctx.fill()
}
