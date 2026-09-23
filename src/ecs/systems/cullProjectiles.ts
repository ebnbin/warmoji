import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { Proj, PROJ_SET, Transform, ViewCull, WorldCull } from '../components'
import { cullProjectile } from './shared/projectile'
import type { Sim } from '../sim'

export function cullProjectiles(sim: Sim): void {
  const now = sim.elapsedMs
  const view = sim.view
  const slack = 4 * UNIT
  for (const eid of [...query(sim.world, PROJ_SET as unknown as object[])]) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (now >= Proj.dieAt[eid]!) {
      cullProjectile(sim, eid)
      continue
    }
    if (
      hasComponent(sim.world, eid, ViewCull) &&
      (x < view.x - slack || x > view.right + slack || y < view.y - slack || y > view.bottom + slack)
    ) {
      cullProjectile(sim, eid)
      continue
    }
    if (hasComponent(sim.world, eid, WorldCull) && sim.hooks.cullEnemyProjectile(sim, x, y)) {
      cullProjectile(sim, eid)
    }
  }
}
