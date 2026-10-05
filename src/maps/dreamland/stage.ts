import { LIFT_PER_M, UNIT } from '../../util/units'
import { AWAY, SUN } from '../../data/light'
import { cornersOf } from './layout'
import type { DreamlandPlan } from './layout'
import type { DreamlandState } from './model'
import type { DreamlandConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 台面的花样：最外一圈奶油色的台沿，里面两种粉色交替的放射条，中间一块金色的八角、一颗星 */
const RIM = 0xfff1d6
const WEDGE_A = 0xffa9cb
const WEDGE_B = 0xffd1e3
const HUB = 0xffdf6e
const STAR = 0xfffdf0
const TRIM = 0xffc94a
/** 裙边：粉白相间的百褶，下沿一道深色的边 */
const SKIRT_A = 0xff7fb0
const SKIRT_B = 0xfff4f8
const HEM = 0xc9578b
/** 栏杆：白的糖果手杖柱子缠着粉色的条，柱头一颗红球 */
const POST = 0xffffff
const STRIPE = 0xff5c9a
const CAP = 0xff3d7f
const RAIL = 0xfff6fb
/** 台沿上的灯泡：暗着、亮着、预警、开着的入口 */
const BULB_OFF = 0xd99ab6
const BULB_ON = 0xfff3a8
const BULB_WARN = 0xff9a3c
const BULB_OPEN = 0x7dffb2
/** 入口前画在台面上的箭头 */
const ARROW = 0xe07aa6
/** 背光的一面往这个颜色偏：粉紫的阴影，糖果色不发灰 */
const SHADE = 0xb48ac6
/** 台沿上每条边几颗灯泡，栏杆的柱子隔多远（格） */
const BULBS = 6
const POST_U = 0.95

const SUN_LEN = Math.hypot(SUN.x, SUN.y, SUN.z)

/** 颜色按明暗 f 调：f < 0 往阴影色偏 −f，f > 0 往白偏 f，都到 1 为止 */
function tone(color: number, f: number): number {
  const to = f < 0 ? SHADE : 0xffffff
  const k = Math.min(1, Math.abs(f))
  const mix = (shift: number): number => {
    const a = (color >> shift) & 0xff
    return Math.round(a + (((to >> shift) & 0xff) - a) * k)
  }
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

/** 画台子用的笔：Phaser 的 Graphics 就是 */
export interface Pen {
  clear(): unknown
  fillStyle(color: number, alpha?: number): unknown
  lineStyle(width: number, color: number, alpha?: number): unknown
  fillPoints(points: Point[], closeShape?: boolean): unknown
  strokePoints(points: Point[], closeShape?: boolean): unknown
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown
  fillCircle(x: number, y: number, r: number): unknown
}

/** 画摇摆台要的三支笔：落在传送带上的影子、台身与台面、栏杆 */
export interface StagePens {
  readonly shade: Pen
  readonly deck: Pen
  readonly fence: Pen
}

/** 一帧里台子的样子：每一点离地多高（米）与画面上抬起后的位置 */
class Lifter {
  constructor(
    private readonly plan: DreamlandPlan,
    private readonly pivot: number,
    private readonly sx: number,
    private readonly sy: number,
  ) {}

  z(x: number, y: number): number {
    return this.pivot - this.sx * (x - this.plan.cx) - this.sy * (y - this.plan.cy)
  }

  /** 台面上 (x, y) 处的一点在画面上的位置：按它离地的高度往上抬 */
  top(x: number, y: number): Point {
    return { x, y: y - this.z(x, y) * LIFT_PER_M }
  }

  /** 台面上 (x, y) 处再往上 h 米的一点 */
  above(x: number, y: number, h: number): Point {
    return { x, y: y - (this.z(x, y) + h) * LIFT_PER_M }
  }
}

/** 正多边形上第 k 条边、离中心 a 像素那一圈上沿边 u 像素的一点 */
function onRing(plan: DreamlandPlan, k: number, a: number, u: number): Point {
  const n = plan.normals[k]!
  const t = plan.tangents[k]!
  return { x: plan.cx + n.x * a + t.x * u, y: plan.cy + n.y * a + t.y * u }
}

/** 一组点的凸包（按画面坐标） */
function hull(points: Point[]): Point[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** 灯泡此刻什么颜色、多亮：平时一圈跑马灯；预警时灯一波波朝要倾向的那条边跑过去、那条边的灯急闪；倾过去时那条边亮橙灯，入口开着时亮绿灯。ang 是灯泡在台沿上的方位角 */
function bulb(plan: DreamlandPlan, s: DreamlandState, k: number, index: number, ang: number, ms: number): { color: number; alpha: number } {
  const op = s.op
  if (op.phase === 'warn' && op.next >= 0) {
    if (k === op.next) return Math.floor(ms / 110) % 2 === 0 ? { color: BULB_WARN, alpha: 1 } : { color: BULB_OFF, alpha: 0.5 }
    const to = plan.rot + (op.next * 2 * Math.PI) / plan.sides
    const away = Math.abs(Math.atan2(Math.sin(ang - to), Math.cos(ang - to))) * 6 + ms / 90
    return away % 3 < 1 ? { color: BULB_WARN, alpha: 0.95 } : { color: BULB_OFF, alpha: 0.45 }
  }
  if ((op.phase === 'tilt' || op.phase === 'hold') && k === op.side) {
    const open = s.gates[k]! >= 1
    return { color: open ? BULB_OPEN : BULB_WARN, alpha: open ? 0.75 + 0.25 * Math.sin(ms / 120) : 1 }
  }
  return (index + Math.floor(ms / 260)) % 3 === 0 ? { color: BULB_ON, alpha: 1 } : { color: BULB_OFF, alpha: 0.55 }
}

/**
 * 画这一帧的摇摆台：台面上每一点按此刻离地的真实高度往上抬，台子一倾，台面在画面上跟着拉长、压扁或歪斜；朝南的几面露出百褶裙边，
 * 贴着地的那条边裙边收没了；台面按朝向太阳的程度明暗；影子按台沿的高度顺着背光的方向铺在传送带上。
 * 台沿一圈栏杆，入口那一段按开到几成沉进台面；灯泡与入口前的箭头按操作员的动作亮
 */
export function drawStage(pens: StagePens, plan: DreamlandPlan, cfg: DreamlandConfig, s: DreamlandState, ms: number, shadowLen: number): void {
  const lift = new Lifter(plan, cfg.pivotM, s.sx, s.sy)
  const a = plan.stage
  const n = plan.sides
  const corners = cornersOf(plan, a)
  const edge = (k: number): [Point, Point] => [corners[(k - 1 + n) % n]!, corners[k]!]

  const shade = pens.shade
  shade.clear()
  const drop = corners.flatMap((c) => {
    const h = lift.z(c.x, c.y) * LIFT_PER_M * shadowLen
    return [c, { x: c.x + AWAY.x * h, y: c.y + AWAY.y * h }]
  })
  shade.fillStyle(0x5b2346, 0.26)
  shade.fillPoints(hull(drop), true)

  const g = pens.deck
  g.clear()
  // 裙边：朝南的边才看得见，一条条百褶从台沿垂到传送带上
  for (let k = 0; k < n; k++) {
    const nk = plan.normals[k]!
    if (nk.y <= 0.02) continue
    const [c0, c1] = edge(k)
    const t0 = lift.top(c0.x, c0.y)
    const t1 = lift.top(c1.x, c1.y)
    if (c0.y - t0.y < 0.5 && c1.y - t1.y < 0.5) continue
    const face = -0.18 - 0.4 * (0.5 - (0.5 * (nk.x * SUN.x + nk.y * SUN.y)) / SUN_LEN)
    const strips = 14
    for (let j = 0; j < strips; j++) {
      const f0 = j / strips
      const f1 = (j + 1) / strips
      const lerp = (p: Point, q: Point, f: number): Point => ({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f })
      g.fillStyle(tone(j % 2 === 0 ? SKIRT_A : SKIRT_B, face), 1)
      g.fillPoints([lerp(t0, t1, f0), lerp(t0, t1, f1), lerp(c0, c1, f1), lerp(c0, c1, f0)], true)
    }
    g.lineStyle(0.08 * UNIT, tone(HEM, face), 1)
    g.lineBetween(c0.x, c0.y, c1.x, c1.y)
  }
  // 台面：法线随坡度偏向低的一侧，朝着太阳偏就亮一点
  const k3 = UNIT / plan.meterPerU
  const nx = s.sx * k3
  const ny = s.sy * k3
  const lambert = (nx * SUN.x + ny * SUN.y + SUN.z) / (Math.hypot(nx, ny, 1) * SUN_LEN)
  const bright = Math.min(0.28, Math.max(-0.32, (lambert - SUN.z / SUN_LEN) * 2.4))
  g.fillStyle(tone(RIM, bright), 1)
  g.fillPoints(corners.map((c) => lift.top(c.x, c.y)), true)
  const outer = a * 0.9
  const inner = a * 0.17
  for (let k = 0; k < n; k++) {
    for (let side = 0; side < 2; side++) {
      const u0 = side === 0 ? -plan.half : 0
      const u1 = side === 0 ? 0 : plan.half
      const pts = [onRing(plan, k, outer, u0 * outer), onRing(plan, k, outer, u1 * outer), onRing(plan, k, inner, u1 * inner), onRing(plan, k, inner, u0 * inner)]
      g.fillStyle(tone((k * 2 + side) % 2 === 0 ? WEDGE_A : WEDGE_B, bright), 1)
      g.fillPoints(pts.map((p) => lift.top(p.x, p.y)), true)
    }
  }
  g.lineStyle(0.07 * UNIT, tone(TRIM, bright), 1)
  g.strokePoints(cornersOf(plan, outer).map((c) => lift.top(c.x, c.y)), true)
  g.fillStyle(tone(HUB, bright), 1)
  g.fillPoints(cornersOf(plan, inner).map((c) => lift.top(c.x, c.y)), true)
  const star: Point[] = []
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5
    const r = (i % 2 === 0 ? 0.78 : 0.34) * inner
    star.push(lift.top(plan.cx + Math.cos(ang) * r, plan.cy + Math.sin(ang) * r))
  }
  g.fillStyle(tone(STAR, bright), 1)
  g.fillPoints(star, true)
  // 入口前的箭头：开着的绿、正倾过去的与预警里的橙，其余淡粉
  for (let k = 0; k < n; k++) {
    const op = s.op
    const open = s.gates[k]! >= 1
    const coming = (op.phase === 'warn' && op.next === k) || ((op.phase === 'tilt' || op.phase === 'hold') && op.side === k)
    const color = open ? BULB_OPEN : coming ? BULB_WARN : ARROW
    const alpha = coming && !open && op.phase === 'warn' ? 0.55 + 0.45 * Math.abs(Math.sin(ms / 140)) : open ? 0.95 : 0.55
    const tip = lift.top(onRing(plan, k, a * 0.86, 0).x, onRing(plan, k, a * 0.86, 0).y)
    const l = onRing(plan, k, a * 0.7, -a * 0.12)
    const r = onRing(plan, k, a * 0.7, a * 0.12)
    g.fillStyle(tone(color, bright), alpha)
    g.fillPoints([tip, lift.top(l.x, l.y), lift.top(r.x, r.y)], true)
  }
  // 台沿上一圈灯泡
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < BULBS; i++) {
      const r = a * 0.955
      const u = (-1 + ((i + 0.5) * 2) / BULBS) * r * plan.half * 0.9
      const p = onRing(plan, k, r, u)
      const q = lift.top(p.x, p.y)
      const b = bulb(plan, s, k, k * BULBS + i, Math.atan2(p.y - plan.cy, p.x - plan.cx), ms)
      g.fillStyle(b.color, b.alpha * 0.35)
      g.fillCircle(q.x, q.y, 0.17 * UNIT)
      g.fillStyle(b.color, b.alpha)
      g.fillCircle(q.x, q.y, 0.085 * UNIT)
    }
  }

  // 栏杆：先画北边的再画南边的；入口那一段的柱子与横杆按开到几成往台面里沉
  const f = pens.fence
  f.clear()
  const order = [...Array(n).keys()].sort((p, q) => plan.normals[p]!.y - plan.normals[q]!.y)
  const H = cfg.fence.heightM
  for (const k of order) {
    const reach = a * plan.half
    const posts = Math.max(2, Math.round((2 * reach) / (POST_U * UNIT)))
    const sink = 1 - s.gates[k]!
    const tops: { p: Point; h: number; door: boolean }[] = []
    for (let i = 0; i <= posts; i++) {
      const u = -reach + (i * 2 * reach) / posts
      const door = Math.abs(u) < plan.door - 1e-6
      const h = door ? H * sink : H
      tops.push({ p: onRing(plan, k, a, u), h, door })
    }
    for (const rail of [0.5, 0.92]) {
      for (let i = 0; i < tops.length - 1; i++) {
        const p = tops[i]!
        const q = tops[i + 1]!
        const h = Math.min(p.h, q.h)
        if (h < 0.05) continue
        const pa = lift.above(p.p.x, p.p.y, h * rail)
        const qa = lift.above(q.p.x, q.p.y, h * rail)
        f.lineStyle(0.07 * UNIT, RAIL, 1)
        f.lineBetween(pa.x, pa.y, qa.x, qa.y)
      }
    }
    for (const t of tops) {
      if (t.h < 0.05) continue
      const base = lift.top(t.p.x, t.p.y)
      const top = lift.above(t.p.x, t.p.y, t.h)
      f.lineStyle(0.13 * UNIT, POST, 1)
      f.lineBetween(base.x, base.y, top.x, top.y)
      for (const at of [0.25, 0.6]) {
        const s0 = base.y + (top.y - base.y) * at
        f.lineStyle(0.13 * UNIT, STRIPE, 1)
        f.lineBetween(base.x, s0, top.x, s0 - 0.07 * UNIT)
      }
      f.fillStyle(t.door ? STRIPE : CAP, 1)
      f.fillCircle(top.x, top.y, 0.1 * UNIT)
    }
  }
}
