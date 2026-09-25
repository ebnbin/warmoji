import { CRIT_MUL } from '../../../data/items'
import { Alive, FACTION, Iframe } from '../../components'
import { applyDamage, hurtCharacter } from './combat'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

export function damageTarget(
  sim: Sim,
  src: Source,
  target: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
): void {
  if (src.faction === FACTION.enemy) {
    if (sim.over || !Alive.v[target]) return
    if (sim.elapsedMs - Iframe.last[target]! < Iframe.ms[target]!) return
    Iframe.last[target] = sim.elapsedMs
    hurtCharacter(sim, target, damage, src.enemy)
    return
  }
  const chance = Math.min(0.5, src.crit)
  const crit = chance > 0 && sim.rng.next() < chance
  const dmg = crit ? Math.round(damage * CRIT_MUL) : damage
  applyDamage(sim, target, dmg, knockback * src.kb, srcX, srcY, src.slot, crit)
}
