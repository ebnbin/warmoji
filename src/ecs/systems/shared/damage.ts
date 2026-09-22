import { CRIT_MUL } from '../../../data/items'
import { Alive, FACTION, Iframe } from '../../components'
import { applyDamage, hurtCharacter } from './combat'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

/** 施伤唯一入口：队伍侧打敌人走暴击 + 击退，敌方侧打队员吃无敌帧节流 */
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
    hurtCharacter(sim, target, damage, src.name)
    return
  }
  const chance = Math.min(0.5, src.crit)
  const crit = chance > 0 && sim.rng.next() < chance
  const dmg = crit ? Math.round(damage * CRIT_MUL) : damage
  applyDamage(sim, target, dmg, knockback * src.kb, srcX, srcY, src.slot, crit)
}
