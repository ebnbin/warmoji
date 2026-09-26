import { addComponent, query } from 'bitecs'
import { Ability, Casting, CastRequest, Cd, Manual, Motion, MOTION, Owner, RepeatState, WindupState } from '../../components'
import { endMotion } from './displace'
import type { Sim } from '../../sim'

export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
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
