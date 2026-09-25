import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import { fromJson } from './json'
import type { AbilityDef } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT = fromJson<CombatTuning>(combatJson)
export const KNOCKBACK = CT.knockback
export const ACQUIRE = CT.acquire

export const ABILITIES = fromJson<Record<AbilityId, AbilityDef>>(abilitiesJson)

export function abilityPiercesWalls(def: AbilityDef): boolean {
  return 'piercesWalls' in def && def.piercesWalls === true
}
