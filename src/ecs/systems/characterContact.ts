import { hasComponent, query } from 'bitecs'
import { Alive, DmgMul, Dormant, Enemy, ENEMY_SET, Hurt, Iframe, Morph, CharPerk, Radius, Slot, Transform } from '../components'
import { applyDamage, hurtCharacter } from './shared/combat'
import { applyAbilityEffects } from './shared/effects'
import { enemySource } from '../utils/source'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

export function characterContact(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  if (enemies.length === 0) return
  if (sim.over) return
  const now = sim.elapsedMs
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
    const mx = Transform.x[m]!
    const my = Transform.y[m]!
    const hr = Hurt.radius[m]!
    for (const eid of enemies) {
      if (Dormant.v[eid]) continue // 休眠者不判
      const rr = hr + Radius.v[eid]!
      const d = sim.hooks.worldDelta(sim, mx, my, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const def = enemyDef[eid]
      if (!def) continue
      if (def.damage <= 0) continue // damage = 0 的诱饵尸壳无害
      if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue // 变形期无害
      Iframe.last[m] = now
      hurtCharacter(sim, m, Math.max(1, Math.round(def.damage * DmgMul.v[eid]!)), def.name)
      if (CharPerk.thorns[m]! > 0 && hasComponent(sim.world, eid, Enemy)) {
        applyDamage(sim, eid, CharPerk.thorns[m]!, 0, undefined, undefined, Slot.v[m]!)
      }
      // onContact 只含伤害之外的效果，伤害已在上面结算
      if (def.onContact && def.onContact.length > 0) {
        applyAbilityEffects(sim, enemySource(def.name, 1), def.onContact, {
          x: mx,
          y: my,
          baseDamage: 0,
          targets: [m],
        })
      }
      break // 一帧一员只吃一次
    }
  }
}
