import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import type { AbilityDef } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT = combatJson as unknown as CombatTuning
export const KNOCKBACK = CT.knockback
export const ACQUIRE = CT.acquire

export const ABILITIES = abilitiesJson as unknown as Record<AbilityId, AbilityDef>

/** 该能力是否穿墙攻击（残垣图：索敌不被断壁遮挡）。缺省即不穿墙。
 * 属于「这个 def 长什么样」而非「这一发打中了谁」，故与表同层 */
export function abilityPiercesWalls(def: AbilityDef): boolean {
  return 'piercesWalls' in def && def.piercesWalls === true
}
