import { query } from 'bitecs'
import { Alive, DmgMul, Dormant, ENEMY_SET, Morph, CharPerk, Radius, Slot, Transform } from '../components'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { boltSource, enemySource } from '../utils/source'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

export function characterContact(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET)
  if (enemies.length === 0) return
  if (sim.over) return
  const now = sim.elapsedMs
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const mx = Transform.x[m]!
    const my = Transform.y[m]!
    const hr = Radius.v[m]!
    for (const eid of enemies) {
      if (Dormant.v[eid]) continue
      const rr = hr + Radius.v[eid]!
      const d = sim.hooks.worldDelta(sim, mx, my, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const def = enemyDef[eid]
      if (!def) continue
      if (def.damage <= 0) continue
      if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue
      if (!hit(sim, enemySource(def.kind, DmgMul.v[eid]!), m, Math.max(1, Math.round(def.damage * DmgMul.v[eid]!)))) continue
      if (CharPerk.thorns[m]! > 0) hit(sim, boltSource(Slot.v[m]!), eid, CharPerk.thorns[m]!)
      if (def.onContact && def.onContact.length > 0) {
        applyAbilityEffects(sim, enemySource(def.kind, 1), def.onContact, {
          x: mx,
          y: my,
          baseDamage: 0,
          targets: [m],
        })
      }
      break
    }
  }
}
