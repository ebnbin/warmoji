import type { LandmarkShape } from './landmarks'

/** 树冠与杆头的贴图每格多少像素 */
export const CANOPY_PPU = 40

/** 贴图的边长（像素）：标志物伸出去多远再留一点 */
export function canopySize(sh: LandmarkShape): number {
  return Math.ceil((sh.reach + 0.3) * 2 * CANOPY_PPU)
}

/** 一段从 (x0, y0) 粗 w0 到 (x1, y1) 粗 w1 的枝：两头圆、中间按粗细收 */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  ctx.beginPath()
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0)
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1)
  ctx.arc(x1, y1, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx))
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0)
  ctx.arc(x0, y0, w0, Math.atan2(-ny, -nx), Math.atan2(ny, nx))
  ctx.closePath()
  ctx.fill()
}

/**
 * 从上往下看的枯树与路标杆：高处的枝干按高低一层层叠，越高越被晒得发白；每段枝朝太阳的一侧描一道亮边，背光的一侧压一道暗边。
 * 树干在树冠底下只露出一个点；杆子从上往下看只有杆头。light 是朝太阳的水平方向
 */
export function drawCanopy(ctx: CanvasRenderingContext2D, sh: LandmarkShape, size: number, light: { x: number; y: number }): void {
  const c = size / 2
  const k = CANOPY_PPU
  const ll = Math.hypot(light.x, light.y) || 1
  const lx = light.x / ll
  const ly = light.y / ll
  ctx.clearRect(0, 0, size, size)
  const high = sh.limbs.filter((l) => l.z0 > 0.3 || l.z1 > 0.3).sort((a, b) => a.z0 + a.z1 - (b.z0 + b.z1))
  for (const l of high) {
    const z = (l.z0 + l.z1) / 2
    const bleach = Math.min(1, z / Math.max(0.5, sh.top))
    const w0 = l.r0 * k
    const w1 = l.r1 * k
    const x0 = c + l.x0 * k
    const y0 = c + l.y0 * k
    const x1 = c + l.x1 * k
    const y1 = c + l.y1 * k
    const r = Math.round(58 + 50 * bleach)
    const g = Math.round(45 + 40 * bleach)
    const b = Math.round(36 + 32 * bleach)
    ctx.fillStyle = `rgb(${r - 22},${g - 18},${b - 14})`
    limb(ctx, x0 - lx * w0 * 0.25, y0 - ly * w0 * 0.25, x1 - lx * w1 * 0.25, y1 - ly * w1 * 0.25, w0, w1)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    limb(ctx, x0, y0, x1, y1, w0 * 0.85, w1 * 0.85)
    ctx.fillStyle = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 58)},${Math.min(255, b + 44)},0.8)`
    limb(ctx, x0 + lx * w0 * 0.38, y0 + ly * w0 * 0.38, x1 + lx * w1 * 0.38, y1 + ly * w1 * 0.38, w0 * 0.32, w1 * 0.32)
  }
  if (sh.kind === 'post') {
    const pole = sh.limbs[0]!
    const x = c + pole.x1 * k
    const y = c + pole.y1 * k
    const w = pole.r1 * k * 1.15
    ctx.fillStyle = 'rgb(52,40,30)'
    ctx.beginPath()
    ctx.arc(x, y, w, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(150,120,90,0.9)'
    ctx.beginPath()
    ctx.arc(x + lx * w * 0.35, y + ly * w * 0.35, w * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}
