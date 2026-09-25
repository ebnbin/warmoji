import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Step, Transform } from '../components'
import type { Sim } from '../sim'

export function commitEnemySteps(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    const ox = Transform.x[eid]!
    const oy = Transform.y[eid]!
    const conf = sim.hooks.confineEnemyStep(sim, eid, Step.x[eid]!, Step.y[eid]!)
    const fixed = sim.hooks.constrainEnemy(sim, eid, ox + conf.x, oy + conf.y)
    Transform.x[eid] = fixed.x
    Transform.y[eid] = fixed.y
  }
}
