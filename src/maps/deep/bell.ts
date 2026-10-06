import { UNIT } from '../../util/units.ts'
import { roomAt } from '../basin.ts'
import type { DeepPlan } from './layout'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 潜水钟的一段：down 坐在沙底上，warn 吊走前的预兆（钟口还换得上气），rise 被吊离沙底，cruise 吊在水面上挪过去，settle 往下放 */
export type BellPhase = 'down' | 'warn' | 'rise' | 'cruise' | 'settle'

/** 潜水钟坐的地方：钟心在沙底上的位置（像素），朝向（弧度）；钟口开在朝向往画面上顺时针转 90° 的那一侧 */
export interface Pose {
  x: number
  y: number
  a: number
}

/** 潜水钟：此刻在哪一段、坐在哪，钟底离沙底多高（米）；这一段从哪挪到哪，从几时开始、要多久（毫秒）；下一次吊走几时开始预兆；吊走过几次 */
export interface Bell extends Pose {
  phase: BellPhase
  h: number
  readonly from: Pose
  readonly to: Pose
  at: number
  span: number
  next: number
  moves: number
}

type BellCfg = DeepConfig['bell']

/** 钟身在潜水钟自己的坐标里的形状（格）：u 横着，v 朝钟口；从上往下看是半径 r 的圆，钟口在 v = r 那一点的钟壁上 */
export interface Shell {
  readonly r: number
}

export function shellOf(cfg: BellCfg): Shell {
  return { r: cfg.radiusU }
}

/** 潜水钟坐标里一点离钟壁多远（格，钟身里为负） */
export function shellSd(h: Shell, u: number, v: number): number {
  return Math.hypot(u, v) - h.r
}

/** 世界里的 (x, y)（像素）在坐在 p 的潜水钟自己的坐标里（格） */
export function toShell(p: Pose, x: number, y: number, out: { u: number; v: number }): { u: number; v: number } {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  const dx = (x - p.x) / UNIT
  const dy = (y - p.y) / UNIT
  out.u = dx * c + dy * s
  out.v = -dx * s + dy * c
  return out
}

/** 潜水钟坐标里的 (u, v)（格）在世界里的位置（像素） */
export function fromShell(p: Pose, u: number, v: number): Point {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  return { x: p.x + (u * c - v * s) * UNIT, y: p.y + (u * s + v * c) * UNIT }
}

const Q = { u: 0, v: 0 }

/** 坐在 p 的潜水钟，(x, y) 离钟壁多远（像素，钟身里为负） */
export function shellGap(h: Shell, p: Pose, x: number, y: number): number {
  return Math.hypot(x - p.x, y - p.y) - h.r * UNIT
}

/** 钟口那一片半圆的中间：钟口前 doorU 的一半处（像素），箭头指它 */
export function doorMid(h: Shell, cfg: BellCfg, p: Pose): Point {
  return fromShell(p, 0, h.r + cfg.doorU / 2)
}

/** (x, y) 在不在坐在 p 的潜水钟钟口那一片半圆里：圆心是钟口，半径 doorU 格，只算钟口外面那一半 */
export function atDoor(h: Shell, cfg: BellCfg, p: Pose, x: number, y: number): boolean {
  toShell(p, x, y, Q)
  return Q.v > h.r && Math.hypot(Q.u, Q.v - h.r) <= cfg.doorU
}

/** 把一点收进钟口那一片半圆里、离半圆的边与钟口那条线各留 margin 格：队员的坑位落在外面时往里挪 */
export function intoDoor(h: Shell, cfg: BellCfg, p: Pose, at: Point, margin: number): Point {
  toShell(p, at.x, at.y, Q)
  const du = Q.u
  const dv = Math.max(Q.v - h.r, margin)
  const d = Math.hypot(du, dv)
  const k = d > cfg.doorU - margin ? (cfg.doorU - margin) / d : 1
  return fromShell(p, du * k, h.r + dv * k)
}

/** 钟此刻坐在沙底上、钟口换不换得上气：坐着与预兆时换得上，吊起来钟里的空气就跑光了 */
export function breathable(s: Bell): boolean {
  return s.phase === 'down' || s.phase === 'warn'
}

/** 半径 radius（像素）的身体挡在钟壁外：压进钟身就顺着钟心往外推出来；正压在钟心上时往钟口推 */
export function outOfShell(h: Shell, p: Pose, x: number, y: number, radius: number): Point {
  const dx = x - p.x
  const dy = y - p.y
  const d = Math.hypot(dx, dy)
  const need = h.r * UNIT + radius
  if (d >= need) return { x, y }
  const nx = d > 1e-6 ? dx / d : -Math.sin(p.a)
  const ny = d > 1e-6 ? dy / d : Math.cos(p.a)
  return { x: p.x + nx * need, y: p.y + ny * need }
}

/**
 * 朝 (tx, ty) 去的身体（半径 radius 像素）往哪走：直线不碰钟身就照直走；碰上就奔绕过钟身的那条切线，挑离目标近的那一边；
 * 已经贴着钟壁就顺着钟壁往那一边滑
 */
export function aroundShell(h: Shell, p: Pose, x: number, y: number, tx: number, ty: number, radius: number): Point {
  const dx = tx - x
  const dy = ty - y
  const dist = Math.hypot(dx, dy) || 1
  const R = h.r * UNIT + radius + 0.3 * UNIT
  const ax = x - p.x
  const ay = y - p.y
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dist * dist)))
  if (Math.hypot(ax + dx * t, ay + dy * t) >= R - 0.3 * UNIT) return { x: dx / dist, y: dy / dist }
  const dA = Math.hypot(ax, ay) || 1
  const thA = Math.atan2(ay, ax)
  const thB = Math.atan2(ty - p.y, tx - p.x)
  const side = Math.sin(thB - thA) >= 0 ? 1 : -1
  if (dA <= R) {
    const ox = ax / dA
    const oy = ay / dA
    const wx = -oy * side + ox * 0.25
    const wy = ox * side + oy * 0.25
    const wl = Math.hypot(wx, wy)
    return { x: wx / wl, y: wy / wl }
  }
  const th = thA + side * Math.acos(R / dA)
  const wx = p.x + Math.cos(th) * R - x
  const wy = p.y + Math.sin(th) * R - y
  const wl = Math.hypot(wx, wy) || 1
  return { x: wx / wl, y: wy / wl }
}

/** 朝 d 游荡的身体碰上钟壁就照镜子弹回去；离钟壁 reach 像素以外不管 */
export function offShell(h: Shell, p: Pose, x: number, y: number, d: Point, reach: number): Point {
  const dx = x - p.x
  const dy = y - p.y
  const l = Math.hypot(dx, dy) || 1
  if (l - h.r * UNIT > reach) return d
  const nx = dx / l
  const ny = dy / l
  const dot = d.x * nx + d.y * ny
  return dot >= 0 ? d : { x: d.x - 2 * dot * nx, y: d.y - 2 * dot * ny }
}

/** 沿钟壁一圈 n 个点（潜水钟坐标，格） */
export function rimOf(h: Shell, n: number): { u: number; v: number }[] {
  const out: { u: number; v: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push({ u: Math.cos(a) * h.r, v: Math.sin(a) * h.r })
  }
  return out
}

/** 钟身里每隔 step 格一个点（潜水钟坐标，格）：底半径比 step 大的石头总压得着其中一个 */
export function innerOf(h: Shell, step: number): { u: number; v: number }[] {
  const out: { u: number; v: number }[] = []
  for (let u = -h.r; u <= h.r; u += step) {
    for (let v = -h.r; v <= h.r; v += step) if (shellSd(h, u, v) <= 0) out.push({ u, v })
  }
  return out
}

/** 挑落点要看的：这一局的礁湖，钟身的样子，沿钟壁一圈与钟身里一格格的点 */
export interface Berth {
  readonly plan: DeepPlan
  readonly shell: Shell
  readonly rim: readonly { u: number; v: number }[]
  readonly inner: readonly { u: number; v: number }[]
}

/** 潜水钟坐得下 p 吗：钟身整个压在沙底上，钟壁离边、礁石与头骨至少 room 像素，钟口那一片的中间有 doorU 一半宽的空地，出怪的地标都在钟壁一格以外 */
export function fits(b: Berth, cfg: BellCfg, p: Pose, room: number): boolean {
  const basin = b.plan.basin
  for (const q of b.rim) {
    const w = fromShell(p, q.u, q.v)
    if (roomAt(basin, w.x, w.y) < room) return false
  }
  for (const q of b.inner) {
    const w = fromShell(p, q.u, q.v)
    if (roomAt(basin, w.x, w.y) < 0) return false
  }
  const z = doorMid(b.shell, cfg, p)
  if (roomAt(basin, z.x, z.y) < (cfg.doorU / 2) * UNIT) return false
  for (const marks of Object.values(b.plan.marks)) for (const m of marks) if (shellGap(b.shell, p, m.x, m.y) < UNIT) return false
  return true
}

/** 开局坐的地方：队伍站在钟口那一片里、离钟壁 1 格多；先试钟口朝画面下方，再一点点转开；都坐不下就放宽离边的要求，再不行就钟口朝下硬放 */
export function homePose(b: Berth, cfg: BellCfg): Pose {
  const sx = b.plan.start.x * UNIT
  const sy = b.plan.start.y * UNIT
  const h = b.shell
  const at = (a: number, dz: number): Pose => {
    const back = (h.r + dz) * UNIT
    return { x: sx + Math.sin(a) * back, y: sy - Math.cos(a) * back, a }
  }
  for (const room of [cfg.roomU * UNIT, 0]) {
    for (const dz of [1.2, 1.6, 0.8]) {
      for (let i = 0; i < 24; i++) {
        const p = at((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12), dz)
        if (fits(b, cfg, p, room)) return p
      }
    }
  }
  return at(0, 1.2)
}

export function newBell(cfg: BellCfg, p: Pose): Bell {
  return { phase: 'down', x: p.x, y: p.y, a: p.a, h: 0, from: { ...p }, to: { ...p }, at: 0, span: 1, next: cfg.firstMs, moves: 0 }
}

const ease = (t: number): number => t * t * (3 - 2 * t)

function place(to: Pose, from: Pose): void {
  to.x = from.x
  to.y = from.y
  to.a = from.a
}

/** 从 a0 转到 a1 最近的那个方向要转多少，弧度 */
function turn(a0: number, a1: number): number {
  return Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))
}

/** 这一段走了多少，0 到 1 */
export function progress(s: Bell, now: number): number {
  return Math.min(1, Math.max(0, (now - s.at) / s.span))
}

/** 从 a 挪到 b 要多久，毫秒：按吊着挪的速度 */
export function cruiseMs(cfg: DeepConfig, a: Pose, b: Pose): number {
  return Math.max(1, ((Math.hypot(b.x - a.x, b.y - a.y) / UNIT) * cfg.meterPerU * 1000) / cfg.bell.speedMs)
}

/** 推进到 now：到点就进下一段，一帧跨过几段也一段段地走完；预兆结束时按 pick 挑新落点，落稳后按 gap 定下一次的间隔 */
export function stepBell(s: Bell, d: DeepConfig, now: number, pick: (from: Pose) => Pose, gap: () => number): void {
  const cfg = d.bell
  const enter = (phase: BellPhase, span: number, at: number): void => {
    s.phase = phase
    s.at = at
    s.span = span
  }
  for (let guard = 0; guard < 8; guard++) {
    const end = s.at + s.span
    if (s.phase === 'down') {
      s.h = 0
      if (now < s.next) break
      enter('warn', cfg.warnMs, s.next)
      continue
    }
    const t = progress(s, now)
    if (s.phase === 'warn') {
      if (t < 1) break
      place(s.from, s)
      place(s.to, pick(s.from))
      enter('rise', cfg.riseMs, end)
      continue
    }
    if (s.phase === 'rise') {
      s.h = cfg.liftM * ease(t)
      if (t < 1) break
      enter('cruise', cruiseMs(d, s.from, s.to), end)
      continue
    }
    if (s.phase === 'cruise') {
      const k = ease(t)
      s.x = s.from.x + (s.to.x - s.from.x) * k
      s.y = s.from.y + (s.to.y - s.from.y) * k
      s.a = s.from.a + turn(s.from.a, s.to.a) * k
      s.h = cfg.liftM
      if (t < 1) break
      enter('settle', cfg.settleMs, end)
      continue
    }
    s.h = cfg.liftM * (1 - t) * (1 - t)
    if (t < 1) break
    s.h = 0
    place(s, s.to)
    s.moves++
    s.next = end + gap()
    enter('down', 1, end)
  }
}

/** 潜水钟的倒计时：坐着时离吊走还有多久、快吊走时预兆还剩多久、吊走了离落稳还有多久，毫秒；ratio 是这一段还剩的比例 */
export function bellCountdown(s: Bell, d: DeepConfig, now: number): { phase: 'down' | 'warn' | 'away'; ratio: number; leftMs: number } {
  const cfg = d.bell
  const end = s.at + s.span
  if (s.phase === 'down') return { phase: 'down', ratio: (s.next - now) / Math.max(1, s.next - s.at), leftMs: s.next - now }
  if (s.phase === 'warn') return { phase: 'warn', ratio: (end - now) / s.span, leftMs: end - now }
  const cruise = cruiseMs(d, s.from, s.to)
  const left = end - now + (s.phase === 'rise' ? cruise + cfg.settleMs : s.phase === 'cruise' ? cfg.settleMs : 0)
  return { phase: 'away', ratio: left / (cfg.riseMs + cruise + cfg.settleMs), leftMs: left }
}

/** 潜水钟此刻坐着、或要放下去的地方：吊走的时候是新落点 */
export function bellTarget(s: Bell): Pose {
  return breathable(s) ? s : s.to
}
