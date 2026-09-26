import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import { fromJson } from './json'
import type { AbilityDef } from '../types/abilityDefs'
import type { AbilityId, CombatTuning } from '../types/abilities'

const CT = fromJson<CombatTuning>(combatJson)
export const KNOCKBACK = CT.knockback
export const ENEMY_BODY = CT.enemyBody
export const BODY_MAX_SPEED = CT.knockback.maxSpeed
/** 击退位移 = 冲量 × 身体时间常数 */
export const KNOCKBACK_TAU_MS = (ENEMY_BODY.mass / (ENEMY_BODY.drag * ENEMY_BODY.grip)) * 1000
export const ACQUIRE = CT.acquire

export const ABILITIES = fromJson<Record<AbilityId, AbilityDef>>(abilitiesJson)

export function abilityPiercesWalls(def: AbilityDef): boolean {
  return 'piercesWalls' in def && def.piercesWalls === true
}
