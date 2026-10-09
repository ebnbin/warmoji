import { SUN } from '../../data/light'
import { deckHeight } from './layout'
import type { Bridge } from './layout'

/** 桥的贴图每格多少像素 */
export const BRIDGE_PPU = 40
/** 一块桥板宽多少格，板缝多宽 */
const PLANK_U = 0.3
const GAP_U = 0.03
/** 栏杆：扶手多粗、立柱多粗、立柱隔多远（格），两头的望柱多粗、柱头的宝珠多大（格） */
const RAIL_U = 0.1
const POST_U = 0.17
const POST_GAP_U = 1.15
const NEWEL_U = 0.24
const CAP_U = 0.26
/** 桥两边的边梁露出多宽，格 */
const BEAM_U = 0.12

const fract = (v: number): number => v - Math.floor(v)
function hash1(a: number, b: number): number {
  return fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453)
}
const rgb = (r: number, g: number, b: number, a = 1): string => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`

/**
 * 木桥从上往下看，贴图的 x 顺着桥面（左头是 −half），y 横着桥面：一块块横铺的桥板，板缝深，木纹顺着板；桥面拱起，朝太阳的那半坡亮、背着的暗；
 * 两边露出边梁，栏杆的扶手搭在一排立柱上，两头是粗一点的望柱，柱头一颗铜宝珠；扶手与立柱的影子落在桥板上。mpu 是一格多少米
 */
export function drawBridge(ctx: CanvasRenderingContext2D, b: Bridge, mpu: number): void {
  const ppu = BRIDGE_PPU
  const W = b.width
  const H = b.half
  const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
  // 太阳在桥的本地坐标里：顺着桥面、横着桥面、朝上
  const sa = (SUN.x * b.ax + SUN.y * b.ay) / sunLen
  const st = (-SUN.x * b.ay + SUN.y * b.ax) / sunLen
  const sz = SUN.z / sunLen
  const px = (a: number): number => (a + H) * ppu
  const py = (t: number): number => (t + W) * ppu
  ctx.clearRect(0, 0, 2 * H * ppu, 2 * W * ppu)
  // 桥板：按桥面在那一处的坡打光
  const n = Math.floor((2 * H) / PLANK_U)
  for (let i = 0; i < n; i++) {
    const a0 = -H + i * PLANK_U
    const a = a0 + PLANK_U / 2
    const slope = (deckHeight(b, a + 0.05) - deckHeight(b, a - 0.05)) / (0.1 * mpu)
    const l = Math.sqrt(slope * slope + 1)
    const lit = Math.max(0, (-slope * sa + sz) / l)
    const tone = 0.86 + 0.18 * hash1(i, 3)
    const k = (0.42 + 0.78 * lit) * tone
    ctx.fillStyle = rgb(176 * k, 128 * k, 86 * k)
    ctx.fillRect(px(a0 + GAP_U / 2), py(-W + BEAM_U * 0.5), (PLANK_U - GAP_U) * ppu, (2 * W - BEAM_U) * ppu)
    // 木纹：顺着板的几道细线
    ctx.strokeStyle = rgb(120 * k, 82 * k, 54 * k, 0.35)
    ctx.lineWidth = 1
    for (let g = 0; g < 3; g++) {
      const ga = a0 + PLANK_U * (0.25 + 0.25 * g + (hash1(i, g + 7) - 0.5) * 0.1)
      ctx.beginPath()
      ctx.moveTo(px(ga), py(-W + BEAM_U))
      ctx.lineTo(px(ga + (hash1(i, g + 11) - 0.5) * 0.04), py(W - BEAM_U))
      ctx.stroke()
    }
  }
  // 边梁：桥面两边各露出一溜深色的梁
  for (const s of [-1, 1]) {
    const k = 0.62 + 0.3 * Math.max(0, s * st)
    ctx.fillStyle = rgb(118 * k, 84 * k, 58 * k)
    ctx.fillRect(px(-H), py(s < 0 ? -W : W - BEAM_U), 2 * H * ppu, BEAM_U * ppu)
  }
  // 栏杆的影子：扶手离桥面 RAIL_M 米高，影子背着太阳挪开
  const railM = 0.7
  const off = (railM * Math.hypot(sa, st)) / Math.max(0.2, sz) / mpu
  const dirA = sa / (Math.hypot(sa, st) || 1)
  const dirT = st / (Math.hypot(sa, st) || 1)
  ctx.fillStyle = 'rgba(40, 24, 16, 0.28)'
  for (const s of [-1, 1]) {
    const t = s * (W - BEAM_U - RAIL_U / 2)
    const tt = t - dirT * off
    if (Math.abs(tt) > W - BEAM_U) continue
    ctx.fillRect(px(-H + 0.3 - dirA * off), py(tt - RAIL_U / 2), (2 * H - 0.6) * ppu, RAIL_U * ppu)
  }
  // 扶手与立柱：圆木，朝太阳的一侧亮
  const posts: number[] = []
  const span = 2 * H - 0.6
  const count = Math.max(2, Math.round(span / POST_GAP_U))
  for (let i = 0; i <= count; i++) posts.push(-H + 0.3 + (span * i) / count)
  for (const s of [-1, 1]) {
    const t = s * (W - BEAM_U - RAIL_U / 2)
    const grd = ctx.createLinearGradient(0, py(t - RAIL_U / 2), 0, py(t + RAIL_U / 2))
    const lo = 0.55 + 0.5 * Math.max(0, -st)
    const hi = 0.55 + 0.5 * Math.max(0, st)
    grd.addColorStop(0, rgb(150 * lo, 104 * lo, 70 * lo))
    grd.addColorStop(1, rgb(150 * hi, 104 * hi, 70 * hi))
    ctx.fillStyle = grd
    ctx.fillRect(px(-H + 0.3), py(t - RAIL_U / 2), span * ppu, RAIL_U * ppu)
    for (const [i, a] of posts.entries()) {
      const end = i === 0 || i === posts.length - 1
      const size = end ? NEWEL_U : POST_U
      const k = 0.7 + 0.2 * hash1(i, s + 5)
      ctx.fillStyle = rgb(132 * k, 92 * k, 62 * k)
      ctx.fillRect(px(a - size / 2), py(t - size / 2), size * ppu, size * ppu)
      if (!end) continue
      // 望柱头上的铜宝珠
      const cx = px(a)
      const cy = py(t)
      const r = (CAP_U / 2) * ppu
      const g2 = ctx.createRadialGradient(cx + sa * r * 0.5, cy + st * r * 0.5, r * 0.1, cx, cy, r)
      g2.addColorStop(0, '#f2d48c')
      g2.addColorStop(0.5, '#b88a3c')
      g2.addColorStop(1, '#6e4f22')
      ctx.fillStyle = g2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
