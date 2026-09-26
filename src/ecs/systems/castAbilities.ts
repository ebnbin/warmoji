import { hasComponent, query, removeComponent } from 'bitecs'
import { Ability, CastRequest, Cd, Manual } from '../components'
import { fireAbility } from './shared/fire'
import { ready, spend } from './shared/avail'
import type { Sim } from '../sim'

/** 自动能力：能出手就出手，出了手再记账；没出成手下一帧再试 */
export function castAbilities(sim: Sim): void {
  for (const e of [...query(sim.world, [Ability, Cd])]) {
    if (!hasComponent(sim.world, e, Ability)) continue
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      if (ready(sim, e) && fireAbility(sim, e)) spend(sim, e)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    if (!ready(sim, e) || !fireAbility(sim, e)) continue
    spend(sim, e)
  }
}

/** 手动能力只在被请求时出手 */
export function castRequests(sim: Sim): void {
  for (const e of [...query(sim.world, [Ability, Manual, CastRequest])]) {
    if (!hasComponent(sim.world, e, CastRequest)) continue
    removeComponent(sim.world, e, CastRequest)
    if (ready(sim, e) && fireAbility(sim, e)) spend(sim, e)
  }
}
