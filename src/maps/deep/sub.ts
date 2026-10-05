import { UNIT } from '../../util/units.ts'
import { roomAt } from '../basin.ts'
import type { DeepPlan } from './layout'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 潜艇的一段：down 停在谷底上，warn 开走前的预兆（门口还喘得上气），rise 离开谷底往上浮，cruise 从头顶开过去，settle 往下落 */
export type SubPhase = 'down' | 'warn' | 'rise' | 'cruise' | 'settle'

/** 潜艇停的地方：艇心在谷底上的位置（像素），艇首朝哪（弧度）；门开在艇首朝向往画面上顺时针转 90° 的那一舷 */
export interface Pose {
  x: number
  y: number
  a: number
}

/** 潜艇：此刻在哪一段、停在哪，艇底离谷底多高（米）；这一段从哪开到哪，从几时开始、要多久（毫秒）；下一次开走几时开始预兆；开走过几次 */
export interface Sub extends Pose {
  phase: SubPhase
  h: number
  readonly from: Pose
  readonly to: Pose
  at: number
  span: number
  next: number
  moves: number
}

type SubCfg = DeepConfig['sub']

/**
 * 艇身在潜艇自己的坐标里的形状（格）：u 顺着艇首，v 朝门那一舷。艇首是半径 r 的半圆、圆心在 bow，艇身一样粗直到 neck，往后收成圆心在 tail、半径 tailR 的艇尾；
 * 门的中心在 u = door 那一舷的艇壁上
 */
export interface Hull {
  readonly r: number
  readonly bow: number
  readonly neck: number
  readonly tail: number
  readonly tailR: number
  readonly door: number
}

/** 艇尾从艇长的几成处开始收、收到艇宽的几成；门开在艇心往艇尾偏艇长的几成 */
const SHAPE = { neck: 0.3, tail: 0.35, door: 0.04 } as const

export function hullOf(cfg: SubCfg): Hull {
  const half = cfg.lengthU / 2
  const r = cfg.beamU / 2
  const tailR = r * SHAPE.tail
  return { r, bow: half - r, neck: -half + cfg.lengthU * SHAPE.neck, tail: -half + tailR, tailR, door: -cfg.lengthU * SHAPE.door }
}

/** 潜艇坐标里一点离艇壁多远（格，艇身里为负）：艇首到 neck 是一段胶囊，往后是从 neck 收到艇尾的锥 */
export function hullSd(h: Hull, u: number, v: number): number {
  const av = Math.abs(v)
  const cu = u < h.neck ? h.neck : u > h.bow ? h.bow : u
  const body = Math.hypot(u - cu, av) - h.r
  const len = h.neck - h.tail
  const b = (h.r - h.tailR) / len
  const a = Math.sqrt(1 - b * b)
  const y = h.neck - u
  const k = -b * av + a * y
  const tail = k < 0 ? Math.hypot(av, y) - h.r : k > a * len ? Math.hypot(av, y - len) - h.tailR : a * av + b * y - h.r
  return Math.min(body, tail)
}

/** 世界里的 (x, y)（像素）在停在 p 的潜艇自己的坐标里（格） */
export function toHull(p: Pose, x: number, y: number, out: { u: number; v: number }): { u: number; v: number } {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  const dx = (x - p.x) / UNIT
  const dy = (y - p.y) / UNIT
  out.u = dx * c + dy * s
  out.v = -dx * s + dy * c
  return out
}

/** 潜艇坐标里的 (u, v)（格）在世界里的位置（像素） */
export function fromHull(p: Pose, u: number, v: number): Point {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  return { x: p.x + (u * c - v * s) * UNIT, y: p.y + (u * s + v * c) * UNIT }
}

const Q = { u: 0, v: 0 }

/** 停在 p 的潜艇，(x, y) 离艇壁多远（像素，艇身里为负） */
export function hullGap(h: Hull, p: Pose, x: number, y: number): number {
  toHull(p, x, y, Q)
  return hullSd(h, Q.u, Q.v) * UNIT
}

/** 门口那一片半圆的中间：门前 doorU 的一半处（像素），箭头指它 */
export function doorMid(h: Hull, cfg: SubCfg, p: Pose): Point {
  return fromHull(p, h.door, h.r + cfg.doorU / 2)
}

/** (x, y) 在不在停在 p 的潜艇门口那一片半圆里：圆心是门的中心，半径 doorU 格，只算门那一舷 */
export function atDoor(h: Hull, cfg: SubCfg, p: Pose, x: number, y: number): boolean {
  toHull(p, x, y, Q)
  return Q.v > 0 && Math.hypot(Q.u - h.door, Q.v - h.r) <= cfg.doorU
}

/** 把一点收进门口那一片半圆里、离半圆的边与艇壁各留 margin 格：队员的坑位落在外面时往里挪 */
export function intoDoor(h: Hull, cfg: SubCfg, p: Pose, at: Point, margin: number): Point {
  toHull(p, at.x, at.y, Q)
  const du = Q.u - h.door
  const dv = Math.max(Q.v - h.r, margin)
  const d = Math.hypot(du, dv)
  const k = d > cfg.doorU - margin ? (cfg.doorU - margin) / d : 1
  return fromHull(p, h.door + du * k, h.r + dv * k)
}

/** 艇身此刻停在谷底上、门口喘不喘得上气：停着与预兆时喘得上，浮起来门就关了 */
export function breathable(s: Sub): boolean {
  return s.phase === 'down' || s.phase === 'warn'
}

const N = { x: 0, y: 0 }

/** 停在 p 的潜艇，艇身外 (x, y) 处朝外的法线（世界里的单位向量，写进 N）；返回离艇壁多远（像素）。正压在艇身中线上时朝门那一舷 */
function normalAt(h: Hull, p: Pose, x: number, y: number): number {
  toHull(p, x, y, Q)
  const u = Q.u
  const v = Q.v
  const e = 0.01
  let gu = hullSd(h, u + e, v) - hullSd(h, u - e, v)
  let gv = hullSd(h, u, v + e) - hullSd(h, u, v - e)
  const g = Math.hypot(gu, gv)
  if (g < 1e-6) {
    gu = 0
    gv = 1
  } else {
    gu /= g
    gv /= g
  }
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  N.x = gu * c - gv * s
  N.y = gu * s + gv * c
  return hullSd(h, u, v) * UNIT
}

/** 半径 radius（像素）的身体挡在艇壁外：压进艇身就顺着艇壁往外推出来 */
export function outOfHull(h: Hull, p: Pose, x: number, y: number, radius: number): Point {
  const d = normalAt(h, p, x, y)
  if (d >= radius) return { x, y }
  return { x: x + N.x * (radius - d), y: y + N.y * (radius - d) }
}

const A = { u: 0, v: 0 }
const B = { u: 0, v: 0 }

/** 潜艇坐标里从 A 沿 (du, dv) 走 len 格的线段碰不碰得上艇身：按距离场一步步走，走到贴着艇壁就算碰上 */
function crosses(h: Hull, du: number, dv: number, len: number): boolean {
  let t = 0
  for (let i = 0; i < 40; i++) {
    const d = hullSd(h, A.u + du * t, A.v + dv * t)
    if (d < 0.02) return true
    t += d / len
    if (t >= 1) return false
  }
  return false
}

/**
 * 朝 (tx, ty) 去的身体（半径 radius 像素）往哪走：直线不穿过艇身就照直走；穿过就先奔艇首或艇尾外面一点，挑绕过去近的那一头，
 * 贴着艇壁、又是往艇身里走时顺着艇壁往那一头滑
 */
export function aroundHull(h: Hull, p: Pose, x: number, y: number, tx: number, ty: number, radius: number): Point {
  const dx = tx - x
  const dy = ty - y
  const dist = Math.hypot(dx, dy) || 1
  toHull(p, x, y, A)
  toHull(p, tx, ty, B)
  const du = B.u - A.u
  const dv = B.v - A.v
  const len = Math.hypot(du, dv)
  if (len < 1e-6 || !crosses(h, du, dv, len)) return { x: dx / dist, y: dy / dist }
  const clear = radius / UNIT + 0.6
  const bowU = h.bow + h.r + clear
  const sternU = h.tail - h.tailR - clear
  const viaBow = Math.hypot(bowU - A.u, A.v) + Math.hypot(B.u - bowU, B.v)
  const viaStern = Math.hypot(sternU - A.u, A.v) + Math.hypot(B.u - sternU, B.v)
  const endU = viaBow <= viaStern ? bowU : sternU
  const w = fromHull(p, endU, 0)
  let wx = w.x - x
  let wy = w.y - y
  if (normalAt(h, p, x, y) < radius + 0.6 * UNIT && wx * N.x + wy * N.y < 0) {
    const toward = (-N.y * Math.cos(p.a) + N.x * Math.sin(p.a)) * Math.sign(endU)
    const side = toward < 0 ? -1 : 1
    wx = -N.y * side + N.x * 0.25
    wy = N.x * side + N.y * 0.25
  }
  const wl = Math.hypot(wx, wy) || 1
  return { x: wx / wl, y: wy / wl }
}

/** 朝 d 游荡的身体碰上艇壁就照镜子弹回去；离艇壁 reach 像素以外不管 */
export function offHull(h: Hull, p: Pose, x: number, y: number, d: Point, reach: number): Point {
  if (normalAt(h, p, x, y) > reach) return d
  const dot = d.x * N.x + d.y * N.y
  return dot >= 0 ? d : { x: d.x - 2 * dot * N.x, y: d.y - 2 * dot * N.y }
}

/** 沿艇壁一圈 n 个点（潜艇坐标，格）：从艇心往外一个个方向找艇壁 */
export function rimOf(h: Hull, n: number): { u: number; v: number }[] {
  const far = Math.max(h.bow + h.r, h.tailR - h.tail) + 1
  const out: { u: number; v: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const cu = Math.cos(a)
    const cv = Math.sin(a)
    let lo = 0
    let hi = far
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2
      if (hullSd(h, cu * m, cv * m) > 0) hi = m
      else lo = m
    }
    out.push({ u: cu * lo, v: cv * lo })
  }
  return out
}

/** 艇身里每隔 step 格一个点（潜艇坐标，格）：底半径比 step 大的石头总压得着其中一个 */
export function innerOf(h: Hull, step: number): { u: number; v: number }[] {
  const out: { u: number; v: number }[] = []
  for (let u = h.tail - h.tailR; u <= h.bow + h.r; u += step) {
    for (let v = -h.r; v <= h.r; v += step) if (hullSd(h, u, v) <= 0) out.push({ u, v })
  }
  return out
}

/** 挑停靠的地方要看的：这一局的谷底，艇身的样子，沿艇壁一圈与艇身里一格格的点 */
export interface Berth {
  readonly plan: DeepPlan
  readonly hull: Hull
  readonly rim: readonly { u: number; v: number }[]
  readonly inner: readonly { u: number; v: number }[]
}

/** 潜艇停得下 p 吗：艇身整个压在谷底上，艇壁离边、石头与头骨至少 room 像素，门口那一片的中间有 doorU 一半宽的空地，出怪的地标都在艇壁一格以外 */
export function fits(b: Berth, cfg: SubCfg, p: Pose, room: number): boolean {
  const basin = b.plan.basin
  for (const q of b.rim) {
    const w = fromHull(p, q.u, q.v)
    if (roomAt(basin, w.x, w.y) < room) return false
  }
  for (const q of b.inner) {
    const w = fromHull(p, q.u, q.v)
    if (roomAt(basin, w.x, w.y) < 0) return false
  }
  const z = doorMid(b.hull, cfg, p)
  if (roomAt(basin, z.x, z.y) < (cfg.doorU / 2) * UNIT) return false
  for (const marks of Object.values(b.plan.marks)) for (const m of marks) if (hullGap(b.hull, p, m.x, m.y) < UNIT) return false
  return true
}

/** 开局停靠的地方：队伍站在门口那一片里、离艇壁 1 格多；先试门朝画面下方，再一点点转开；都停不下就放宽离边的要求，再不行就门朝下硬停 */
export function homePose(b: Berth, cfg: SubCfg): Pose {
  const sx = b.plan.start.x * UNIT
  const sy = b.plan.start.y * UNIT
  const h = b.hull
  const at = (a: number, dz: number): Pose => {
    const c = Math.cos(a)
    const s = Math.sin(a)
    const back = (h.r + dz) * UNIT
    return { x: sx + s * back - c * h.door * UNIT, y: sy - c * back - s * h.door * UNIT, a }
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

export function newSub(cfg: SubCfg, p: Pose): Sub {
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
export function progress(s: Sub, now: number): number {
  return Math.min(1, Math.max(0, (now - s.at) / s.span))
}

/** 从 a 开到 b 要多久，毫秒：按开的速度 */
export function cruiseMs(cfg: DeepConfig, a: Pose, b: Pose): number {
  return Math.max(1, ((Math.hypot(b.x - a.x, b.y - a.y) / UNIT) * cfg.meterPerU * 1000) / cfg.sub.speedMs)
}

/** 推进到 now：到点就进下一段，一帧跨过几段也一段段地走完；预兆结束时按 pick 挑新落点，落稳后按 gap 定下一次的间隔 */
export function stepSub(s: Sub, d: DeepConfig, now: number, pick: (from: Pose) => Pose, gap: () => number): void {
  const cfg = d.sub
  const enter = (phase: SubPhase, span: number, at: number): void => {
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
      s.h = cfg.cruiseM * ease(t)
      if (t < 1) break
      enter('cruise', cruiseMs(d, s.from, s.to), end)
      continue
    }
    if (s.phase === 'cruise') {
      const k = ease(t)
      s.x = s.from.x + (s.to.x - s.from.x) * k
      s.y = s.from.y + (s.to.y - s.from.y) * k
      s.a = s.from.a + turn(s.from.a, s.to.a) * k
      s.h = cfg.cruiseM
      if (t < 1) break
      enter('settle', cfg.settleMs, end)
      continue
    }
    s.h = cfg.cruiseM * (1 - t) * (1 - t)
    if (t < 1) break
    s.h = 0
    place(s, s.to)
    s.moves++
    s.next = end + gap()
    enter('down', 1, end)
  }
}

/** 潜艇的倒计时：停着时离开走还有多久、快开走时预兆还剩多久、开走了离停稳还有多久，毫秒；ratio 是这一段还剩的比例 */
export function subCountdown(s: Sub, d: DeepConfig, now: number): { phase: 'down' | 'warn' | 'away'; ratio: number; leftMs: number } {
  const cfg = d.sub
  const end = s.at + s.span
  if (s.phase === 'down') return { phase: 'down', ratio: (s.next - now) / Math.max(1, s.next - s.at), leftMs: s.next - now }
  if (s.phase === 'warn') return { phase: 'warn', ratio: (end - now) / s.span, leftMs: end - now }
  const cruise = cruiseMs(d, s.from, s.to)
  const left = end - now + (s.phase === 'rise' ? cruise + cfg.settleMs : s.phase === 'cruise' ? cfg.settleMs : 0)
  return { phase: 'away', ratio: left / (cfg.riseMs + cruise + cfg.settleMs), leftMs: left }
}

/** 潜艇此刻停着、或要落下去的地方：开走的时候是新落点 */
export function subTarget(s: Sub): Pose {
  return breathable(s) ? s : s.to
}
