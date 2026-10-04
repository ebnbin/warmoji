/** 樱庭的小东西：花瓣与锦鲤，从上往下看、头朝贴图的右边（x 正向），用 Canvas 画一次 */

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

/** 几种锦鲤的花色：底色，再一块块斑的颜色与位置（沿身长 0…1、横向 −1…1、大小） */
interface Coat {
  readonly base: string
  readonly spots: readonly { readonly color: string; readonly at: number; readonly side: number; readonly size: number }[]
}

export const KOI_COATS: readonly Coat[] = [
  // 红白：白底上几块大红斑
  {
    base: '#f7f2ea',
    spots: [
      { color: '#d9452e', at: 0.78, side: 0.1, size: 0.16 },
      { color: '#d9452e', at: 0.5, side: -0.2, size: 0.2 },
      { color: '#d9452e', at: 0.26, side: 0.25, size: 0.13 },
    ],
  },
  // 丹顶：通身雪白，头顶一点圆红
  { base: '#f8f5ef', spots: [{ color: '#d63b2a', at: 0.84, side: 0, size: 0.1 }] },
  // 黄金：通身金黄
  { base: '#e8b440', spots: [{ color: '#f3cf6a', at: 0.6, side: 0, size: 0.24 }] },
  // 昭和：黑底上红白相间
  {
    base: '#2a2422',
    spots: [
      { color: '#d9452e', at: 0.75, side: 0.15, size: 0.16 },
      { color: '#f4efe6', at: 0.48, side: -0.2, size: 0.15 },
      { color: '#d9452e', at: 0.3, side: 0.2, size: 0.12 },
    ],
  },
]

/** 一条锦鲤：纺锤形的身子，尾鳍分叉，两片半透明的胸鳍；花斑按 coat 画，身子中间一道高光 */
export function drawKoi(ctx: CanvasRenderingContext2D, w: number, h: number, coat: Coat): void {
  const cy = h / 2
  const head = w * 0.94
  const tail = w * 0.2
  const bw = h * 0.21
  ctx.save()
  // 胸鳍与尾鳍：半透明
  ctx.fillStyle = 'rgba(246, 236, 226, 0.55)'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(w * 0.7, cy + s * bw * 1.15, w * 0.07, h * 0.12, s * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(tail + w * 0.05, cy)
  ctx.quadraticCurveTo(tail - w * 0.06, cy - h * 0.1, w * 0.02, cy - h * 0.34)
  ctx.quadraticCurveTo(tail - w * 0.03, cy, w * 0.02, cy + h * 0.34)
  ctx.quadraticCurveTo(tail - w * 0.06, cy + h * 0.1, tail + w * 0.05, cy)
  ctx.fill()
  // 身子：从头到尾收细
  const body = new Path2D()
  body.moveTo(head, cy)
  body.bezierCurveTo(head - w * 0.04, cy - bw * 1.1, w * 0.55, cy - bw * 1.25, w * 0.42, cy - bw * 0.95)
  body.quadraticCurveTo(w * 0.28, cy - bw * 0.55, tail, cy - bw * 0.18)
  body.lineTo(tail, cy + bw * 0.18)
  body.quadraticCurveTo(w * 0.28, cy + bw * 0.55, w * 0.42, cy + bw * 0.95)
  body.bezierCurveTo(w * 0.55, cy + bw * 1.25, head - w * 0.04, cy + bw * 1.1, head, cy)
  ctx.fillStyle = coat.base
  ctx.fill(body)
  ctx.save()
  ctx.clip(body)
  for (const s of coat.spots) {
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.ellipse(tail + (head - tail) * s.at, cy + s.side * bw, (head - tail) * s.size, bw * (0.7 + s.size * 1.5), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = ctx.createLinearGradient(0, cy - bw, 0, cy + bw)
  g.addColorStop(0, 'rgba(0, 0, 0, 0.18)')
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0.22)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0.22)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  ctx.restore()
}
