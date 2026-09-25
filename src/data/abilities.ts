import { ABILITIES as ABILITY_TABLE } from '../../defs/abilities'
import { COMBAT } from '../../defs/combat'
import type { AbilityDef } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT: CombatTuning = COMBAT
export const KNOCKBACK = CT.knockback
export const ACQUIRE = CT.acquire

export const ABILITIES: Record<AbilityId, AbilityDef> = ABILITY_TABLE

export function abilityPiercesWalls(def: AbilityDef): boolean {
  return 'piercesWalls' in def && def.piercesWalls === true
}
