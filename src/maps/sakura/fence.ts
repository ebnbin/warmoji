import { SUN } from '../../data/light'
import type { Fence } from './layout'

/** 竹栅的贴图每格多少像素 */
export const FENCE_PPU = 48
/** 贴图顺着水流多厚，格：两道横竹与竹桩 */
export const FENCE_DEPTH_U = 0.6
/** 竹桩、横竹多粗（格）；横竹上的竹节隔多远（格）；两道横竹在多高（占栅高的比例） */
export const STAKE_U = 0.17
export const RAIL_U = 0.1
const NODE_U = 0.6
export const RAILS = [0.42, 0.86] as const

/** 竹桩横着竹栅的位置（格，从溪中线量）：从一岸到另一岸每 postU 一根，两边对称 */
export function fenceStakes(f: Fence, postU: number): number[] {
  const n = Math.max(2, Math.round((2 * f.span) / postU))
  return Array.from({ length: n + 1 }, (_, i) => -f.span + (2 * f.span * i) / n)
}

const rgb = (r: number, g: number, b: number): string => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

/**
 * 竹栅从上往下看：贴图的 x 顺着竹栅、朝顺水看的右岸，y 顺着水流（上游在上）。两道横竹一前一后贴着竹桩，一节一节的竹节；
 * 每根竹桩用黑色的棕绳绑在横竹上，桩顶是切开的竹筒，露出中空的一圈；朝太阳的一侧亮。postU 是桩距（格）
 */
export function drawFence(ctx: CanvasRenderingContext2D, f: Fence, postU: number): void {
  const ppu = FENCE_PPU
  const H = FENCE_DEPTH_U
  const px = (u: number): number => (u + f.span) * ppu
  const py = (v: number): number => (v + H / 2) * ppu
  const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
  // 太阳在贴图坐标里：x 顺着竹栅、y 顺着水流
  const lu = (SUN.x * f.ty - SUN.y * f.tx) / sunLen
  const lv = (SUN.x * f.tx + SUN.y * f.ty) / sunLen
  ctx.clearRect(0, 0, 2 * f.span * ppu, H * ppu)
  for (const [k, v] of [
    [0, -0.065],
    [1, 0.065],
  ] as const) {
    const y0 = py(v - RAIL_U / 2)
    const y1 = py(v + RAIL_U / 2)
    const lo = 0.62 + 0.42 * Math.max(0, -lv)
    const hi = 0.62 + 0.42 * Math.max(0, lv)
    const grd = ctx.createLinearGradient(0, y0, 0, y1)
    grd.addColorStop(0, rgb(176 * lo, 164 * lo, 106 * lo))
    grd.addColorStop(0.5, rgb(192, 180, 120))
    grd.addColorStop(1, rgb(176 * hi, 164 * hi, 106 * hi))
    ctx.fillStyle = grd
    ctx.fillRect(px(-f.span), y0, 2 * f.span * ppu, y1 - y0)
    ctx.fillStyle = 'rgba(104, 90, 56, 0.7)'
    for (let u = -f.span + (k ? 0.33 : 0.08); u < f.span; u += NODE_U) ctx.fillRect(px(u), y0, Math.max(1, ppu * 0.03), y1 - y0)
  }
  for (const u of fenceStakes(f, postU)) {
    const cx = px(u)
    const cy = py(0)
    const r = (STAKE_U / 2) * ppu
    ctx.fillStyle = '#3a2c22'
    ctx.fillRect(cx - r * 1.3, py(-0.12), r * 2.6, py(0.12) - py(-0.12))
    const g = ctx.createRadialGradient(cx + lu * r * 0.45, cy + lv * r * 0.45, r * 0.1, cx, cy, r)
    g.addColorStop(0, '#e4d69c')
    g.addColorStop(0.7, '#b8a868')
    g.addColorStop(1, '#7a6c42')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(46, 36, 24, 0.85)'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}
