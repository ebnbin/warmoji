import { TEAM } from '../../../data/characters'
import { toFront } from '../../../run/state'
import { Alive, CharScale, Facing, Motion, MOTION, Seat, Slot, Transform } from '../../components'
import { charSize, rescale } from './scale'
import { grantIframe } from './combat'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import { handoverMs } from './squad'
import { switchBlock } from '../../fight/state'

const ZERO: Point = { x: 0, y: 0 }

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

/** 交接进度的缓动值 0→1；不在交接中为 1 */
function handoverEase(sim: Sim): number {
  const h = sim.handover
  return h ? smooth(1 - h.msLeft / h.ms) : 1
}

/** 相机锚点相对队长的偏移：从旧队长的位置滑向新队长 */
export function handoverCamOffset(sim: Sim): Point {
  const h = sim.handover
  if (!h) return ZERO
  const k = 1 - handoverEase(sim)
  return { x: h.camX * k, y: h.camY * k }
}

/** 阵亡者不走动画系统，尺寸随倍率直接改 */
function setScale(sim: Sim, eid: number, s: number): void {
  CharScale.v[eid] = s
  rescale(sim.world, eid)
  if (Alive.v[eid]) return
  Transform.w[eid] = charSize(eid)
  Transform.h[eid] = charSize(eid)
}

export function finishHandover(sim: Sim): void {
  const h = sim.handover
  if (!h) return
  setScale(sim, h.from, TEAM.followerSizeMul)
  setScale(sim, h.to, TEAM.leaderSizeMul)
  sim.handover = null
}

/** 玩家这会儿能不能手动把队长换成 eid：这一场的规则许换、不在冷却，交接与动作都结束了 */
export function canSwitchLeader(sim: Sim, eid: number): boolean {
  const lead = sim.leader
  return (
    lead >= 0 &&
    switchBlock(sim) === null &&
    !sim.over &&
    !sim.handover &&
    Motion.kind[lead] === MOTION.none &&
    Motion.kind[eid] === MOTION.none &&
    eid !== lead &&
    sim.characters.includes(eid) &&
    Alive.v[eid] === 1
  )
}

/** 立刻换队长：他排到隐藏顺序的队首；中心、朝向与目标位当帧切到新队长；尺寸、相机与免伤在交接期内过渡 */
export function switchLeader(sim: Sim, eid: number): void {
  finishHandover(sim)
  toFront(sim.run, sim.run.roster[Slot.v[eid]!]!)
  const from = sim.leader
  const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, Transform.x[from]!, Transform.y[from]!)
  sim.leader = eid
  const fx = Facing.x[eid]!
  const fy = Facing.y[eid]!
  if (fx !== 0 || fy !== 0) sim.heading = { x: fx, y: fy }
  for (const e of [from, eid]) Seat.v[e] = -1
  const ms = handoverMs()
  grantIframe(sim, eid, ms)
  sim.handover = { msLeft: ms, ms, from, to: eid, fromScale: CharScale.v[from]!, toScale: CharScale.v[eid]!, camX: d.x, camY: d.y }
}

/** 隐藏顺序里第一个站着的队员，从队首往后找，except 不算；都倒着是 -1 */
export function firstUp(sim: Sim, except = -1): number {
  for (const id of sim.run.order) {
    const m = sim.characters[sim.run.roster.indexOf(id)]
    if (m !== undefined && m !== except && Alive.v[m]) return m
  }
  return -1
}

/** 队长倒下就交给隐藏顺序里下一个站着的队员；交接期内按真实时间推进尺寸插值 */
export function stepHandover(sim: Sim): void {
  const leader = sim.leader
  if (leader < 0 || sim.over) return
  if (!Alive.v[leader]) {
    const next = firstUp(sim)
    if (next >= 0) switchLeader(sim, next)
  }
  const h = sim.handover
  if (!h) return
  h.msLeft -= sim.dtMs
  if (h.msLeft <= 0) return finishHandover(sim)
  const s = handoverEase(sim)
  setScale(sim, h.from, h.fromScale + (TEAM.followerSizeMul - h.fromScale) * s)
  setScale(sim, h.to, h.toScale + (TEAM.leaderSizeMul - h.toScale) * s)
}
