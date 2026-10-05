import { LIFT_PER_M, UNIT } from '../../util/units'
import { Rng } from '../../util/rng'
import { AWAY } from '../../data/light'
import { FRAME } from '../frame'
import { cornersOf, gaugeAt } from './layout'
import type { DreamlandPlan } from './layout'
import type { Point } from '../../util/vec'

/** 外圈外沿往外的一圈步道，格 */
export const WALK_U = 1.4
/** 外沿的白栅栏：多高（米）、栅条隔多远（格），乐园大门与城堡大门处留的豁口半宽（格） */
const PICKET_M = 0.9
const PICKET_U = 0.42
const GAP_U = 1.6
/** 四角的游乐设施：摩天轮、旋转茶杯、旋转木马与马戏团帐篷落在哪（格，方框坐标）、多大（格） */
export const RIDES = {
  wheel: { x: 40.6, y: 12.2, r: 4.6 },
  teacups: { x: 8.6, y: 39.4, r: 4.2 },
  carousel: { x: 39.4, y: 39.4, r: 3.8 },
  tent: { x: 7.8, y: 8.2, r: 4.4 },
} as const

const PINK = '#ffd3e6'
const CREAM = '#fff3dc'

/** 世界像素的一点 */
function at(x: number, y: number): Point {
  return { x: x * UNIT, y: y * UNIT }
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly Point[]): void {
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** 落在地上的软影子：顺着背光的方向挪一点 */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, lift: number, alpha: number): void {
  ctx.save()
  ctx.fillStyle = `rgba(110, 40, 90, ${alpha})`
  ctx.beginPath()
  ctx.ellipse(x + AWAY.x * lift, y + AWAY.y * lift, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 糖霜地面：淡粉的底子上一块块更浅、更深的斑，再撒一层彩色的糖针 */
function frosting(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = PINK
  ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h)
  for (let i = 0; i < 140; i++) {
    const x = rng.next() * FRAME.w
    const y = rng.next() * FRAME.h
    const r = (0.8 + rng.next() * 2.4) * UNIT
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const light = rng.next() < 0.5
    g.addColorStop(0, light ? 'rgba(255, 240, 248, 0.5)' : 'rgba(255, 170, 205, 0.28)')
    g.addColorStop(1, 'rgba(255, 220, 235, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const sprinkles = ['#ff5c9a', '#ffd23f', '#5ad1c6', '#9b7bff', '#ffffff', '#ff9a4a']
  ctx.lineCap = 'round'
  for (let i = 0; i < 1400; i++) {
    const x = rng.next() * FRAME.w
    const y = rng.next() * FRAME.h
    const a = rng.next() * Math.PI
    const len = (0.07 + rng.next() * 0.06) * UNIT
    ctx.strokeStyle = sprinkles[Math.floor(rng.next() * sprinkles.length)]!
    ctx.globalAlpha = 0.55 + rng.next() * 0.4
    ctx.lineWidth = 0.05 * UNIT
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len)
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** 外沿外面一圈奶油色的石板步道 */
function walkway(ctx: CanvasRenderingContext2D, plan: DreamlandPlan): void {
  const out = cornersOf(plan, plan.outer + WALK_U * UNIT)
  const inner = cornersOf(plan, plan.outer)
  ctx.save()
  poly(ctx, out)
  ctx.fillStyle = CREAM
  ctx.fill()
  ctx.strokeStyle = '#efd2b4'
  ctx.lineWidth = 0.05 * UNIT
  for (let a = plan.outer + 0.45 * UNIT; a < plan.outer + WALK_U * UNIT; a += 0.45 * UNIT) {
    poly(ctx, cornersOf(plan, a))
    ctx.stroke()
  }
  for (let k = 0; k < plan.sides; k++) {
    const nk = plan.normals[k]!
    const tk = plan.tangents[k]!
    for (let u = -plan.outer * plan.half; u < plan.outer * plan.half; u += 0.7 * UNIT) {
      ctx.beginPath()
      ctx.moveTo(plan.cx + nk.x * plan.outer + tk.x * u, plan.cy + nk.y * plan.outer + tk.y * u)
      ctx.lineTo(plan.cx + nk.x * (plan.outer + WALK_U * UNIT) + tk.x * u, plan.cy + nk.y * (plan.outer + WALK_U * UNIT) + tk.y * u)
      ctx.stroke()
    }
  }
  poly(ctx, inner)
  ctx.strokeStyle = '#e8b9cf'
  ctx.lineWidth = 0.12 * UNIT
  ctx.stroke()
  ctx.restore()
}

/** 外沿上的白栅栏：一根根栅条立起来、顶上一颗粉色的圆头，城堡大门与乐园大门处留着豁口 */
function pickets(ctx: CanvasRenderingContext2D, plan: DreamlandPlan, gaps: readonly Point[]): void {
  const h = PICKET_M * LIFT_PER_M
  const a = plan.outer + 0.08 * UNIT
  const posts: Point[] = []
  for (let k = 0; k < plan.sides; k++) {
    const nk = plan.normals[k]!
    const tk = plan.tangents[k]!
    const reach = a * plan.half
    const n = Math.round((2 * reach) / (PICKET_U * UNIT))
    for (let i = 0; i < n; i++) {
      const u = -reach + ((i + 0.5) * 2 * reach) / n
      const p = { x: plan.cx + nk.x * a + tk.x * u, y: plan.cy + nk.y * a + tk.y * u }
      if (gaps.some((g) => Math.hypot(g.x - p.x, g.y - p.y) < GAP_U * UNIT)) continue
      posts.push(p)
    }
  }
  posts.sort((p, q) => p.y - q.y)
  for (const p of posts) {
    shadow(ctx, p.x, p.y, 0.12 * UNIT, 0.06 * UNIT, h * 0.6, 0.18)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#e7a6c4'
    ctx.lineWidth = 0.03 * UNIT
    ctx.beginPath()
    ctx.roundRect(p.x - 0.07 * UNIT, p.y - h, 0.14 * UNIT, h, 0.05 * UNIT)
    ctx.fill()
    ctx.stroke()
    disc(ctx, p.x, p.y - h, 0.09 * UNIT, '#ff79ad')
  }
}

/** 一棵棒棒糖树：细细的白杆子，顶上一颗打着旋的糖 */
function lollipop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colors: readonly string[]): void {
  const stick = 1.8 * LIFT_PER_M
  shadow(ctx, x, y, r * 0.8, r * 0.4, stick + r, 0.22)
  ctx.strokeStyle = '#fffaf2'
  ctx.lineWidth = 0.14 * UNIT
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y - stick)
  ctx.stroke()
  const cy = y - stick - r * 0.8
  disc(ctx, x, cy, r, colors[0]!)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = colors[1]!
  ctx.lineWidth = r * 0.28
  ctx.beginPath()
  for (let t = 0; t < 1; t += 0.01) {
    const a = t * Math.PI * 6
    const rr = r * t
    const px = x + Math.cos(a) * rr
    const py = cy + Math.sin(a) * rr
    if (t === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2)
  ctx.fill()
}

/** 一簇棉花糖灌木：几团叠在一起的粉云 */
function cottonBush(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, r: number): void {
  shadow(ctx, x, y, r * 1.1, r * 0.55, r * 0.6, 0.2)
  const tones = ['#ffc2dc', '#ffd7e9', '#fbb0d0', '#ffe6f1']
  for (let i = 0; i < 7; i++) {
    const a = rng.next() * Math.PI * 2
    const d = rng.next() * r * 0.55
    disc(ctx, x + Math.cos(a) * d, y - r * 0.4 + Math.sin(a) * d * 0.6, r * (0.45 + rng.next() * 0.25), tones[i % tones.length]!)
  }
  disc(ctx, x - r * 0.2, y - r * 0.65, r * 0.25, 'rgba(255, 255, 255, 0.6)')
}

/** 一顶条纹遮阳伞的摊位：从上往下看是一把分瓣的圆伞 */
function stall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: string, b: string): void {
  const lift = 2.2 * LIFT_PER_M
  shadow(ctx, x, y, r * 1.05, r * 0.6, lift, 0.24)
  ctx.fillStyle = '#f2d4b6'
  ctx.fillRect(x - r * 0.75, y - r * 0.2, r * 1.5, r * 0.55)
  const cy = y - lift * 0.55
  const n = 8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    ctx.fillStyle = i % 2 === 0 ? a : b
    ctx.beginPath()
    ctx.moveTo(x, cy)
    ctx.lineTo(x + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.82)
    ctx.lineTo(x + Math.cos(a1) * r, cy + Math.sin(a1) * r * 0.82)
    ctx.closePath()
    ctx.fill()
  }
  disc(ctx, x, cy, r * 0.12, '#fffaf0')
}

/** 一束气球：系在小车上，彩色的圆一个挨一个 */
function balloonCart(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number): void {
  shadow(ctx, x, y, 0.9 * UNIT, 0.5 * UNIT, 3 * LIFT_PER_M, 0.18)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - 0.5 * UNIT, y - 0.25 * UNIT, 1 * UNIT, 0.5 * UNIT)
  const colors = ['#ff5c9a', '#ffd23f', '#5ad1c6', '#9b7bff', '#ff9a4a', '#7fd6ff']
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = 0.02 * UNIT
  for (let i = 0; i < 9; i++) {
    const bx = x + (rng.next() - 0.5) * 1.6 * UNIT
    const by = y - (2.2 + rng.next() * 1.4) * UNIT
    ctx.beginPath()
    ctx.moveTo(x, y - 0.25 * UNIT)
    ctx.lineTo(bx, by)
    ctx.stroke()
    disc(ctx, bx, by, 0.32 * UNIT, colors[i % colors.length]!)
    disc(ctx, bx - 0.1 * UNIT, by - 0.1 * UNIT, 0.08 * UNIT, 'rgba(255, 255, 255, 0.55)')
  }
}

/** 粉色的童话城堡：一道开着拱门的城墙，左右两座圆塔、中间一座高塔，尖顶上插着三角旗；拱门正对着城堡大门 */
function castle(ctx: CanvasRenderingContext2D, gate: Point): void {
  const base = gate.y - (0.6 + WALK_U + 0.3) * UNIT
  const wallH = 2.1 * UNIT
  const left = gate.x - 7.5 * UNIT
  const right = gate.x + 7.5 * UNIT
  shadow(ctx, gate.x, base, 8 * UNIT, 1.2 * UNIT, 1.2 * UNIT, 0.22)
  ctx.fillStyle = '#ffc1dc'
  ctx.fillRect(left, base - wallH, right - left, wallH)
  ctx.fillStyle = '#ffd8ea'
  for (let x = left; x < right; x += 0.8 * UNIT) ctx.fillRect(x, base - wallH - 0.45 * UNIT, 0.45 * UNIT, 0.5 * UNIT)
  ctx.strokeStyle = '#f39cc4'
  ctx.lineWidth = 0.04 * UNIT
  for (let y = base - wallH + 0.5 * UNIT; y < base; y += 0.5 * UNIT) {
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }
  const tower = (cx: number, w: number, h: number, roof: string): void => {
    ctx.fillStyle = '#ffb3d3'
    ctx.fillRect(cx - w / 2, base - h, w, h)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.fillRect(cx - w / 2, base - h, w * 0.25, h)
    ctx.fillStyle = '#7a4fd1'
    ctx.beginPath()
    ctx.ellipse(cx, base - h * 0.62, w * 0.14, w * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
    const peak = base - h - w * 1.1
    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.62, base - h)
    ctx.lineTo(cx + w * 0.62, base - h)
    ctx.lineTo(cx, peak)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.04 * UNIT
    ctx.beginPath()
    ctx.moveTo(cx, peak)
    ctx.lineTo(cx, peak - 0.5 * UNIT)
    ctx.stroke()
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(cx, peak - 0.5 * UNIT)
    ctx.lineTo(cx + 0.45 * UNIT, peak - 0.38 * UNIT)
    ctx.lineTo(cx, peak - 0.26 * UNIT)
    ctx.closePath()
    ctx.fill()
  }
  tower(left + 0.6 * UNIT, 1.8 * UNIT, 3.1 * UNIT, '#9b7bff')
  tower(right - 0.6 * UNIT, 1.8 * UNIT, 3.1 * UNIT, '#9b7bff')
  tower(gate.x - 3.6 * UNIT, 1.3 * UNIT, 2.8 * UNIT, '#ff79ad')
  tower(gate.x + 3.6 * UNIT, 1.3 * UNIT, 2.8 * UNIT, '#ff79ad')
  tower(gate.x, 2.2 * UNIT, 4 * UNIT, '#7a4fd1')
  ctx.fillStyle = '#5b2a6e'
  ctx.beginPath()
  ctx.moveTo(gate.x - 0.9 * UNIT, base)
  ctx.lineTo(gate.x - 0.9 * UNIT, base - 1 * UNIT)
  ctx.arc(gate.x, base - 1 * UNIT, 0.9 * UNIT, Math.PI, 0)
  ctx.lineTo(gate.x + 0.9 * UNIT, base)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ffd23f'
  ctx.lineWidth = 0.1 * UNIT
  ctx.stroke()
}

/** 城堡大门与乐园大门门前铺着奶油色的路，穿过步道连到外沿 */
function paths(ctx: CanvasRenderingContext2D, gates: { readonly castle: Point; readonly entry: Point }): void {
  ctx.fillStyle = CREAM
  ctx.fillRect(gates.castle.x - 1.1 * UNIT, gates.castle.y - (0.6 + WALK_U + 0.4) * UNIT, 2.2 * UNIT, (WALK_U + 1) * UNIT)
  ctx.fillRect(gates.entry.x - 1.4 * UNIT, gates.entry.y, 2.8 * UNIT, FRAME.h - gates.entry.y)
}

/** 乐园大门：两根糖果柱撑着一道彩虹拱、两边各一座售票亭，门里铺着奶油色的路 */
function entrance(ctx: CanvasRenderingContext2D, gate: Point): void {
  const y = gate.y + (0.6 + WALK_U + 0.5) * UNIT
  const pillar = (x: number): void => {
    shadow(ctx, x, y, 0.4 * UNIT, 0.22 * UNIT, 0.9 * UNIT, 0.2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - 0.24 * UNIT, y - 1.3 * UNIT, 0.48 * UNIT, 1.3 * UNIT)
    ctx.fillStyle = '#ff5c9a'
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 0.24 * UNIT, y - (0.3 + k * 0.4) * UNIT, 0.48 * UNIT, 0.15 * UNIT)
    disc(ctx, x, y - 1.35 * UNIT, 0.3 * UNIT, '#ffd23f')
  }
  pillar(gate.x - 1.8 * UNIT)
  pillar(gate.x + 1.8 * UNIT)
  const bands = ['#ff5c9a', '#ff9a4a', '#ffd23f', '#5ad1c6', '#7fb8ff', '#9b7bff']
  bands.forEach((c, i) => {
    ctx.strokeStyle = c
    ctx.lineWidth = 0.15 * UNIT
    ctx.beginPath()
    ctx.arc(gate.x, y - 1.35 * UNIT, (1.8 - i * 0.14) * UNIT, Math.PI, 0)
    ctx.stroke()
  })
  for (const side of [-1, 1]) {
    const bx = gate.x + side * 4.6 * UNIT
    shadow(ctx, bx, y, 1.2 * UNIT, 0.6 * UNIT, 1 * UNIT, 0.22)
    ctx.fillStyle = '#fff7fb'
    ctx.fillRect(bx - 1 * UNIT, y - 1.2 * UNIT, 2 * UNIT, 1.2 * UNIT)
    ctx.fillStyle = '#7fd6ff'
    ctx.fillRect(bx - 0.6 * UNIT, y - 0.9 * UNIT, 1.2 * UNIT, 0.45 * UNIT)
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 === 0 ? '#ff79ad' : '#ffffff'
      ctx.fillRect(bx - 1.15 * UNIT + k * 0.383 * UNIT, y - 1.7 * UNIT, 0.383 * UNIT, 0.5 * UNIT)
    }
  }
}

/** 一块圆形的设施底座：奶油色的石板一圈圈铺开 */
function plaza(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  disc(ctx, x, y, r, CREAM)
  ctx.strokeStyle = '#efd2b4'
  ctx.lineWidth = 0.05 * UNIT
  for (let rr = r * 0.35; rr < r; rr += 0.5 * UNIT) {
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.strokeStyle = '#ffb3d1'
  ctx.lineWidth = 0.12 * UNIT
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

/** 马戏团的大帐篷：从上往下看是一个红白条纹的圆锥顶，中间一颗金球 */
function tent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  shadow(ctx, x, y, r * 1.05, r * 0.7, 3 * LIFT_PER_M, 0.26)
  const cy = y - 2.4 * LIFT_PER_M
  const n = 14
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    ctx.fillStyle = i % 2 === 0 ? '#ff4f7b' : '#fff6f8'
    ctx.beginPath()
    ctx.moveTo(x, cy - r * 0.18)
    ctx.lineTo(x + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.86)
    ctx.lineTo(x + Math.cos(a1) * r, cy + Math.sin(a1) * r * 0.86)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = '#ffd23f'
  ctx.lineWidth = 0.12 * UNIT
  ctx.beginPath()
  ctx.ellipse(x, cy, r, r * 0.86, 0, 0, Math.PI * 2)
  ctx.stroke()
  disc(ctx, x, cy - r * 0.18, 0.3 * UNIT, '#ffd23f')
}

/** 布景里散着的一样东西：棒棒糖树、棉花糖灌木、摊位或气球车，像素 */
interface Prop {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly kind: number
}

/** 两张布景贴图都要的东西：大门的位置与按种子散开的小布景 */
export interface Park {
  readonly castle: Point
  readonly entry: Point
  readonly props: readonly Prop[]
  readonly seed: number
}

/** 按种子在步道外、设施与两座大门以外的空地上散开小布景，彼此隔开 */
export function parkProps(plan: DreamlandPlan, gates: { readonly castle: Point; readonly entry: Point }, seed: number): Park {
  const rng = new Rng(seed)
  const free = (x: number, y: number, r: number): boolean => {
    if (gaugeAt(plan, x, y) < plan.outer + (WALK_U + 0.3) * UNIT + r) return false
    for (const ride of Object.values(RIDES)) if (Math.hypot(x - ride.x * UNIT, y - ride.y * UNIT) < (ride.r + 1.2) * UNIT + r) return false
    if (Math.abs(x - gates.castle.x) < 9 * UNIT && y < gates.castle.y) return false
    if (Math.abs(x - gates.entry.x) < 6.5 * UNIT && y > gates.entry.y) return false
    return x > r && y > r && x < FRAME.w - r && y < FRAME.h - r
  }
  const props: Prop[] = []
  for (let i = 0; i < 400 && props.length < 46; i++) {
    const x = rng.next() * FRAME.w
    const y = rng.next() * FRAME.h
    const kind = rng.next()
    const r = (kind < 0.45 ? 0.75 : kind < 0.8 ? 0.85 : 0.95) * UNIT
    if (!free(x, y, r) || props.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + r + 0.5 * UNIT)) continue
    props.push({ x, y, r, kind })
  }
  props.sort((p, q) => p.y - q.y)
  return { castle: gates.castle, entry: gates.entry, props, seed }
}

/** 乐园平铺在地上的那一层，画进以方框左上角为原点、每格 ppu 像素的贴图：糖霜地面、外沿外的步道、两座大门门前的路与四角设施的底座；能走的地方由传送带与摇摆台盖住 */
export function paintGround(ctx: CanvasRenderingContext2D, plan: DreamlandPlan, park: Park, ppu: number): void {
  ctx.save()
  ctx.scale(ppu / UNIT, ppu / UNIT)
  frosting(ctx, new Rng(park.seed ^ 0x51))
  walkway(ctx, plan)
  paths(ctx, park)
  for (const r of [RIDES.wheel, RIDES.teacups, RIDES.carousel]) {
    const c = at(r.x, r.y)
    plaza(ctx, c.x, c.y, (r.r + 0.9) * UNIT)
  }
  ctx.restore()
}

/**
 * 乐园立着的布景，画进另一张透明的贴图，盖在传送带之上：外沿的白栅栏（两座大门处留着豁口）、北边的粉色城堡（拱门对着城堡大门）、
 * 南边的乐园大门、马戏团帐篷，散在四周的棒棒糖树、棉花糖灌木、摊位与气球车；会动的设施由画面另画
 */
export function paintStanding(ctx: CanvasRenderingContext2D, plan: DreamlandPlan, park: Park, ppu: number): void {
  const rng = new Rng(park.seed ^ 0x77)
  ctx.save()
  ctx.scale(ppu / UNIT, ppu / UNIT)
  tent(ctx, RIDES.tent.x * UNIT, RIDES.tent.y * UNIT, RIDES.tent.r * UNIT)
  castle(ctx, park.castle)
  const pops: readonly (readonly string[])[] = [['#ff79ad', '#fff3f8'], ['#ffd23f', '#ff9a4a'], ['#5ad1c6', '#e9fffb'], ['#9b7bff', '#f3eeff']]
  const stalls: readonly [string, string][] = [['#ff79ad', '#fff3f8'], ['#5ad1c6', '#fff6e9'], ['#ffd23f', '#ff7a59']]
  for (const s of park.props) {
    if (s.kind < 0.45) lollipop(ctx, s.x, s.y, s.r * 0.75, pops[Math.floor(rng.next() * pops.length)]!)
    else if (s.kind < 0.8) cottonBush(ctx, rng, s.x, s.y, s.r)
    else if (s.kind < 0.93) {
      const c = stalls[Math.floor(rng.next() * stalls.length)]!
      stall(ctx, s.x, s.y, s.r * 1.1, c[0], c[1])
    } else balloonCart(ctx, rng, s.x, s.y)
  }
  pickets(ctx, plan, [park.castle, park.entry])
  entrance(ctx, park.entry)
  ctx.restore()
}
