import { SUN } from '../../data/light'

/** 圆角矩形的路径 */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

/** 侧面看的潜水钟贴图：高宽比，吊环顶与钟口在图里多高、钟口的半宽，都是按图的宽高算的比例 */
export const BELL_ART = { aspect: 1.2, ringY: 0.055, lipY: 0.8, lipHalf: 0.4 } as const

/**
 * 从侧面看的老式潜水钟，宽 w 高 h 的图：宽圆顶、往下略张开的黄漆钢壳，两道黑铁箍与一圈圈铆钉，漆面往下流的锈迹；
 * 正面一扇、两侧各一扇亮着暖光的舷窗，钟口一圈加厚的黑铁唇，唇上两盏朝下照的灯；顶上吊耳与吊环。钟口往下漏出一团暖光
 */
export function drawBell(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = w / 240
  const cx = w / 2
  const crownY = h * 0.16
  const shY = h * 0.38
  const lipY = h * BELL_ART.lipY
  const hwSh = w * 0.335
  const hwLip = w * BELL_ART.lipHalf
  const hwAt = (y: number): number => hwSh + (hwLip - hwSh) * Math.max(0, (y - shY) / (lipY - shY)) ** 1.25
  // 钟口往下漏出来的光与两盏灯的光锥：钟里亮着灯、存着气
  const spill = ctx.createRadialGradient(cx, lipY + h * 0.02, 4 * s, cx, lipY + h * 0.02, w * 0.5)
  spill.addColorStop(0, 'rgba(255, 240, 200, 0.6)')
  spill.addColorStop(0.5, 'rgba(255, 225, 170, 0.18)')
  spill.addColorStop(1, 'rgba(255, 225, 170, 0)')
  ctx.fillStyle = spill
  ctx.beginPath()
  ctx.ellipse(cx, lipY + h * 0.06, w * 0.5, h * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const side of [-1, 1]) {
    const x = cx + side * (hwLip - w * 0.035)
    const cone = ctx.createLinearGradient(0, lipY, 0, h)
    cone.addColorStop(0, 'rgba(255, 245, 215, 0.3)')
    cone.addColorStop(1, 'rgba(255, 245, 215, 0)')
    ctx.fillStyle = cone
    ctx.beginPath()
    ctx.moveTo(x - 5 * s, lipY + 4 * s)
    ctx.lineTo(x + 5 * s, lipY + 4 * s)
    ctx.lineTo(x + side * w * 0.06 + 16 * s, h)
    ctx.lineTo(x + side * w * 0.06 - 16 * s, h)
    ctx.closePath()
    ctx.fill()
  }
  // 钟壳：两侧按 hwAt 往下张开，顶上一个宽圆顶，钟口的前沿往下鼓一点
  const body = new Path2D()
  body.moveTo(cx - hwLip, lipY)
  for (let i = 1; i <= 24; i++) {
    const y = lipY - ((lipY - shY) * i) / 24
    body.lineTo(cx - hwAt(y), y)
  }
  body.bezierCurveTo(cx - hwSh, shY - h * 0.2, cx - w * 0.22, crownY, cx, crownY)
  body.bezierCurveTo(cx + w * 0.22, crownY, cx + hwSh, shY - h * 0.2, cx + hwSh, shY)
  for (let i = 1; i <= 24; i++) {
    const y = shY + ((lipY - shY) * i) / 24
    body.lineTo(cx + hwAt(y), y)
  }
  body.bezierCurveTo(cx + hwLip * 0.55, lipY + h * 0.045, cx - hwLip * 0.55, lipY + h * 0.045, cx - hwLip, lipY)
  body.closePath()
  const paint = ctx.createLinearGradient(cx - hwLip, 0, cx + hwLip, 0)
  paint.addColorStop(0, '#5a3c00')
  paint.addColorStop(0.15, '#a86f00')
  paint.addColorStop(0.33, '#e8a800')
  paint.addColorStop(0.43, '#ffd34a')
  paint.addColorStop(0.55, '#e3a200')
  paint.addColorStop(0.82, '#9a6400')
  paint.addColorStop(1, '#4a3000')
  ctx.fillStyle = paint
  ctx.fill(body)
  ctx.save()
  ctx.clip(body)
  // 圆顶吃一点头顶的蓝，钟口一圈压暗
  const shade = ctx.createLinearGradient(0, crownY, 0, lipY + h * 0.05)
  shade.addColorStop(0, 'rgba(140, 190, 255, 0.32)')
  shade.addColorStop(0.3, 'rgba(140, 190, 255, 0.06)')
  shade.addColorStop(0.7, 'rgba(0, 0, 0, 0)')
  shade.addColorStop(1, 'rgba(0, 10, 30, 0.42)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 9; i++) {
    const x = cx - hwSh * 0.9 + ((i * 0.618) % 1) * hwSh * 1.8
    const y0 = shY + h * 0.05 + ((i * 0.37) % 1) * h * 0.2
    const len = h * (0.06 + 0.1 * ((i * 0.71) % 1))
    const rust = ctx.createLinearGradient(0, y0, 0, y0 + len)
    rust.addColorStop(0, 'rgba(110, 50, 10, 0.55)')
    rust.addColorStop(1, 'rgba(110, 50, 10, 0)')
    ctx.strokeStyle = rust
    ctx.lineWidth = (1.5 + ((i * 0.43) % 1) * 2) * s
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x + s, y0 + len)
    ctx.stroke()
  }
  // 铁箍画成朝前的半个椭圆、铆钉沿着它排，看得出钟是圆的
  const band = (y: number, lw: number): void => {
    const hw = hwAt(y) + s
    const e = hw * 0.14
    ctx.lineWidth = lw
    ctx.strokeStyle = '#2b2b2e'
    ctx.beginPath()
    ctx.ellipse(cx, y, hw, e, 0, 0, Math.PI)
    ctx.stroke()
    ctx.lineWidth = lw * 0.3
    ctx.strokeStyle = 'rgba(200, 210, 225, 0.35)'
    ctx.beginPath()
    ctx.ellipse(cx, y - lw * 0.3, hw, e, 0, 0.3, Math.PI - 0.3)
    ctx.stroke()
    for (let i = 1; i < 14; i++) {
      const a = (i / 14) * Math.PI
      const x = cx + Math.cos(a) * hw
      const yy = y + Math.sin(a) * e
      const k = Math.sin(a)
      ctx.fillStyle = `rgba(15, 15, 18, ${0.6 + 0.35 * k})`
      ctx.beginPath()
      ctx.arc(x, yy, 2.2 * s * (0.6 + 0.4 * k), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(220, 225, 235, ${0.55 * k})`
      ctx.beginPath()
      ctx.arc(x - 0.6 * s, yy - 0.7 * s, 0.9 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  band(shY + h * 0.02, 7 * s)
  band(h * 0.66, 6 * s)
  // 舷窗：转到两侧的那两扇看起来是扁的
  const port = (x: number, y: number, rx: number, ry: number): void => {
    ctx.fillStyle = '#1e1e21'
    ctx.beginPath()
    ctx.ellipse(x, y, rx + 6 * s, ry + 6 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6f7378'
    ctx.beginPath()
    ctx.ellipse(x, y, rx + 4 * s, ry + 4 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    const glass = ctx.createRadialGradient(x - rx * 0.25, y - ry * 0.25, s, x, y, Math.max(rx, ry))
    glass.addColorStop(0, '#fff8dc')
    glass.addColorStop(0.55, '#ffd77a')
    glass.addColorStop(1, '#c98a30')
    ctx.fillStyle = glass
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = 2 * s
    ctx.beginPath()
    ctx.ellipse(x, y, rx * 0.62, ry * 0.62, 0, Math.PI * 1.05, Math.PI * 1.45)
    ctx.stroke()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.fillStyle = 'rgba(20, 20, 22, 0.95)'
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * (rx + 2.2 * s), y + Math.sin(a) * (ry + 2.2 * s), 1.2 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const py = h * 0.52
  port(cx, py, w * 0.085, w * 0.085)
  for (const side of [-1, 1]) port(cx + side * hwAt(py) * 0.8, py, w * 0.03, w * 0.07)
  ctx.restore()
  // 钟口的黑铁唇与挂在唇上的两盏灯
  const lipHw = hwLip + 3 * s
  const lipE = lipHw * 0.14
  ctx.lineWidth = 10 * s
  ctx.strokeStyle = '#26262a'
  ctx.beginPath()
  ctx.ellipse(cx, lipY - 2 * s, lipHw, lipE, 0, 0, Math.PI)
  ctx.stroke()
  ctx.lineWidth = 2.5 * s
  ctx.strokeStyle = 'rgba(200, 210, 225, 0.45)'
  ctx.beginPath()
  ctx.ellipse(cx, lipY - 6 * s, lipHw, lipE, 0, 0.2, Math.PI - 0.2)
  ctx.stroke()
  for (const side of [-1, 1]) {
    const x = cx + side * (hwLip - w * 0.035)
    ctx.fillStyle = '#1b1b1e'
    rounded(ctx, x - 9 * s, lipY - 6 * s, 18 * s, 14 * s, 3 * s)
    ctx.fill()
    ctx.fillStyle = '#fffbe8'
    ctx.beginPath()
    ctx.ellipse(x, lipY + 7 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 吊耳与吊环：吊环顶在 ringY，缆绳从这里接上去
  const ringR = w * 0.035
  const ringC = h * BELL_ART.ringY + ringR + 2.5 * s
  ctx.fillStyle = '#2b2b2e'
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.05, crownY + 3 * s)
  ctx.lineTo(cx - w * 0.03, ringC + ringR * 0.6)
  ctx.lineTo(cx + w * 0.03, ringC + ringR * 0.6)
  ctx.lineTo(cx + w * 0.05, crownY + 3 * s)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#3a3f46'
  ctx.lineWidth = 5 * s
  ctx.beginPath()
  ctx.arc(cx, ringC, ringR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(170, 185, 200, 0.6)'
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.arc(cx, ringC, ringR, Math.PI * 1.1, Math.PI * 1.6)
  ctx.stroke()
  // 外缘一道深色描边，剪影在深蓝里也清楚
  ctx.lineWidth = 3 * s
  ctx.strokeStyle = 'rgba(10, 8, 2, 0.9)'
  ctx.stroke(body)
}

/** 一个气泡：透明的球，边上一圈亮、靠太阳那边一个高光点，靠着色得到颜色 */
export function drawBubble(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const R = size / 2 - 1
  const g = ctx.createRadialGradient(c, c, R * 0.55, c, c, R)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.08)')
  g.addColorStop(0.8, 'rgba(255, 255, 255, 0.45)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0.9)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
  const lx = SUN.x / Math.hypot(SUN.x, SUN.y)
  const ly = SUN.y / Math.hypot(SUN.x, SUN.y)
  const h = ctx.createRadialGradient(c + lx * R * 0.45, c + ly * R * 0.45, 0, c + lx * R * 0.45, c + ly * R * 0.45, R * 0.35)
  h.addColorStop(0, 'rgba(255, 255, 255, 1)')
  h.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = h
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
}

/** 柔和的光团：中间亮、往外淡，叠加着画，灯的光晕、海雪、冷光都用它 */
export function drawHalo(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)')
  g.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/** 海雪的一片：一小团不规则的絮 */
export function drawFlake(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4
    const r = size * (0.12 + 0.05 * Math.sin(i * 1.7))
    const g = ctx.createRadialGradient(c + Math.cos(a) * size * 0.12, c + Math.sin(a) * size * 0.1, 0, c + Math.cos(a) * size * 0.12, c + Math.sin(a) * size * 0.1, r)
    g.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
}
