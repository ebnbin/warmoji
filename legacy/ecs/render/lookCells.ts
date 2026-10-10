import type { LookCell } from '../../types/statuses'

/** 状态与漫画符号用的图：全画成白与灰，画的时候再染色；只用几何形状，不随 emoji 画风变 */

type Draw = (g: CanvasRenderingContext2D, size: number) => void

/** 一团中间实、往外渐渐淡没的白：染成什么颜色就是什么颜色的光晕 */
const glow: Draw = (g, size) => {
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** 冰块：半透明的一块，亮边、几道裂面与左上的高光 */
const ice: Draw = (g, size) => {
  const m = size * 0.07
  const w = size - m * 2
  roundRect(g, m, m, w, w, size * 0.1)
  g.fillStyle = 'rgba(255,255,255,0.42)'
  g.fill()
  g.lineWidth = size * 0.035
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = size * 0.015
  g.beginPath()
  g.moveTo(m, size * 0.62)
  g.lineTo(size * 0.38, size * 0.48)
  g.lineTo(size * 0.58, size - m)
  g.moveTo(size * 0.38, size * 0.48)
  g.lineTo(size * 0.7, m)
  g.moveTo(size * 0.58, size * 0.72)
  g.lineTo(size - m, size * 0.55)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineCap = 'round'
  g.lineWidth = size * 0.04
  g.beginPath()
  g.moveTo(size * 0.2, size * 0.34)
  g.lineTo(size * 0.34, size * 0.2)
  g.moveTo(size * 0.2, size * 0.48)
  g.lineTo(size * 0.26, size * 0.42)
  g.stroke()
}

/** 护罩：中间几乎透明、往边上渐浓的一个球，一圈亮边与左上的高光 */
const bubble: Draw = (g, size) => {
  const c = size / 2
  const r = size * 0.47
  const grad = g.createRadialGradient(c, c, r * 0.2, c, c, r)
  grad.addColorStop(0, 'rgba(255,255,255,0.04)')
  grad.addColorStop(0.75, 'rgba(255,255,255,0.22)')
  grad.addColorStop(1, 'rgba(255,255,255,0.7)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(c, c, r, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = size * 0.022
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.stroke()
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.beginPath()
  g.ellipse(c - r * 0.42, c - r * 0.5, r * 0.22, r * 0.11, -Math.PI / 4, 0, Math.PI * 2)
  g.fill()
}

/** 五角星 */
const star: Draw = (g, size) => {
  const c = size / 2
  const ro = size * 0.44
  const ri = size * 0.19
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    if (i === 0) g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
    else g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = '#ffffff'
  g.fill()
}

/** 睡着冒的 Z：用多边形画，不靠字体 */
const zee: Draw = (g, size) => {
  const a = size * 0.16
  const b = size * 0.84
  const t = size * 0.16
  g.beginPath()
  g.moveTo(a, a)
  g.lineTo(b, a)
  g.lineTo(b, a + t)
  g.lineTo(a + t * 1.4, b - t)
  g.lineTo(b, b - t)
  g.lineTo(b, b)
  g.lineTo(a, b)
  g.lineTo(a, b - t)
  g.lineTo(b - t * 1.4, a + t)
  g.lineTo(a, a + t)
  g.closePath()
  g.fillStyle = '#ffffff'
  g.fill()
}

const heart: Draw = (g, size) => {
  const c = size / 2
  const top = size * 0.3
  g.beginPath()
  g.moveTo(c, size * 0.86)
  g.bezierCurveTo(size * 0.12, size * 0.56, size * 0.02, top, size * 0.28, size * 0.16)
  g.bezierCurveTo(size * 0.4, size * 0.1, c, size * 0.2, c, top)
  g.bezierCurveTo(c, size * 0.2, size * 0.6, size * 0.1, size * 0.72, size * 0.16)
  g.bezierCurveTo(size * 0.98, top, size * 0.88, size * 0.56, c, size * 0.86)
  g.closePath()
  g.fillStyle = '#ffffff'
  g.fill()
}

/** 汗滴：上尖下圆，右上一点高光 */
const drop: Draw = (g, size) => {
  const c = size / 2
  const r = size * 0.27
  const cy = size * 0.62
  g.beginPath()
  g.moveTo(c, size * 0.08)
  g.bezierCurveTo(c + r * 0.6, size * 0.3, c + r, cy - r * 0.6, c + r, cy)
  g.arc(c, cy, r, 0, Math.PI)
  g.bezierCurveTo(c - r, cy - r * 0.6, c - r * 0.6, size * 0.3, c, size * 0.08)
  g.closePath()
  g.fillStyle = '#e6e6e6'
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(c + r * 0.35, cy - r * 0.25, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2)
  g.fill()
}

/** 一圈往外的尖刺：中间空着，垫在身体后面只露出一圈刺尖 */
const spikes: Draw = (g, size) => {
  const c = size / 2
  const n = 14
  const ri = size * 0.3
  const ro = size * 0.49
  const half = Math.PI / n
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.moveTo(c + Math.cos(a - half) * ri, c + Math.sin(a - half) * ri)
    g.lineTo(c + Math.cos(a) * ro, c + Math.sin(a) * ro)
    g.lineTo(c + Math.cos(a + half) * ri, c + Math.sin(a + half) * ri)
    g.closePath()
  }
  g.fillStyle = '#ffffff'
  g.fill()
  g.lineWidth = size * 0.012
  g.strokeStyle = 'rgba(80,80,80,0.9)'
  g.stroke()
}

const DRAW: Readonly<Record<LookCell, Draw>> = { glow, ice, bubble, star, zee, heart, drop, spikes }

export const LOOK_CELLS = Object.keys(DRAW) as LookCell[]

/** 图集里认这张图的名字 */
export function lookKey(id: LookCell): string {
  return `look:${id}`
}

/** 画在边长 size 的方格里 */
export function lookCanvas(id: LookCell, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const g = cv.getContext('2d')
  if (!g) throw new Error(`${id} 拿不到 2D 画布`)
  DRAW[id](g, size)
  return cv
}
