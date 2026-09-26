import { addComponent, hasComponent, query } from 'bitecs'
import { Ability, Casting, CastRequest, Cd, Hold, Motion, MOTION, Owner, RepeatState, WindupState } from '../../components'
import { endMotion } from './displace'
import type { Sim } from '../../sim'

/** 请求一条手动能力出手；按住蓄力的带上蓄了几成 */
export function requestCast(sim: Sim, e: number, holdRatio = 0): void {
  if (hasComponent(sim.world, e, Hold)) Hold.ratio[e] = Math.max(0, Math.min(1, holdRatio))
  addComponent(sim.world, e, CastRequest)
}

export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const e of query(sim.world, [Ability, Cd, Owner])) {
    if (Owner.eid[e] === ownerEid) Cd.left[e] = Math.max(Cd.left[e]!, ms)
  }
}

/** 打断：自己的冲刺停下，蓄力与延迟重复作废 */
export function interrupt(sim: Sim, eid: number): void {
  if (Motion.kind[eid] === MOTION.dash && Motion.self[eid]) endMotion(eid)
  Casting.until[eid] = 0
  for (const e of query(sim.world, [Ability, Owner])) {
    if (Owner.eid[e] !== eid) continue
    WindupState.until[e] = 0
    RepeatState.left[e] = 0
  }
}
