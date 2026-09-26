import { query } from 'bitecs'
import { Ability, Alive, Ctl, Disarmed, Dormant, Frozen, Owner } from '../components'
import type { Sim } from '../sim'

/** 宿主倒下或休眠则能力冻结；宿主这一帧不能出手则缴械，不分阵营 */
export function updateAbilityGates(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    Disarmed.v[e] = Ctl.act[o] === 1 ? 0 : 1
  }
}
