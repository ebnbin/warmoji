import { SUN } from '../../data/light'

/**
 * 从正上方看的潜水钟，边长 size 的方图，钟口的圈正好顶着图边：黄漆的钢壳，钟口一圈加厚的裙边，壳上一道接缝的箍与一圈螺栓；
 * 顶上吊缆的吊耳、一扇圆舱盖、两只绑在侧面的气瓶、两盏朝下照的灯的灯罩；漆面有磕碰与锈迹。高光按画面的太阳放
 */
export function drawBell(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const R = size / 2 - 1
  const lx = SUN.x / Math.hypot(SUN.x, SUN.y)
  const ly = SUN.y / Math.hypot(SUN.x, SUN.y)
  // 钟口的裙边：比壳宽一圈的深黄
  ctx.fillStyle = '#7a5300'
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
  const rim = ctx.createRadialGradient(c + lx * R * 0.3, c + ly * R * 0.3, R * 0.2, c, c, R)
  rim.addColorStop(0, '#e2a40c')
  rim.addColorStop(0.85, '#b37800')
  rim.addColorStop(1, '#6b4700')
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(c, c, R * 0.97, 0, Math.PI * 2)
  ctx.fill()
  // 壳：穹顶按太阳的方向亮
  const shell = R * 0.82
  const g = ctx.createRadialGradient(c + lx * shell * 0.45, c + ly * shell * 0.45, shell * 0.05, c, c, shell)
  g.addColorStop(0, '#fff3a6')
  g.addColorStop(0.25, '#ffcf2e')
  g.addColorStop(0.7, '#e09a00')
  g.addColorStop(1, '#9c6400')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, shell, 0, Math.PI * 2)
  ctx.fill()
  // 接缝的箍与螺栓
  ctx.strokeStyle = 'rgba(70, 45, 0, 0.7)'
  ctx.lineWidth = size * 0.018
  ctx.beginPath()
  ctx.arc(c, c, shell * 0.62, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    ctx.fillStyle = 'rgba(60, 40, 0, 0.75)'
    ctx.beginPath()
    ctx.arc(c + Math.cos(a) * R * 0.9, c + Math.sin(a) * R * 0.9, size * 0.011, 0, Math.PI * 2)
    ctx.fill()
  }
  // 两只气瓶：灰绿的长筒，绑在壳的一侧
  for (const side of [-1, 1]) {
    const bx = c + side * shell * 0.62
    const by = c + shell * 0.05
    const w = size * 0.075
    const h = size * 0.3
    const bg = ctx.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0)
    bg.addColorStop(0, '#3d4f45')
    bg.addColorStop(0.35, '#7d9686')
    bg.addColorStop(1, '#2d3b33')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(bx - w / 2, by - h / 2, w, h, w / 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(20, 20, 20, 0.6)'
    ctx.fillRect(bx - w / 2, by - h * 0.18, w, size * 0.012)
    ctx.fillRect(bx - w / 2, by + h * 0.18, w, size * 0.012)
  }
  // 两盏灯的灯罩：黑框里一块泛白的玻璃
  for (const side of [-1, 1]) {
    const lxp = c + side * shell * 0.3
    const lyp = c - shell * 0.78
    ctx.fillStyle = '#1d1d1f'
    ctx.beginPath()
    ctx.roundRect(lxp - size * 0.05, lyp - size * 0.03, size * 0.1, size * 0.06, size * 0.015)
    ctx.fill()
    ctx.fillStyle = '#f4f8ff'
    ctx.beginPath()
    ctx.roundRect(lxp - size * 0.038, lyp - size * 0.018, size * 0.076, size * 0.036, size * 0.01)
    ctx.fill()
  }
  // 圆舱盖：偏在一边，带一根铰链
  const hx = c - shell * 0.18
  const hy = c + shell * 0.32
  ctx.fillStyle = '#c98c00'
  ctx.beginPath()
  ctx.arc(hx, hy, shell * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80, 50, 0, 0.8)'
  ctx.lineWidth = size * 0.012
  ctx.stroke()
  ctx.fillStyle = '#4a3a20'
  ctx.fillRect(hx - shell * 0.04, hy - shell * 0.3, shell * 0.08, shell * 0.1)
  // 吊耳：正中一块钢板带一个环
  ctx.fillStyle = '#5b5f66'
  ctx.beginPath()
  ctx.roundRect(c - size * 0.035, c - size * 0.07, size * 0.07, size * 0.14, size * 0.02)
  ctx.fill()
  ctx.strokeStyle = '#2b2d31'
  ctx.lineWidth = size * 0.016
  ctx.beginPath()
  ctx.arc(c, c, size * 0.03, 0, Math.PI * 2)
  ctx.stroke()
  // 漆面的磕碰与几道顺着往下流的锈迹
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996
    const r = shell * (0.35 + 0.6 * ((i * 0.618) % 1))
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    const len = size * (0.04 + 0.08 * ((i * 0.37) % 1))
    const g2 = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len)
    g2.addColorStop(0, 'rgba(120, 62, 18, 0.55)')
    g2.addColorStop(1, 'rgba(120, 62, 18, 0)')
    ctx.strokeStyle = g2
    ctx.lineWidth = size * (0.008 + 0.01 * ((i * 0.71) % 1))
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  // 背光的一侧压暗：钟是个穹顶
  const dark = ctx.createRadialGradient(c - lx * R * 0.35, c - ly * R * 0.35, R * 0.2, c - lx * R * 0.2, c - ly * R * 0.2, R * 1.05)
  dark.addColorStop(0, 'rgba(0, 0, 0, 0)')
  dark.addColorStop(0.7, 'rgba(10, 20, 40, 0.1)')
  dark.addColorStop(1, 'rgba(10, 20, 40, 0.45)')
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
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
