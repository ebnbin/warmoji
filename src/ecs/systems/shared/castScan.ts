import { hasComponent, query, removeComponent } from 'bitecs'
import { cooldownMul } from '../../utils/amp'
import { Ability, CastRequest, Disarmed, Fired, Frozen, Manual } from '../../components'
import type { CdComp } from '../../components'
import type { Sim } from '../../sim'

export function castScan(sim: Sim, comp: object & CdComp, cast: (eid: number) => boolean | void): void {
  for (const e of [...query(sim.world, [Ability, comp])]) {
    if (!hasComponent(sim.world, e, Ability)) continue
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      cast(e)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    if (Frozen.v[e] || Disarmed.v[e] || comp.cdLeft[e]! > 0) continue
    if (cast(e) === false) continue
    if (hasComponent(sim.world, e, Fired)) Fired.v[e] = 1
    if (comp.cdBase[e]! > 0) comp.cdLeft[e] = comp.cdBase[e]! * cooldownMul(sim, e)
  }
}

export function castRequested(sim: Sim, comp: object & CdComp, cast: (eid: number) => boolean | void): void {
  for (const e of [...query(sim.world, [Ability, comp, CastRequest])]) {
    if (!hasComponent(sim.world, e, CastRequest)) continue
    removeComponent(sim.world, e, CastRequest)
    cast(e)
  }
}
