import { UNIT } from '../../util/units'
import type { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import type { DreamlandConfig } from '../../types/maps'
import type { Slip } from '../slope'
import { gaugeAt, sectorAt } from './layout'
import type { DreamlandPlan } from './layout'

/** 重力加速度，米/秒² */
export const GRAVITY = 9.81

/** 开局先平着歇这么久，毫秒：队伍站稳了再倾 */
const FIRST_REST_MS = 4500

/** 操作员此刻在做什么：平着歇、预警、倾过去、倾到底停着、回平 */
export type OpPhase = 'rest' | 'warn' | 'tilt' | 'hold' | 'level'

/**
 * 操作员：这一段从 from 到 until（毫秒，场上的时间），起止时台面的坡度 (sx0, sy0) → (sx1, sy1)（每像素降多少米，指向往下的方向）；
 * side 是正倾过去或停着的那条边，next 是预警里要倾向的那条边，没有为 -1
 */
export interface Operator {
  phase: OpPhase
  from: number
  until: number
  sx0: number
  sy0: number
  sx1: number
  sy1: number
  side: number
  next: number
}

/**
 * 传送带：dir 是内圈往哪转（1 顺着各边的切向，外圈总是反过来），speed 是此刻的速度占满速的比例（带方向）；
 * 两圈的带面各走了多远（像素，画面按它滚动）；warnAt 起预警换向，预警完停下再反转，turning 为真时正在换向
 */
export interface Belts {
  dir: number
  speed: number
  innerRun: number
  outerRun: number
  warnAt: number
  turning: boolean
}

/** 台面的坡对站在上面的东西：沿台面的重力分量（地图坐标，像素/秒²）、垂直台面的分量与闲着的身体被动滑的速度 */
export interface StageSlope {
  gx: number
  gy: number
  gn: number
  readonly slips: Map<number, Slip>
}

/** 乐园此刻的状态：场上的时钟（毫秒）、操作员、此刻台面的坡度、各条边的入口开到几成（0 关 1 开）、传送带与台面上的重力 */
export interface DreamlandState {
  readonly plan: DreamlandPlan
  readonly rng: Rng
  t: number
  readonly op: Operator
  sx: number
  sy: number
  readonly gates: Float32Array
  readonly belts: Belts
  readonly slope: StageSlope
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + rng.next() * (r[1] - r[0])
}

/** 倾到底时台面的坡度：那条边正好贴着地，每像素降多少米 */
export function fullSlope(cfg: DreamlandConfig, plan: DreamlandPlan): number {
  return cfg.pivotM / plan.stage
}

/** 坡度 (sx, sy) 下台面的倾角，弧度 */
export function tiltOf(plan: DreamlandPlan, sx: number, sy: number): number {
  return Math.atan((Math.hypot(sx, sy) * UNIT) / plan.meterPerU)
}

export function makeDreamland(cfg: DreamlandConfig, plan: DreamlandPlan, rng: Rng): DreamlandState {
  const g = (GRAVITY * UNIT) / cfg.meterPerU
  return {
    plan,
    rng,
    t: 0,
    op: { phase: 'rest', from: 0, until: FIRST_REST_MS, sx0: 0, sy0: 0, sx1: 0, sy1: 0, side: -1, next: -1 },
    sx: 0,
    sy: 0,
    gates: new Float32Array(cfg.sides),
    belts: { dir: 1, speed: 1, innerRun: 0, outerRun: 0, warnAt: between(rng, cfg.belt.flipMs), turning: false },
    slope: { gx: 0, gy: 0, gn: g, slips: new Map() },
  }
}

/** 挑下一条要倾向的边：随机，不挑正停着的那条 */
function pickSide(s: DreamlandState, cfg: DreamlandConfig): number {
  const n = cfg.sides
  const cur = s.op.side
  const k = Math.floor(s.rng.next() * (cur >= 0 ? n - 1 : n))
  return cur >= 0 && k >= cur ? k + 1 : k
}

/** 操作员这一段做完了，接着做下一段 */
function advance(s: DreamlandState, cfg: DreamlandConfig, plan: DreamlandPlan): void {
  const op = s.op
  const o = cfg.operator
  const at = op.until
  op.from = at
  op.sx0 = op.sx1 = s.sx
  op.sy0 = op.sy1 = s.sy
  switch (op.phase) {
    case 'rest':
      op.phase = 'warn'
      op.next = pickSide(s, cfg)
      op.until = at + o.warnMs
      return
    case 'warn': {
      const full = fullSlope(cfg, plan)
      const nk = plan.normals[op.next]!
      op.phase = 'tilt'
      op.side = op.next
      op.next = -1
      op.sx1 = nk.x * full
      op.sy1 = nk.y * full
      op.until = at + o.tiltMs
      return
    }
    case 'tilt':
      op.phase = 'hold'
      op.until = at + between(s.rng, o.holdMs)
      return
    case 'hold':
      if (s.rng.next() < o.direct) {
        op.phase = 'warn'
        op.next = pickSide(s, cfg)
        op.until = at + o.warnMs
        return
      }
      op.phase = 'level'
      op.side = -1
      op.sx1 = 0
      op.sy1 = 0
      op.until = at + o.levelMs
      return
    case 'level':
      op.phase = 'rest'
      op.until = at + between(s.rng, o.restMs)
  }
}

/** 第 k 条边的入口此刻该不该开着：倾到这条边停着的那段里，贴平后隔一会儿开、离开前提早关 */
function wantOpen(s: DreamlandState, cfg: DreamlandConfig, k: number): boolean {
  const op = s.op
  return op.phase === 'hold' && op.side === k && s.t >= op.from + cfg.gate.openMs && s.t < op.until - cfg.gate.closeMs
}

/** 第 k 条边的入口此刻过得去人：开足了、还没开始关 */
export function passable(s: DreamlandState, cfg: DreamlandConfig, k: number): boolean {
  return wantOpen(s, cfg, k) && s.gates[k]! >= 1
}

/** 此刻过得去人的那条边，没有为 -1 */
export function openSide(s: DreamlandState, cfg: DreamlandConfig): number {
  const k = s.op.side
  return k >= 0 && passable(s, cfg, k) ? k : -1
}

/** 推进 dt 毫秒：操作员一段段往下做，台面的坡度在倾过去与回平时缓入缓出地变，入口按要不要开慢慢开合，传送带按时换向 */
export function stepDreamland(s: DreamlandState, cfg: DreamlandConfig, dt: number): void {
  const plan = s.plan
  s.t += dt
  const op = s.op
  for (let guard = 0; guard < 8 && s.t >= op.until; guard++) {
    s.sx = op.sx1
    s.sy = op.sy1
    advance(s, cfg, plan)
  }
  const p = op.until > op.from ? Math.min(1, Math.max(0, (s.t - op.from) / (op.until - op.from))) : 1
  const e = 0.5 * (1 - Math.cos(Math.PI * p))
  s.sx = op.sx0 + (op.sx1 - op.sx0) * e
  s.sy = op.sy0 + (op.sy1 - op.sy0) * e
  const swing = dt / cfg.gate.swingMs
  for (let k = 0; k < cfg.sides; k++) {
    const g = s.gates[k]!
    s.gates[k] = wantOpen(s, cfg, k) ? Math.min(1, g + swing) : Math.max(0, g - swing)
  }
  stepBelts(s, cfg, dt)
  const slope = s.slope
  const theta = tiltOf(plan, s.sx, s.sy)
  const len = Math.hypot(s.sx, s.sy)
  const g = (GRAVITY * UNIT) / cfg.meterPerU
  slope.gx = len > 0 ? (s.sx / len) * g * Math.sin(theta) : 0
  slope.gy = len > 0 ? (s.sy / len) * g * Math.sin(theta) : 0
  slope.gn = g * Math.cos(theta)
}

/** 传送带：到点先预警，预警完按余弦从原来的方向停下再转到反方向，转完挑下一次换向的时刻；带面按此刻的速度往前走 */
function stepBelts(s: DreamlandState, cfg: DreamlandConfig, dt: number): void {
  const b = s.belts
  const c = cfg.belt
  const turnAt = b.warnAt + c.warnMs
  if (s.t >= turnAt + c.turnMs) {
    b.dir = -b.dir
    b.speed = b.dir
    b.turning = false
    b.warnAt = s.t + between(s.rng, c.flipMs)
  } else if (s.t >= turnAt) {
    b.turning = true
    b.speed = b.dir * Math.cos((Math.PI * (s.t - turnAt)) / c.turnMs)
  }
  const run = (b.speed * c.speedU * UNIT * dt) / 1000
  b.innerRun += run
  b.outerRun -= run
}

/** 传送带此刻在预警换向 */
export function beltWarning(s: DreamlandState): boolean {
  return s.t >= s.belts.warnAt && !s.belts.turning
}

/** (x, y) 处的地面离基准面多高，米：台面以内按此刻的坡度从支点降下去，台面以外是传送带的平地 */
export function floorOf(s: DreamlandState, cfg: DreamlandConfig, x: number, y: number): number {
  const plan = s.plan
  if (gaugeAt(plan, x, y) >= plan.stage) return 0
  return cfg.pivotM - s.sx * (x - plan.cx) - s.sy * (y - plan.cy)
}

/** (x, y) 处传送带带面的速度，像素/秒：内圈顺着这一段的切向走，外圈反着走；台面上与外圈以外为零 */
export function beltAt(s: DreamlandState, cfg: DreamlandConfig, x: number, y: number, out: Point): Point {
  const plan = s.plan
  const g = gaugeAt(plan, x, y)
  if (g < plan.stage || g >= plan.outer) {
    out.x = 0
    out.y = 0
    return out
  }
  const tk = plan.tangents[sectorAt(plan, x, y)]!
  const v = (g < plan.inner ? 1 : -1) * s.belts.speed * cfg.belt.speedU * UNIT
  out.x = tk.x * v
  out.y = tk.y * v
  return out
}
