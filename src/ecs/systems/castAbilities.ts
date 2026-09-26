import { hasComponent, query, removeComponent } from 'bitecs'
import { Ability, CastRequest, Cd, Disarmed, Frozen, Manual } from '../components'
import { cooldownMul } from '../utils/amp'
import { busy, fireAbility } from './shared/fire'
import type { Sim } from '../sim'

/** 自动能力：冷却到了、没被冻结缴械、手头没事就出手；没出成手下一帧再试 */
export function castAbilities(sim: Sim): void {
  for (const e of [...query(sim.world, [Ability, Cd])]) {
    if (!hasComponent(sim.world, e, Ability)) continue
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      fireAbility(sim, e)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    if (Frozen.v[e] || Disarmed.v[e] || Cd.left[e]! > 0 || busy(sim, e)) continue
    if (!fireAbility(sim, e)) continue
    if (Cd.base[e]! > 0) Cd.left[e] = Cd.base[e]! * cooldownMul(sim, e)
  }
}

/** 手动能力只在被请求时出手 */
export function castRequests(sim: Sim): void {
  for (const e of [...query(sim.world, [Ability, Manual, CastRequest])]) {
    if (!hasComponent(sim.world, e, CastRequest)) continue
    removeComponent(sim.world, e, CastRequest)
    fireAbility(sim, e)
  }
}
