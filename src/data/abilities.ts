import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import type { AbilityDef } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT = combatJson as unknown as CombatTuning
export const KNOCKBACK = CT.knockback
export const ACQUIRE = CT.acquire

export const ABILITIES = abilitiesJson as unknown as Record<AbilityId, AbilityDef>
