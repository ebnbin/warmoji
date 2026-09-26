import { Not, query } from 'bitecs'
import { Alive, Radius, Proj, Projectile, SweptHit, Transform } from '../components'
import { hit } from './shared/damage'
import { enemySource, WORLD_SOURCE } from '../utils/source'
import { cullProjectile } from './shared/projectile'
import { projSrcEnemy } from '../store'
import type { Sim } from '../sim'

export function hitDirectProjectiles(sim: Sim): void {
  if (sim.over) return
  for (const eid of [...query(sim.world, [Projectile, Proj, Transform, Not(SweptHit)])]) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const pr = Proj.radius[eid]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const rr = pr + Radius.v[m]!
      const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const kind = projSrcEnemy[eid]
      hit(sim, kind ? enemySource(kind, 1) : WORLD_SOURCE, m, Proj.damage[eid]!)
      cullProjectile(sim, eid)
      break
    }
  }
}
