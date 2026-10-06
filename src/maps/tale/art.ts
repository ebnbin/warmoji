import type { Point } from '../../util/vec'

/** 笔尖、指尖的贴图每格多少像素 */
export const ART_PPU = 96
/** 笔尖：贴图里笔尖朝左，从尖到看得见的尽头多长、最宽处多宽，格 */
export const NIB = { lenU: 1.7, widthU: 0.62 } as const
/** 指尖：贴图里指尖朝右，多长、多宽，格 */
export const FINGER = { lenU: 6.5, widthU: 2.5 } as const
/** 橡皮的影子：多长、多宽，格 */
export const RUB = { lenU: 2.6, widthU: 1.3 } as const

/** 笔尖的外形：尖在 (0, h/2)，往右张开到肩，肩后收成笔杆，再往后淡出 */
function nibPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = h / 2
  ctx.beginPath()
  ctx.moveTo(2, m)
  ctx.bezierCurveTo(w * 0.22, m - h * 0.08, w * 0.42, m - h * 0.38, w * 0.58, m - h * 0.44)
  ctx.quadraticCurveTo(w * 0.66, m - h * 0.47, w * 0.72, m - h * 0.36)
  ctx.lineTo(w, m - h * 0.34)
  ctx.lineTo(w, m + h * 0.34)
  ctx.lineTo(w * 0.72, m + h * 0.36)
  ctx.quadraticCurveTo(w * 0.66, m + h * 0.47, w * 0.58, m + h * 0.44)
  ctx.bezierCurveTo(w * 0.42, m + h * 0.38, w * 0.22, m + h * 0.08, 2, m)
  ctx.closePath()
}

/** 尖以后越往后越淡：画面里只看得见一截笔尖 */
function fadeTail(ctx: CanvasRenderingContext2D, w: number, h: number, from: number, dir: 1 | -1): void {
  ctx.globalCompositeOperation = 'destination-in'
  const g = ctx.createLinearGradient(dir > 0 ? 0 : w, 0, dir > 0 ? w : 0, 0)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(from, 'rgba(0,0,0,1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
}

/** 柔边的剪影：把形状画到画布外，只留下它的模糊投影；比画布的模糊滤镜通用 */
function softFill(ctx: CanvasRenderingContext2D, blur: number, shape: () => void): void {
  const off = ctx.canvas.width * 2
  ctx.save()
  ctx.shadowColor = '#000'
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = off
  ctx.translate(-off, 0)
  ctx.fillStyle = '#000'
  shape()
  ctx.fill()
  ctx.restore()
}

/** 一截钢笔尖：金色的笔尖，中间一道缝通到气孔，上缘一道高光，肩后是黑色的笔杆，越往后越淡 */
export function drawNib(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = h / 2
  ctx.save()
  nibPath(ctx, w, h)
  ctx.clip()
  ctx.fillStyle = '#1d1a1c'
  ctx.fillRect(w * 0.7, 0, w, h)
  const metal = ctx.createLinearGradient(0, m - h * 0.45, 0, m + h * 0.45)
  metal.addColorStop(0, '#fff1bf')
  metal.addColorStop(0.3, '#e8c460')
  metal.addColorStop(0.62, '#b8862c')
  metal.addColorStop(1, '#7a5418')
  ctx.fillStyle = metal
  ctx.fillRect(0, 0, w * 0.72, h)
  // 笔尖上压出的花纹
  ctx.strokeStyle = 'rgba(110,70,20,0.45)'
  ctx.lineWidth = h * 0.025
  for (const k of [0.5, 0.56]) {
    ctx.beginPath()
    ctx.moveTo(w * k, m - h * 0.36)
    ctx.quadraticCurveTo(w * (k - 0.06), m, w * k, m + h * 0.36)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,250,225,0.8)'
  ctx.lineWidth = h * 0.04
  ctx.beginPath()
  ctx.moveTo(w * 0.1, m - h * 0.05)
  ctx.quadraticCurveTo(w * 0.35, m - h * 0.28, w * 0.6, m - h * 0.36)
  ctx.stroke()
  ctx.strokeStyle = '#3a2610'
  ctx.lineWidth = h * 0.03
  ctx.beginPath()
  ctx.moveTo(3, m)
  ctx.lineTo(w * 0.36, m)
  ctx.stroke()
  ctx.fillStyle = '#3a2610'
  ctx.beginPath()
  ctx.arc(w * 0.38, m, h * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(60,40,15,0.6)'
  ctx.lineWidth = h * 0.02
  nibPath(ctx, w, h)
  ctx.stroke()
  fadeTail(ctx, w, h, 0.62, 1)
}

/** 笔尖落在纸上的影子：笔尖的剪影，边缘柔，越往后越淡 */
export function drawNibShadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  softFill(ctx, h * 0.08, () => {
    ctx.translate(w * 0.04, h * 0.12)
    ctx.scale(0.92, 0.76)
    nibPath(ctx, w, h)
  })
  fadeTail(ctx, w, h, 0.4, 1)
}

/** 一截指尖：肤色的指头，圆圆的指甲在前，指节上一两道纹，越往后越淡 */
export function drawFinger(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = h / 2
  const r = h * 0.46
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(0, m - r)
  ctx.lineTo(w - r, m - r * 0.96)
  ctx.arc(w - r, m, r * 0.96, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(0, m + r)
  ctx.closePath()
  ctx.clip()
  const skin = ctx.createLinearGradient(0, m - r, 0, m + r)
  skin.addColorStop(0, '#ffe2cf')
  skin.addColorStop(0.35, '#f4c3a3')
  skin.addColorStop(0.8, '#d9967a')
  skin.addColorStop(1, '#b97559')
  ctx.fillStyle = skin
  ctx.fillRect(0, 0, w, h)
  // 指甲
  const nx = w - r * 1.55
  ctx.beginPath()
  ctx.moveTo(nx, m - r * 0.55)
  ctx.lineTo(w - r * 0.45, m - r * 0.52)
  ctx.quadraticCurveTo(w - r * 0.08, m, w - r * 0.45, m + r * 0.52)
  ctx.lineTo(nx, m + r * 0.55)
  ctx.quadraticCurveTo(nx - r * 0.22, m, nx, m - r * 0.55)
  const nail = ctx.createLinearGradient(0, m - r * 0.55, 0, m + r * 0.55)
  nail.addColorStop(0, '#ffeee8')
  nail.addColorStop(0.5, '#f6cfc4')
  nail.addColorStop(1, '#e2aa9a')
  ctx.fillStyle = nail
  ctx.fill()
  ctx.strokeStyle = 'rgba(170,100,80,0.55)'
  ctx.lineWidth = h * 0.02
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = h * 0.035
  ctx.beginPath()
  ctx.moveTo(nx + r * 0.2, m - r * 0.32)
  ctx.lineTo(w - r * 0.7, m - r * 0.3)
  ctx.stroke()
  // 指节的纹
  ctx.strokeStyle = 'rgba(150,85,62,0.4)'
  ctx.lineWidth = h * 0.022
  for (const k of [0.3, 0.36]) {
    ctx.beginPath()
    ctx.moveTo(w * k, m - r * 0.7)
    ctx.quadraticCurveTo(w * (k + 0.03), m, w * k, m + r * 0.7)
    ctx.stroke()
  }
  ctx.restore()
  fadeTail(ctx, w, h, 0.45, -1)
}

/** 橡皮的影子：一块柔边的圆角长方形 */
export function drawRub(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const p = h * 0.22
  softFill(ctx, h * 0.14, () => {
    ctx.beginPath()
    ctx.roundRect(p, p, w - p * 2, h - p * 2, h * 0.18)
  })
}

// ---------------------------------------------------------------- 翻页

/** 半平面 (X − m)·n ≥ 0 切多边形 */
export function clipHalf(poly: readonly Point[], m: Point, n: Point, off = 0): Point[] {
  const out: Point[] = []
  const side = (p: Point): number => (p.x - m.x) * n.x + (p.y - m.y) * n.y - off
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/**
 * 捏着页角 c 拉到 p 时这一页怎么翻：折线是 c、p 连线的中垂线，lifted 是这一页离开纸面的那部分（露出底下的下一页），flap 是翻过来盖在折线另一侧的背面，
 * 都是页面上的多边形；m、n 是折线上的一点与朝 c 那一侧的单位法线
 */
export function turnOf(page: readonly Point[], c: Point, p: Point): { lifted: Point[]; flap: Point[]; m: Point; n: Point } {
  const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 }
  const len = Math.hypot(c.x - p.x, c.y - p.y)
  if (len < 1e-6) return { lifted: [], flap: [], m, n: { x: 1, y: 0 } }
  const n = { x: (c.x - p.x) / len, y: (c.y - p.y) / len }
  const lifted = clipHalf(page, m, n)
  const flap = lifted.map((q) => {
    const d = (q.x - m.x) * n.x + (q.y - m.y) * n.y
    return { x: q.x - 2 * d * n.x, y: q.y - 2 * d * n.y }
  })
  return { lifted, flap, m, n }
}
