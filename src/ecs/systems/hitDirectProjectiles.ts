import { Not, query } from 'bitecs'
import { Alive, Radius, Iframe, Proj, Projectile, SweptHit, Transform } from '../components'
import { hurtCharacter } from './shared/combat'
import { cullProjectile } from './shared/projectile'
import { projSrcEnemy } from '../store'
import type { Sim } from '../sim'

export function hitDirectProjectiles(sim: Sim): void {
  if (sim.over) return
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [Projectile, Proj, Transform, Not(SweptHit)])]) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const pr = Proj.radius[eid]!
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const rr = pr + Radius.v[m]!
      const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      if (now - Iframe.last[m]! >= Iframe.ms[m]!) {
        Iframe.last[m] = now
        hurtCharacter(sim, m, Proj.damage[eid]!, projSrcEnemy[eid])
      }
      cullProjectile(sim, eid)
      break
    }
  }
}
