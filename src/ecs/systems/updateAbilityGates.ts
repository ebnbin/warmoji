import { query } from 'bitecs'
import { Ability, Alive, Disarmed, Dormant, Frozen, MARK, Owner } from '../components'
import { hasMark } from '../utils/marks'
import type { Sim } from '../sim'

/** 宿主倒下或休眠则能力冻结；宿主变形或定身则缴械，不分阵营 */
export function updateAbilityGates(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    Disarmed.v[e] = hasMark(sim, o, MARK.morph) || hasMark(sim, o, MARK.stun) ? 1 : 0
  }
}
