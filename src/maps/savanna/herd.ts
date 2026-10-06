import { UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { awayFromWall, keepOut, roomAt } from '../basin.ts'
import { pondGap, pondRadius } from './layout.ts'
import type { SavannaPlan } from './layout'
import type { SavannaConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 兽群此刻：calm 平时在水边喝水吃草，alarm 受惊了、要跑之前的预警，run 狂奔，slow 跑出一段慢下来 */
export type HerdPhase = 'calm' | 'alarm' | 'run' | 'slow'

/** 狂奔时离边多近（格）开始顺着边拐，贴得更近就往外推 */
const WALL_SLIDE_U = 1.4
/** 速度追上想要的速度的时间常数，秒：平时慢慢起步，狂奔时一下子窜出去 */
const EASE_WALK_S = 0.6
const EASE_RUN_S = 0.22
/** 走到离目标这么近（格）就算到了 */
const ARRIVE_U = 0.3
/** 惊扰的来处按这么快（每秒）忘掉：新的惊扰压过旧的 */
const THREAT_FADE = 0.35
/** 跑道按这么长的步子（秒）往前推 */
const PATH_STEP_S = 0.1

/** 一头动物：哪一种、半径（像素）与高（米）、走与跑的速度（像素/秒）；此刻的位置与速度，脸朝哪边（−1 朝左，1 朝右） */
export interface Beast {
  readonly kind: string
  readonly r: number
  readonly h: number
  readonly walk: number
  readonly run: number
  x: number
  y: number
  vx: number
  vy: number
  face: number
  /** 要去的地方（像素），是不是去喝水；歇到几时（毫秒）再挪地方 */
  tx: number
  ty: number
  drink: boolean
  restUntil: number
  /** 狂奔时这一头的方向比全群偏开多少（弧度），此刻跑的方向 */
  lane: number
  hx: number
  hy: number
  /** 上一次挨打在几时（毫秒）；此刻挤着几个身体；这一趟踩过谁（按编号） */
  flinch: number
  crowd: number
  readonly struck: Set<number>
  /** 动作的相位（秒），画面按它晃 */
  phase: number
}

/** 兽群：每一头，惊慌（0 到 1），上一次受惊在几时、跑累了到几时不容易受惊；惊扰从哪来（带权重的平均）；此刻哪一段、几时开始、往哪跑，跑过几趟 */
export interface Herd {
  readonly beasts: Beast[]
  fear: number
  quietAt: number
  tiredUntil: number
  threat: { x: number; y: number; w: number }
  phase: HerdPhase
  at: number
  dir: Point
  runs: number
}

const between = (rng: Rng, r: readonly [number, number]): number => r[0] + rng.next() * (r[1] - r[0])

/** 水边 b 喝水的地方，像素：岸在 ang 方向上，往外让出它的半径 */
function shoreSpot(plan: SavannaPlan, b: { r: number }, ang: number): Point {
  const p = plan.pond
  const d = pondRadius(p, ang) * UNIT + b.r + 0.3 * UNIT
  return { x: p.x * UNIT + Math.cos(ang) * d, y: p.y * UNIT + Math.sin(ang) * d }
}

/** 离水 homeU 格之间吃草的地方，像素 */
function grazeSpot(cfg: SavannaConfig, plan: SavannaPlan, rng: Rng, b: { r: number }, ang: number): Point {
  const p = plan.pond
  const d = pondRadius(p, ang) + between(rng, cfg.herd.homeU) + b.r / UNIT
  return { x: (p.x + Math.cos(ang) * d) * UNIT, y: (p.y + Math.sin(ang) * d) * UNIT }
}

/** 这一点站不站得下这一头：离边、水与障碍至少它的半径，离开局站位 clear 像素 */
function fits(plan: SavannaPlan, b: { r: number }, p: Point, clear: number): boolean {
  return roomAt(plan.basin, p.x, p.y) >= b.r + 0.2 * UNIT && Math.hypot(p.x - plan.start.x * UNIT, p.y - plan.start.y * UNIT) >= clear + b.r
}

/** 开局：每种按个数一头头摆在水边与吃草的那一圈里，彼此不挤，离开局站位够远；挑不到就放宽 */
export function newHerd(cfg: SavannaConfig, plan: SavannaPlan, seed: number, clearU: number): Herd {
  const rng = new Rng(seed)
  const beasts: Beast[] = []
  const space = cfg.herd.spaceU * UNIT
  for (const [kind, k] of Object.entries(cfg.herd.kinds)) {
    const n = rng.int(k.count[0], k.count[1])
    for (let i = 0; i < n; i++) {
      const b = { r: k.radiusU * UNIT }
      let at: Point | null = null
      let drink = false
      for (let t = 0; t < 400 && !at; t++) {
        const loose = t > 200
        drink = rng.next() < cfg.herd.drinkShare
        const ang = rng.next() * Math.PI * 2
        const p = drink ? shoreSpot(plan, b, ang) : grazeSpot(cfg, plan, rng, b, ang)
        if (!fits(plan, b, p, (loose ? clearU * 0.6 : clearU) * UNIT)) continue
        if (beasts.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + b.r + (loose ? 0 : space))) continue
        at = p
      }
      if (!at) continue
      beasts.push({
        kind,
        r: b.r,
        h: k.heightM,
        walk: k.walkU * UNIT,
        run: k.runU * UNIT,
        x: at.x,
        y: at.y,
        vx: 0,
        vy: 0,
        face: rng.next() < 0.5 ? -1 : 1,
        tx: at.x,
        ty: at.y,
        drink,
        restUntil: between(rng, cfg.herd.restMs) * rng.next(),
        lane: 0,
        hx: 0,
        hy: 0,
        flinch: -1e9,
        crowd: 0,
        struck: new Set(),
        phase: rng.next() * 10,
      })
    }
  }
  return { beasts, fear: 0, quietAt: 0, tiredUntil: 0, threat: { x: 0, y: 0, w: 0 }, phase: 'calm', at: 0, dir: { x: 1, y: 0 }, runs: 0 }
}

/** 全群的中心，像素 */
export function herdCenter(h: Herd): Point {
  let x = 0
  let y = 0
  for (const b of h.beasts) {
    x += b.x
    y += b.y
  }
  const n = Math.max(1, h.beasts.length)
  return { x: x / n, y: y / n }
}

/** 惊扰在哪：此刻要是狂奔，背着它跑；还没受过惊就没有方向 */
export function fleeDir(h: Herd): Point | null {
  if (h.threat.w <= 1e-3) return null
  const c = herdCenter(h)
  const dx = c.x - h.threat.x
  const dy = c.y - h.threat.y
  const d = Math.hypot(dx, dy)
  return d > 0.5 * UNIT ? { x: dx / d, y: dy / d } : null
}

/** (x, y) 处受了 amount 的惊：平时与慢下来时惊慌往上涨（刚跑完的涨得少），记下惊扰从哪来；预警与狂奔时不管 */
export function scare(h: Herd, cfg: SavannaConfig, x: number, y: number, amount: number, now: number): void {
  if (amount <= 0 || h.phase === 'alarm' || h.phase === 'run') return
  const k = now < h.tiredUntil ? cfg.fear.tired : 1
  const a = amount * k
  h.fear = Math.min(1, h.fear + a)
  h.quietAt = now
  const t = h.threat
  t.x = (t.x * t.w + x * a) / (t.w + a)
  t.y = (t.y * t.w + y * a) / (t.w + a)
  t.w += a
}

/** 立刻受惊：头目登场时整群马上开始预警，背着它跑 */
export function panic(h: Herd, cfg: SavannaConfig, rng: Rng, x: number, y: number, now: number): void {
  if (h.phase === 'alarm' || h.phase === 'run') return
  h.threat = { x, y, w: 1 }
  h.fear = 1
  alarm(h, cfg, rng, now)
}

/** 进入预警：定下往哪跑，各头偏开一点，停下脚步转过脸去 */
function alarm(h: Herd, cfg: SavannaConfig, rng: Rng, now: number): void {
  const d = fleeDir(h)
  const a = d ? Math.atan2(d.y, d.x) : rng.next() * Math.PI * 2
  h.dir = { x: Math.cos(a), y: Math.sin(a) }
  h.phase = 'alarm'
  h.at = now
  for (const b of h.beasts) b.lane = ((rng.next() * 2 - 1) * cfg.stampede.spreadDeg * Math.PI) / 180
}

/** 从 (x, y) 朝 (hx, hy) 狂奔时这一步真正往哪跑：离边近了就顺着边拐，贴得太近往外推；返回的方向写进 out */
function steerRun(plan: SavannaPlan, r: number, x: number, y: number, hx: number, hy: number, out: { x: number; y: number }): void {
  const room = roomAt(plan.basin, x, y) - r
  let dx = hx
  let dy = hy
  if (room < WALL_SLIDE_U * UNIT) {
    const n = awayFromWall(plan.basin, x, y)
    const into = dx * n.x + dy * n.y
    if (into < 0) {
      const k = 1 - Math.max(0, room) / (WALL_SLIDE_U * UNIT)
      dx -= into * n.x * (0.4 + 0.6 * k)
      dy -= into * n.y * (0.4 + 0.6 * k)
      dx += n.x * 0.25 * k
      dy += n.y * 0.25 * k
    }
  }
  const l = Math.hypot(dx, dy) || 1
  out.x = dx / l
  out.y = dy / l
}

const DIR = { x: 0, y: 0 }

/** 这一头狂奔起来会跑过哪些地方，像素：按狂奔时一样的拐法往前推，预警时画跑道用 */
export function runPath(plan: SavannaPlan, h: Herd, b: Beast, cfg: SavannaConfig): Point[] {
  const s = cfg.stampede
  let x = b.x
  let y = b.y
  let hx = Math.cos(Math.atan2(h.dir.y, h.dir.x) + b.lane)
  let hy = Math.sin(Math.atan2(h.dir.y, h.dir.x) + b.lane)
  const pts: Point[] = [{ x, y }]
  let walked = 0
  for (let t = 0; t < (s.runMs + s.slowMs * 0.5) / 1000 && walked < s.laneU * UNIT; t += PATH_STEP_S) {
    steerRun(plan, b.r, x, y, hx, hy, DIR)
    hx = DIR.x
    hy = DIR.y
    const step = b.run * PATH_STEP_S * (t * 1000 < s.runMs ? 1 : 0.6)
    const q = keepOut(plan.basin, x + hx * step, y + hy * step, b.r)
    walked += Math.hypot(q.x - x, q.y - y)
    x = q.x
    y = q.y
    pts.push({ x, y })
  }
  return pts
}

/** 这一段走了多少，0 到 1 */
export function phaseProgress(h: Herd, cfg: SavannaConfig, now: number): number {
  const s = cfg.stampede
  const span = h.phase === 'alarm' ? s.warnMs : h.phase === 'run' ? s.runMs : h.phase === 'slow' ? s.slowMs : 1
  return Math.min(1, Math.max(0, (now - h.at) / span))
}

/** 挑下一处要去的地方：喝水就去岸边离自己近的一段，吃草就在离水那一圈里离自己不远的地方 */
function retarget(cfg: SavannaConfig, plan: SavannaPlan, rng: Rng, h: Herd, b: Beast, thirsty: boolean): void {
  const p = plan.pond
  const here = Math.atan2(b.y - p.y * UNIT, b.x - p.x * UNIT)
  for (let t = 0; t < 30; t++) {
    const drink = thirsty || rng.next() < cfg.herd.drinkShare
    const ang = here + (rng.next() * 2 - 1) * (drink ? 0.9 : 1.3)
    const q = drink ? shoreSpot(plan, b, ang) : grazeSpot(cfg, plan, rng, b, ang)
    if (roomAt(plan.basin, q.x, q.y) < b.r + 0.15 * UNIT) continue
    if (h.beasts.some((o) => o !== b && Math.hypot(o.tx - q.x, o.ty - q.y) < o.r + b.r + cfg.herd.spaceU * UNIT)) continue
    b.tx = q.x
    b.ty = q.y
    b.drink = drink
    return
  }
  b.tx = b.x
  b.ty = b.y
  b.drink = pondGap(p, b.x / UNIT, b.y / UNIT) < b.r / UNIT + 0.4
}

/**
 * 推进 dt 秒：平时一头头走到要去的地方歇一阵，再挪去喝水或吃草，惊慌没人惊扰一阵就慢慢落下去，涨满了就预警；
 * 预警时站住、转脸朝要跑的方向，到点就狂奔；狂奔时朝各自的方向全速跑、顺着边拐；跑完慢下来，惊慌清零，跑累了一阵不容易再惊，再一头头走回水边。
 * 动物之间互相让开，谁也走不进边、水和障碍
 */
export function stepHerd(h: Herd, cfg: SavannaConfig, plan: SavannaPlan, rng: Rng, now: number, dt: number): void {
  const s = cfg.stampede
  const f = cfg.fear
  h.threat.w *= Math.exp(-THREAT_FADE * dt)
  if (h.phase === 'calm') {
    if (now - h.quietAt > f.quietMs) h.fear = Math.max(0, h.fear - f.decay * dt)
    if (h.fear >= 1) alarm(h, cfg, rng, now)
  }
  if (h.phase === 'alarm' && now - h.at >= s.warnMs) {
    h.phase = 'run'
    h.at = now
    h.runs++
    const base = Math.atan2(h.dir.y, h.dir.x)
    for (const b of h.beasts) {
      b.struck.clear()
      b.hx = Math.cos(base + b.lane)
      b.hy = Math.sin(base + b.lane)
    }
  } else if (h.phase === 'run' && now - h.at >= s.runMs) {
    h.phase = 'slow'
    h.at = now
  } else if (h.phase === 'slow' && now - h.at >= s.slowMs) {
    h.phase = 'calm'
    h.at = now
    h.fear = 0
    h.threat.w = 0
    h.quietAt = now
    h.tiredUntil = now + f.tiredMs
    for (const b of h.beasts) {
      b.restUntil = now + rng.next() * 2500
      retarget(cfg, plan, rng, h, b, rng.next() < 0.7)
    }
  }

  const space = cfg.herd.spaceU * UNIT
  for (const b of h.beasts) {
    let wx = 0
    let wy = 0
    let ease = EASE_WALK_S
    if (h.phase === 'calm') {
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy)
      if (now >= b.restUntil) {
        if (d < ARRIVE_U * UNIT) {
          b.restUntil = now + between(rng, cfg.herd.restMs)
          retarget(cfg, plan, rng, h, b, false)
        } else {
          const slow = Math.min(1, d / (1.2 * UNIT))
          wx = (dx / d) * b.walk * (0.4 + 0.6 * slow)
          wy = (dy / d) * b.walk * (0.4 + 0.6 * slow)
        }
      }
    } else if (h.phase === 'alarm') {
      ease = 0.15
    } else {
      steerRun(plan, b.r, b.x, b.y, b.hx, b.hy, DIR)
      b.hx = DIR.x
      b.hy = DIR.y
      const k = h.phase === 'run' ? 1 : 1 - phaseProgress(h, cfg, now)
      const sp = b.walk + (b.run - b.walk) * k
      wx = b.hx * sp
      wy = b.hy * sp
      ease = h.phase === 'run' ? EASE_RUN_S : EASE_WALK_S
    }
    // 互相让开：挨得太近就往外推，狂奔时让得少，免得乱了阵
    for (const o of h.beasts) {
      if (o === b) continue
      const dx = b.x - o.x
      const dy = b.y - o.y
      const d = Math.hypot(dx, dy) || 1
      const gap = d - b.r - o.r - space
      if (gap >= 0) continue
      const push = Math.min(1, -gap / (0.5 * UNIT)) * b.walk * (h.phase === 'run' ? 0.8 : 1.6)
      wx += (dx / d) * push
      wy += (dy / d) * push
    }
    const a = 1 - Math.exp(-dt / ease)
    b.vx += (wx - b.vx) * a
    b.vy += (wy - b.vy) * a
    const q = keepOut(plan.basin, b.x + b.vx * dt, b.y + b.vy * dt, b.r)
    if (dt > 0) {
      b.vx = (q.x - b.x) / dt
      b.vy = (q.y - b.y) / dt
    }
    b.x = q.x
    b.y = q.y
    const speed = Math.hypot(b.vx, b.vy)
    if (h.phase === 'alarm') b.face = h.dir.x >= 0 ? 1 : -1
    else if (speed > 0.15 * UNIT && Math.abs(b.vx) > 0.3 * speed) b.face = b.vx > 0 ? 1 : -1
    else if (b.drink && h.phase === 'calm' && now < b.restUntil) b.face = plan.pond.x * UNIT > b.x ? 1 : -1
    b.phase += dt * (0.6 + speed / UNIT)
  }
  // 动物彼此不重叠：还压着的各退一半
  for (let i = 0; i < h.beasts.length; i++) {
    for (let j = i + 1; j < h.beasts.length; j++) {
      const a = h.beasts[i]!
      const c = h.beasts[j]!
      const dx = c.x - a.x
      const dy = c.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const over = a.r + c.r - d
      if (over <= 0) continue
      const pa = keepOut(plan.basin, a.x - (dx / d) * over * 0.5, a.y - (dy / d) * over * 0.5, a.r)
      const pc = keepOut(plan.basin, c.x + (dx / d) * over * 0.5, c.y + (dy / d) * over * 0.5, c.r)
      a.x = pa.x
      a.y = pa.y
      c.x = pc.x
      c.y = pc.y
    }
  }
}
