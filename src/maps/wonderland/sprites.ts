/** 「吃我」的小蛋糕：垫着花边纸，糖霜往下淌，顶上一颗樱桃；侧面看得见两层海绵夹着奶油 */
export function drawCake(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2
  const top = s * 0.42
  const rx = s * 0.34
  const ry = s * 0.13
  const h = s * 0.26
  // 花边纸
  ctx.fillStyle = '#f4eee2'
  ctx.beginPath()
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * Math.PI * 2
    const r = 1 + 0.06 * Math.cos(a * 20)
    ctx.lineTo(cx + Math.cos(a) * rx * 1.28 * r, top + h + Math.sin(a) * ry * 1.28 * r)
  }
  ctx.fill()
  // 侧面：海绵、奶油夹层、海绵
  const side = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0)
  side.addColorStop(0, '#e7b77a')
  side.addColorStop(0.35, '#f6cf92')
  side.addColorStop(1, '#b9834d')
  ctx.fillStyle = side
  ctx.beginPath()
  ctx.ellipse(cx, top + h, rx, ry, 0, 0, Math.PI)
  ctx.lineTo(cx - rx, top)
  ctx.ellipse(cx, top, rx, ry, 0, Math.PI, 0, true)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff4e2'
  ctx.fillRect(cx - rx, top + h * 0.45, rx * 2, h * 0.16)
  ctx.beginPath()
  ctx.ellipse(cx, top + h * 0.61, rx, ry, 0, 0, Math.PI)
  ctx.ellipse(cx, top + h * 0.45, rx, ry, 0, Math.PI, 0, true)
  ctx.fill()
  // 顶上的粉色糖霜，沿边往下淌几道
  ctx.fillStyle = '#f08fb0'
  ctx.beginPath()
  ctx.ellipse(cx, top, rx * 1.02, ry * 1.05, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const [a, len] of [
    [0.25, 0.5],
    [0.75, 0.3],
    [1.3, 0.6],
    [1.9, 0.35],
    [2.6, 0.45],
  ] as const) {
    const x = cx + Math.cos(a) * rx * 0.98
    const y = top + Math.sin(a) * ry
    ctx.beginPath()
    ctx.ellipse(x, y + h * len * 0.5, s * 0.025, h * len * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.ellipse(cx - rx * 0.35, top - ry * 0.35, rx * 0.35, ry * 0.3, -0.2, 0, Math.PI * 2)
  ctx.fill()
  // 用葡萄干拼的小字：只看得出一行点
  ctx.fillStyle = '#5a2a2a'
  for (let k = 0; k < 6; k++) {
    ctx.beginPath()
    ctx.arc(cx - rx * 0.55 + k * rx * 0.2, top + ry * 0.25 + (k % 2) * s * 0.008, s * 0.017, 0, Math.PI * 2)
    ctx.fill()
  }
  // 樱桃
  ctx.strokeStyle = '#4c6b2a'
  ctx.lineWidth = s * 0.018
  ctx.beginPath()
  ctx.moveTo(cx + s * 0.02, top - s * 0.06)
  ctx.quadraticCurveTo(cx + s * 0.06, top - s * 0.2, cx + s * 0.12, top - s * 0.22)
  ctx.stroke()
  const ch = ctx.createRadialGradient(cx - s * 0.02, top - s * 0.08, s * 0.01, cx, top - s * 0.05, s * 0.07)
  ch.addColorStop(0, '#ff6a6a')
  ch.addColorStop(1, '#a3101e')
  ctx.fillStyle = ch
  ctx.beginPath()
  ctx.arc(cx, top - s * 0.05, s * 0.065, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(cx - s * 0.022, top - s * 0.075, s * 0.016, 0, Math.PI * 2)
  ctx.fill()
}

/** 「喝我」的小药水：圆肚子的玻璃瓶，冰蓝的水，软木塞，瓶颈上拴着一张写了字的纸签 */
export function drawBottle(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2
  const by = s * 0.62
  const r = s * 0.24
  // 瓶肚
  const glass = ctx.createRadialGradient(cx - r * 0.4, by - r * 0.4, r * 0.1, cx, by, r)
  glass.addColorStop(0, 'rgba(230,250,255,0.95)')
  glass.addColorStop(1, 'rgba(150,200,230,0.85)')
  ctx.fillStyle = glass
  ctx.beginPath()
  ctx.arc(cx, by, r, 0, Math.PI * 2)
  ctx.fill()
  // 水：下半肚子，水面一道亮线
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, by, r * 0.92, 0, Math.PI * 2)
  ctx.clip()
  const water = ctx.createLinearGradient(0, by - r * 0.2, 0, by + r)
  water.addColorStop(0, '#5fd7ff')
  water.addColorStop(1, '#2a5fc4')
  ctx.fillStyle = water
  ctx.fillRect(cx - r, by - r * 0.15, r * 2, r * 1.2)
  ctx.fillStyle = 'rgba(220,250,255,0.9)'
  ctx.fillRect(cx - r, by - r * 0.17, r * 2, s * 0.012)
  ctx.restore()
  // 瓶颈与软木塞
  ctx.fillStyle = 'rgba(190,225,245,0.92)'
  ctx.fillRect(cx - s * 0.06, by - r - s * 0.16, s * 0.12, s * 0.18)
  ctx.fillStyle = '#c99a62'
  ctx.fillRect(cx - s * 0.07, by - r - s * 0.24, s * 0.14, s * 0.1)
  ctx.fillStyle = '#a77a48'
  ctx.fillRect(cx - s * 0.07, by - r - s * 0.16, s * 0.14, s * 0.02)
  // 高光
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = s * 0.025
  ctx.beginPath()
  ctx.arc(cx, by, r * 0.75, Math.PI * 1.1, Math.PI * 1.45)
  ctx.stroke()
  // 纸签：拴在瓶颈上，斜斜地挂着，上面两行字
  ctx.strokeStyle = '#7a5a3a'
  ctx.lineWidth = s * 0.012
  ctx.beginPath()
  ctx.moveTo(cx + s * 0.06, by - r - s * 0.08)
  ctx.lineTo(cx + s * 0.2, by - r + s * 0.02)
  ctx.stroke()
  ctx.save()
  ctx.translate(cx + s * 0.22, by - r + s * 0.06)
  ctx.rotate(0.35)
  ctx.fillStyle = '#f6edd6'
  ctx.fillRect(-s * 0.06, -s * 0.04, s * 0.2, s * 0.13)
  ctx.fillStyle = '#5a4030'
  ctx.fillRect(-s * 0.03, -s * 0.01, s * 0.14, s * 0.018)
  ctx.fillRect(-s * 0.03, s * 0.035, s * 0.1, s * 0.018)
  ctx.restore()
}

/** 柴郡猫只剩一张咧到耳根的笑脸和一双眼睛：月牙形的嘴，一排白牙，粉红的牙床；眼睛黄绿，竖着一道瞳孔 */
export function drawGrin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const my = h * 0.66
  const glow = ctx.createRadialGradient(cx, h * 0.55, 0, cx, h * 0.55, w * 0.5)
  glow.addColorStop(0, 'rgba(220,170,255,0.28)')
  glow.addColorStop(1, 'rgba(220,170,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  // 嘴：上下两道弧围出的月牙
  const half = w * 0.4
  const mouth = (): void => {
    ctx.beginPath()
    ctx.moveTo(cx - half, my - h * 0.12)
    ctx.quadraticCurveTo(cx, my + h * 0.42, cx + half, my - h * 0.12)
    ctx.quadraticCurveTo(cx, my + h * 0.08, cx - half, my - h * 0.12)
    ctx.closePath()
  }
  mouth()
  ctx.fillStyle = '#d65b8f'
  ctx.fill()
  ctx.save()
  mouth()
  ctx.clip()
  ctx.fillStyle = '#fbf7ee'
  ctx.beginPath()
  ctx.moveTo(cx - half, my - h * 0.12)
  ctx.quadraticCurveTo(cx, my + h * 0.42, cx + half, my - h * 0.12)
  ctx.quadraticCurveTo(cx, my + h * 0.22, cx - half, my - h * 0.12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,100,120,0.55)'
  ctx.lineWidth = w * 0.006
  for (let k = -7; k <= 7; k++) {
    const x = cx + (k / 8) * half
    ctx.beginPath()
    ctx.moveTo(x, my - h * 0.2)
    ctx.lineTo(x, my + h * 0.4)
    ctx.stroke()
  }
  ctx.restore()
  mouth()
  ctx.strokeStyle = '#3a1838'
  ctx.lineWidth = w * 0.012
  ctx.stroke()
  // 眼睛
  for (const s of [-1, 1]) {
    const ex = cx + s * w * 0.2
    const ey = h * 0.26
    const iris = ctx.createRadialGradient(ex, ey, 0, ex, ey, w * 0.07)
    iris.addColorStop(0, '#f6ff9a')
    iris.addColorStop(1, '#a9c934')
    ctx.fillStyle = iris
    ctx.beginPath()
    ctx.ellipse(ex, ey, w * 0.075, h * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a1020'
    ctx.beginPath()
    ctx.ellipse(ex, ey, w * 0.012, h * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#3a1838'
    ctx.lineWidth = w * 0.008
    ctx.beginPath()
    ctx.ellipse(ex, ey, w * 0.075, h * 0.12, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** 一团柔光：茶点脚下的光晕、飘着的萤火都用它，靠着色得到颜色 */
export function drawGlow(ctx: CanvasRenderingContext2D, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
}
