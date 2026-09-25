import { query } from 'bitecs'
import { Dormant, ENEMY_SET, FACTION, Transform, Zone, ZoneChill, ZoneSlow } from '../components'
import type { Sim } from '../sim'

export function applySlowZones(sim: Sim): void {
  const chills = query(sim.world, [Zone, ZoneChill, Transform])
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    let mul = 1
    for (const z of chills) {
      if (Zone.on[z] === 0 || Zone.faction[z] === FACTION.enemy) continue
      const r = Zone.radius[z]!
      const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, Transform.x[z]!, Transform.y[z]!)
      if (d.x * d.x + d.y * d.y <= r * r) mul *= ZoneChill.factor[z]!
    }
    ZoneSlow.v[eid] = mul
  }
}
