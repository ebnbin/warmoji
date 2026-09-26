import { query } from 'bitecs'
import { Ability, AbilityClass, Alive, Ctl, Disarmed, Dormant, Frozen, Owner } from '../components'
import type { Sim } from '../sim'

/** 宿主倒下或休眠则能力冻结；技能看宿主这一帧能不能施放，普通出手看能不能出手，不分阵营 */
export function updateAbilityGates(sim: Sim): void {
  for (const e of query(sim.world, [Ability, AbilityClass, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    Disarmed.v[e] = (AbilityClass.skill[e] ? Ctl.cast[o] : Ctl.act[o]) === 1 ? 0 : 1
  }
}
