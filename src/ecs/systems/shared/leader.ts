import { TEAM } from '../../../data/characters'
import { Alive, CharScale, Facing, Motion, MOTION, Seat, Transform } from '../../components'
import { charSize, rescale } from './scale'
import { grantIframe } from './combat'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import { handoverMs } from './squad'

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
  rescale(sim, eid)
  if (Alive.v[eid]) return
  Transform.w[eid] = charSize(eid)
  Transform.h[eid] = charSize(eid)
}

function finishHandover(sim: Sim): void {
  const h = sim.handover
  if (!h) return
  setScale(sim, h.from, TEAM.followerSizeMul)
  setScale(sim, h.to, TEAM.leaderSizeMul)
  sim.handover = null
}

export function canSwitchLeader(sim: Sim, eid: number): boolean {
  const lead = sim.leader
  return (
    lead >= 0 &&
    !sim.over &&
    !sim.handover &&
    Motion.kind[lead] === MOTION.none &&
    Motion.kind[eid] === MOTION.none &&
    eid !== lead &&
    sim.characters.includes(eid) &&
    Alive.v[eid] === 1
  )
}

/** 立刻换队长：中心、朝向与目标位当帧切到新队长；尺寸、相机与免伤在交接期内过渡 */
export function switchLeader(sim: Sim, eid: number): void {
  finishHandover(sim)
  const from = sim.leader
  const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, Transform.x[from]!, Transform.y[from]!)
  sim.leader = eid
  const fx = Facing.x[eid]!
  const fy = Facing.y[eid]!
  if (fx !== 0 || fy !== 0) sim.heading = { x: fx, y: fy }
  for (const e of [from, eid]) {
    Seat.v[e] = -1
    Seat.ghost[e] = 0
  }
  // 扇形整体搬家：阵亡者重新预订最近的空位，按归位速度过去而不是瞬移
  for (const f of sim.characters) if (!Alive.v[f]) Seat.ghost[f] = 0
  const ms = handoverMs()
  grantIframe(sim, eid, ms)
  sim.handover = { msLeft: ms, ms, from, to: eid, fromScale: CharScale.v[from]!, toScale: CharScale.v[eid]!, camX: d.x, camY: d.y }
}

function nearestAlive(sim: Sim, x: number, y: number): number {
  let best = -1
  let bestD = Infinity
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    const dist = Math.hypot(d.x, d.y)
    if (dist < bestD) {
      bestD = dist
      best = m
    }
  }
  return best
}

/** 队长阵亡则交给最近的存活队员；交接期内按真实时间推进尺寸插值 */
export function stepHandover(sim: Sim): void {
  const leader = sim.leader
  if (leader < 0 || sim.over) return
  if (!Alive.v[leader]) {
    const next = nearestAlive(sim, Transform.x[leader]!, Transform.y[leader]!)
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
