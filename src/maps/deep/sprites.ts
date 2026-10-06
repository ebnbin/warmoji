import { SUN } from '../../data/light'
import type { Shell } from './bell'

/** 潜水钟贴图在潜水钟坐标里框住的范围（格）：左上角 (u0, v0)，宽 w 高 h；v 朝下是钟口那一侧 */
export interface BellFrame {
  readonly u0: number
  readonly v0: number
  readonly w: number
  readonly h: number
}

/** 钟身的贴图框：外翻的钟唇与描边都在里面 */
export function bellFrame(h: Shell): BellFrame {
  const e = h.r + 0.2
  return { u0: -e, v0: -e, w: 2 * e, h: 2 * e }
}

/** 钟口那团空气的贴图框：从钟口往外鼓出来的一截 */
export function mouthFrame(h: Shell): BellFrame {
  return { u0: -1, v0: h.r - 0.45, w: 2, h: 1.25 }
}

/** 落在沙上的影子的贴图框：钟身往外留出一圈晕开的地方 */
export function shadowFrame(h: Shell): BellFrame {
  const e = h.r + 0.8
  return { u0: -e, v0: -e, w: 2 * e, h: 2 * e }
}

/** 水面上那条船投到沙上的影子：船长、船宽（格），船头朝 u 的正向 */
export const BOAT = { lengthU: 9, beamU: 3.2 } as const

export function boatFrame(): BellFrame {
  const pad = 0.8
  return { u0: -BOAT.lengthU / 2 - pad, v0: -BOAT.beamU / 2 - pad, w: BOAT.lengthU + pad * 2, h: BOAT.beamU + pad * 2 }
}

/** 在框 f 里按每格 ppu 像素画：返回潜水钟坐标到画布像素的换算 */
function mapper(f: BellFrame, ppu: number): { x: (u: number) => number; y: (v: number) => number; k: number } {
  return { x: (u) => (u - f.u0) * ppu, y: (v) => (v - f.v0) * ppu, k: ppu }
}

/** 按序号取的伪随机数，落在 [0, 1)：贴图每次画得一样 */
const rand = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 钟口在钟唇上缺开多大，弧度的一半 */
const MOUTH_HALF = 0.55

/**
 * 从正上方看的潜水钟，钟口那一侧朝下，按每格 ppu 像素画在框 f 里：铸铜的钟身，外圈一道外翻的厚钟唇、一圈铆钉，唇上一块块铜绿和白色的藤壶；
 * 往里是拱起的钟顶，两道加强箍，肩上三扇圆窗；顶心一只吊环，缆绳从这里挂上去。钟口那一侧的钟唇缺开一道口子，口子里透出钟里那团空气的银光。
 * 明暗只按钟顶的拱：顶亮、往外暗，迎着太阳的那一抹高光另画、不跟着钟转
 */
export function drawBell(ctx: CanvasRenderingContext2D, h: Shell, f: BellFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const k = ppu
  const r = h.r
  const cx = m.x(0)
  const cy = m.y(0)
  const mouth = Math.PI / 2
  // 钟唇：一圈外翻的厚边
  const lip = ctx.createRadialGradient(cx, cy, r * 0.72 * k, cx, cy, r * k)
  lip.addColorStop(0, '#6b3c19')
  lip.addColorStop(0.35, '#b8773a')
  lip.addColorStop(0.7, '#9a5d2a')
  lip.addColorStop(1, '#4a2810')
  ctx.fillStyle = lip
  ctx.beginPath()
  ctx.arc(cx, cy, r * k, 0, Math.PI * 2)
  ctx.fill()
  // 钟顶：拱起来，顶心最亮
  const dome = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.76 * k)
  dome.addColorStop(0, '#e2a865')
  dome.addColorStop(0.45, '#c3843f')
  dome.addColorStop(0.85, '#8e5324')
  dome.addColorStop(1, '#5a3214')
  ctx.fillStyle = dome
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.76 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r * k, 0, Math.PI * 2)
  ctx.clip()
  // 铜绿：一块块青绿的锈斑，钟唇上多
  for (let i = 0; i < 26; i++) {
    const a = rand(i) * Math.PI * 2
    const d = r * (0.35 + 0.62 * Math.sqrt(rand(i + 40)))
    const s = (0.12 + 0.22 * rand(i + 80)) * k
    const g = ctx.createRadialGradient(cx + Math.cos(a) * d * k, cy + Math.sin(a) * d * k, 0, cx + Math.cos(a) * d * k, cy + Math.sin(a) * d * k, s)
    g.addColorStop(0, 'rgba(88, 178, 156, 0.7)')
    g.addColorStop(0.6, 'rgba(70, 150, 130, 0.35)')
    g.addColorStop(1, 'rgba(70, 150, 130, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, f.w * k, f.h * k)
  }
  ctx.restore()
  // 钟顶与钟唇交界、两道加强箍
  ctx.lineWidth = 0.05 * k
  for (const [rr, a] of [
    [0.76, 0.75],
    [0.52, 0.45],
    [0.3, 0.4],
  ] as const) {
    ctx.strokeStyle = `rgba(50, 25, 8, ${a})`
    ctx.beginPath()
    ctx.arc(cx, cy, rr * r * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 214, 160, ${a * 0.45})`
    ctx.lineWidth = 0.025 * k
    ctx.beginPath()
    ctx.arc(cx, cy, (rr * r - 0.035) * k, Math.PI * 1.05, Math.PI * 1.6)
    ctx.stroke()
    ctx.lineWidth = 0.05 * k
  }
  // 钟唇上的一圈铆钉与几只藤壶
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - mouth), Math.cos(a - mouth))) < MOUTH_HALF + 0.1) continue
    const x = cx + Math.cos(a) * r * 0.87 * k
    const y = cy + Math.sin(a) * r * 0.87 * k
    ctx.fillStyle = 'rgba(40, 20, 6, 0.65)'
    ctx.beginPath()
    ctx.arc(x + 0.012 * k, y + 0.012 * k, 0.035 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d99a5a'
    ctx.beginPath()
    ctx.arc(x, y, 0.028 * k, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(i + 200) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - mouth), Math.cos(a - mouth))) < MOUTH_HALF + 0.15) continue
    const d = r * (0.8 + 0.16 * rand(i + 230))
    const s = (0.04 + 0.04 * rand(i + 260)) * k
    const x = cx + Math.cos(a) * d * k
    const y = cy + Math.sin(a) * d * k
    ctx.fillStyle = 'rgba(236, 232, 214, 0.9)'
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(90, 80, 60, 0.8)'
    ctx.beginPath()
    ctx.arc(x, y, s * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 肩上三扇圆窗：避开钟口那一侧
  for (const a of [mouth + Math.PI, mouth + Math.PI * 0.42, mouth - Math.PI * 0.42]) {
    const x = cx + Math.cos(a) * r * 0.64 * k
    const y = cy + Math.sin(a) * r * 0.64 * k
    ctx.fillStyle = '#3d2410'
    ctx.beginPath()
    ctx.arc(x, y, 0.2 * k, 0, Math.PI * 2)
    ctx.fill()
    const glass = ctx.createRadialGradient(x - 0.04 * k, y - 0.05 * k, 0.01 * k, x, y, 0.15 * k)
    glass.addColorStop(0, '#d8fff6')
    glass.addColorStop(0.4, '#5fb8b0')
    glass.addColorStop(1, '#0f3a3c')
    ctx.fillStyle = glass
    ctx.beginPath()
    ctx.arc(x, y, 0.15 * k, 0, Math.PI * 2)
    ctx.fill()
  }
  // 钟口：钟唇缺开一道口子，口子里是钟底下那团空气的银光
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r * k + 1, mouth - MOUTH_HALF, mouth + MOUTH_HALF)
  ctx.arc(cx, cy, r * 0.74 * k, mouth + MOUTH_HALF, mouth - MOUTH_HALF, true)
  ctx.closePath()
  ctx.clip()
  const hole = ctx.createRadialGradient(cx, cy, r * 0.74 * k, cx, cy, r * k)
  hole.addColorStop(0, '#16302f')
  hole.addColorStop(0.55, '#2e6b68')
  hole.addColorStop(1, '#bff3ee')
  ctx.fillStyle = hole
  ctx.fillRect(0, 0, f.w * k, f.h * k)
  ctx.restore()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(40, 20, 6, 0.9)'
  ctx.lineWidth = 0.05 * k
  for (const s of [-1, 1]) {
    const a = mouth + s * MOUTH_HALF
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r * 0.74 * k, cy + Math.sin(a) * r * 0.74 * k)
    ctx.lineTo(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k)
    ctx.stroke()
  }
  // 顶心的吊环与卸扣
  ctx.fillStyle = '#5a3214'
  ctx.beginPath()
  ctx.arc(cx, cy, 0.22 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3a3f44'
  ctx.lineWidth = 0.08 * k
  ctx.beginPath()
  ctx.ellipse(cx, cy, 0.2 * k, 0.12 * k, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#a7b0b6'
  ctx.lineWidth = 0.035 * k
  ctx.beginPath()
  ctx.ellipse(cx, cy, 0.2 * k, 0.12 * k, 0, Math.PI * 1.1, Math.PI * 1.7)
  ctx.stroke()
  // 外缘一道深色描边
  ctx.strokeStyle = 'rgba(30, 14, 4, 0.92)'
  ctx.lineWidth = 0.05 * k
  ctx.beginPath()
  ctx.arc(cx, cy, r * k, mouth + MOUTH_HALF, mouth - MOUTH_HALF + Math.PI * 2)
  ctx.stroke()
}

/** 钟顶迎着太阳的那一抹高光：叠加着画、不跟着钟转，size 见方，圆的半径是一半 */
export function drawSheen(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const l = Math.hypot(SUN.x, SUN.y)
  const hx = c + (SUN.x / l) * c * 0.38
  const hy = c + (SUN.y / l) * c * 0.38
  const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, c * 0.75)
  g.addColorStop(0, 'rgba(255, 238, 200, 0.85)')
  g.addColorStop(0.35, 'rgba(255, 220, 170, 0.3)')
  g.addColorStop(1, 'rgba(255, 220, 170, 0)')
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, c * 0.98, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}

/** 钟口外那团空气：从钟口鼓出来的半个气泡，边上一圈银亮、中间透明，按每格 ppu 像素画在框 f 里 */
export function drawMouth(ctx: CanvasRenderingContext2D, h: Shell, f: BellFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const k = ppu
  const cx = m.x(0)
  const cy = m.y(h.r - 0.12)
  const w = 0.82
  const d = 0.62
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * k, d * k, 0, 0, Math.PI)
  ctx.closePath()
  ctx.clip()
  const g = ctx.createRadialGradient(cx, cy, 0.1 * k, cx, cy, w * k)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.05)')
  g.addColorStop(0.7, 'rgba(225, 252, 255, 0.28)')
  g.addColorStop(1, 'rgba(240, 255, 255, 0.85)')
  ctx.fillStyle = g
  ctx.setTransform(1, 0, 0, d / w, 0, cy * (1 - d / w))
  ctx.fillRect(0, 0, f.w * k, (f.h * k * w) / d)
  ctx.restore()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 0.035 * k
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * 0.78 * k, d * 0.72 * k, 0, Math.PI * 0.15, Math.PI * 0.45)
  ctx.stroke()
}

/** 用柔边的剪影画影子：把形状挪到画布外，只留它晕开的影子落在画布上 */
function softShadow(ctx: CanvasRenderingContext2D, width: number, blur: number, path: Path2D): void {
  const far = width * 2
  ctx.save()
  ctx.translate(-far, 0)
  ctx.shadowColor = 'rgba(0, 0, 0, 1)'
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = far
  ctx.fillStyle = '#000'
  ctx.fill(path)
  ctx.restore()
}

/** 钟身落在沙上的影子：圆形的剪影往外晕开，按每格 ppu 像素画在框 f 里 */
export function drawBellShadow(ctx: CanvasRenderingContext2D, h: Shell, f: BellFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const p = new Path2D()
  p.arc(m.x(0), m.y(0), h.r * ppu, 0, Math.PI * 2)
  softShadow(ctx, f.w * ppu, 0.4 * ppu, p)
}

/** 水面上那条船的影子：尖船头、圆船尾的船身，两侧伸出的一对舷外浮杆，按每格 ppu 像素画在框 f 里，晕得很开 */
export function drawBoatShadow(ctx: CanvasRenderingContext2D, f: BellFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const L = BOAT.lengthU / 2
  const B = BOAT.beamU / 2
  const p = new Path2D()
  p.moveTo(m.x(L), m.y(0))
  p.bezierCurveTo(m.x(L * 0.55), m.y(-B * 0.95), m.x(-L * 0.6), m.y(-B), m.x(-L), m.y(-B * 0.62))
  p.lineTo(m.x(-L), m.y(B * 0.62))
  p.bezierCurveTo(m.x(-L * 0.6), m.y(B), m.x(L * 0.55), m.y(B * 0.95), m.x(L), m.y(0))
  p.closePath()
  for (const s of [-1, 1]) {
    p.rect(m.x(-0.25), m.y(s > 0 ? B * 0.6 : -B - 0.45), 0.5 * ppu, (B * 0.4 + 0.45) * ppu)
  }
  softShadow(ctx, f.w * ppu, 0.3 * ppu, p)
}

/** 一条小鱼的影子：纺锤形的身子、叉开的尾巴，头朝右，size 见方 */
export function drawFish(ctx: CanvasRenderingContext2D, size: number): void {
  const p = new Path2D()
  const s = size
  p.ellipse(s * 0.55, s * 0.5, s * 0.3, s * 0.11, 0, 0, Math.PI * 2)
  p.moveTo(s * 0.3, s * 0.5)
  p.lineTo(s * 0.1, s * 0.34)
  p.lineTo(s * 0.16, s * 0.5)
  p.lineTo(s * 0.1, s * 0.66)
  p.closePath()
  softShadow(ctx, s, s * 0.05, p)
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

/** 水里悬着的一粒微尘：中间亮、往外淡的小光点 */
export function drawMote(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.35, 'rgba(255, 255, 255, 0.5)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}
