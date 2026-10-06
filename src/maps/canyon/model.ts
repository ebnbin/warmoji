import { UNIT } from '../../util/units'
import { mesaAt, navStep } from './layout'
import type { CanyonPlan, Span } from './layout'
import type { CanyonConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 一座桥此刻：完好（up）、断了（down）、正重新拉绳（rebuild），从 since 毫秒起 */
export type BridgePhase = 'up' | 'down' | 'rebuild'

/** 桥上站着的一个身体：在桥上的位置（0 到 1，从 a 到 b）与重量（公斤） */
export interface Load {
  readonly t: number
  readonly kg: number
}

/** 一座桥：几何（像素，桥面从 a 搭到 b，u 顺着桥、n 是桥面的左手边），上限，此刻的阶段、载重与超载了多久；断过几次，最近一次断在哪 */
export interface Bridge {
  readonly span: Span
  readonly ax: number
  readonly ay: number
  readonly len: number
  readonly ux: number
  readonly uy: number
  readonly nx: number
  readonly ny: number
  readonly half: number
  readonly cap: number
  phase: BridgePhase
  since: number
  kg: number
  loads: Load[]
  strain: number
  breaks: number
  snapT: number
}

/** 身体的处境：在台面或桥上（TOP），正往下掉（FALLING），在谷底（DOWN），正顺着绳梯往上爬（CLIMBING） */
export const TOP = 0
export const FALLING = 1
export const DOWN = 2
export const CLIMBING = 3
export type Mode = typeof TOP | typeof FALLING | typeof DOWN | typeof CLIMBING

/**
 * 一个身体的处境：uid 认实体；mode 与它从 at 毫秒起、要 ms 毫秒；掉与爬都是从 (fx, fy) 到 (tx, ty)，爬时 climb 是第几根绳梯
 */
export interface Footing {
  uid: number
  mode: Mode
  at: number
  ms: number
  fx: number
  fy: number
  tx: number
  ty: number
  climb: number
}

/** 给画面的事：一座桥崩断、一个身体掉下去、摔到谷底、一枚金币掉进谷里、一个身体爬上了台 */
export type CanyonEvent =
  | { readonly kind: 'snap'; readonly bridge: number; readonly at: number }
  | { readonly kind: 'fall' | 'land' | 'coin' | 'climbed'; readonly x: number; readonly y: number; readonly r: number; readonly at: number }

/** 一局的峡谷此刻：摆法、每座桥、每个身体的处境、谷底哪几格是河，以及还没交给画面的事 */
export interface CanyonState {
  readonly plan: CanyonPlan
  readonly bridges: Bridge[]
  readonly feet: Map<number, Footing>
  readonly river: Uint8Array
  readonly events: CanyonEvent[]
}

/** 桥面往两头的台面里多伸这么多，格：台沿弯进去的地方桥头也踩得到 */
const DECK_IN_U = 0.6

export function makeBridges(plan: CanyonPlan, cfg: CanyonConfig): Bridge[] {
  return plan.spans.map((s) => {
    const ax = s.ax * UNIT
    const ay = s.ay * UNIT
    const dx = s.bx * UNIT - ax
    const dy = s.by * UNIT - ay
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    return { span: s, ax, ay, len, ux, uy, nx: -uy, ny: ux, half: (cfg.bridge.widthU / 2) * UNIT, cap: cfg.bridge.kinds[s.kind]!.capKg, phase: 'up', since: 0, kg: 0, loads: [], strain: 0, breaks: 0, snapT: 0.5 }
  })
}

/** 谷底每格是不是河：离河的中线不到那一点的半宽 */
export function riverCells(plan: CanyonPlan): Uint8Array {
  const f = plan.floor
  const out = new Uint8Array(f.cols * f.rows)
  const { pts, half } = plan.river
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k]! * UNIT
    const ay = pts[k + 1]! * UNIT
    const bx = pts[k + 2]! * UNIT
    const by = pts[k + 3]! * UNIT
    const h = half[k / 2]! * UNIT
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - h - f.x0) / f.cell))
    const i1 = Math.min(f.cols - 1, Math.floor((Math.max(ax, bx) + h - f.x0) / f.cell))
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - h - f.y0) / f.cell))
    const j1 = Math.min(f.rows - 1, Math.floor((Math.max(ay, by) + h - f.y0) / f.cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = f.x0 + (i + 0.5) * f.cell
        const y = f.y0 + (j + 0.5) * f.cell
        const dx = bx - ax
        const dy = by - ay
        const l2 = dx * dx + dy * dy
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
        if (Math.hypot(x - ax - dx * t, y - ay - dy * t) < h) out[j * f.cols + i] = 1
      }
    }
  }
  return out
}

/** (x, y) 像素处在谷底的河里吗 */
export function inRiver(s: CanyonState, x: number, y: number): boolean {
  const f = s.plan.floor
  const i = Math.floor((x - f.x0) / f.cell)
  const j = Math.floor((y - f.y0) / f.cell)
  return i >= 0 && j >= 0 && i < f.cols && j < f.rows && s.river[j * f.cols + i] === 1
}

/** (x, y) 像素处落在第几座台上，不在台上是 −1 */
export function mesaOf(s: CanyonState, x: number, y: number): number {
  return mesaAt(s.plan.mesas, x / UNIT, y / UNIT)
}

/** (x, y) 像素在桥 b 的桥面坐标：顺着桥从 a 量起的比例 t，离中线的横偏（像素，左手边为正） */
export function deckCoord(b: Bridge, x: number, y: number): { t: number; off: number } {
  const px = x - b.ax
  const py = y - b.ay
  return { t: (px * b.ux + py * b.uy) / b.len, off: px * b.nx + py * b.ny }
}

/** (x, y) 像素处踩着的那座完好的桥（不在台面上才算），没有是 −1 */
export function deckAt(s: CanyonState, x: number, y: number): number {
  const ext = DECK_IN_U * UNIT
  for (let j = 0; j < s.bridges.length; j++) {
    const b = s.bridges[j]!
    if (b.phase !== 'up') continue
    const c = deckCoord(b, x, y)
    if (c.t * b.len < -ext || c.t * b.len > b.len + ext || Math.abs(c.off) > b.half) continue
    return j
  }
  return -1
}

/** (x, y) 像素脚下有东西撑着：台面或完好的桥面 */
export function supported(s: CanyonState, x: number, y: number): boolean {
  return mesaOf(s, x, y) >= 0 || deckAt(s, x, y) >= 0
}

/** 桥面在 t 处垂下多少，米：空桥按抛物线垂 sagM，每个身体按它在桥上的位置像绷着的绳子一样把桥往下压，压满上限再多垂 loadSagM */
export function sagAt(b: Bridge, cfg: CanyonConfig, t: number): number {
  const tt = Math.min(1, Math.max(0, t))
  let z = cfg.bridge.sagM * 4 * tt * (1 - tt)
  for (const l of b.loads) {
    const g = tt < l.t ? tt * (1 - l.t) : l.t * (1 - tt)
    z += cfg.bridge.loadSagM * (l.kg / b.cap) * 4 * g
  }
  return z
}

/** 谷底 (x, y) 像素处离绳梯脚下最近的那条路的方向，没有路是 null */
export function towardClimb(s: CanyonState, x: number, y: number): { x: number; y: number; climb: number } | null {
  return navStep(s.plan, x, y)
}

/** 掉下去落在谷底的哪：先试正下方（透视里往画面下方推一个崖高），被别的台挡着就落在台沿外边，再不行挪到最近的谷底 */
export function landingOf(s: CanyonState, x: number, y: number, vx: number, vy: number, radius: number): Point {
  const f = s.plan.floor
  const drop = s.plan.depth * UNIT
  const room = (px: number, py: number): number => {
    const i = Math.floor((px - f.x0) / f.cell)
    const j = Math.floor((py - f.y0) / f.cell)
    if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return -Infinity
    return f.room[j * f.cols + i]!
  }
  const need = Math.min(radius, 0.35 * UNIT)
  const drift = 0.18
  for (const k of [1, 0.6, 0]) {
    const px = x + vx * drift
    const py = y + vy * drift + drop * k
    if (room(px, py) >= need) return { x: px, y: py }
  }
  // 往外一圈圈找最近的谷底
  for (let r = 0.25 * UNIT; r <= 6 * UNIT; r += 0.25 * UNIT) {
    const n = Math.ceil((r * Math.PI * 2) / (0.25 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const py = y + drop * 0.5 + Math.sin(a) * r
      if (room(px, py) >= need) return { x: px, y: py }
    }
  }
  return { x, y: y + drop }
}
