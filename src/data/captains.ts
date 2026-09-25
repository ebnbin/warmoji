import captainsJson from '../assets/captains.json'
import { fromJson } from './json'
import { keysOf, mapValues } from '../util/record'
import { ABILITIES } from './abilities'
import type { AbilityId } from '../types/abilities'
import type { AbilityDef } from '../types/abilityDefs'
import type { CaptainDef, CaptainId, CaptainSource } from '../types/captains'

const resolveAbilities = (ids: readonly AbilityId[]): AbilityDef[] => ids.map((id) => ABILITIES[id])

function hydrateCaptain(src: CaptainSource): CaptainDef {
  return { ...src, skill: { ...src.skill, abilities: resolveAbilities(src.skill.abilities) } }
}

const CAPTAIN_TABLE = fromJson<Record<CaptainId, CaptainSource>>(captainsJson)
export const CAPTAINS: Record<CaptainId, CaptainDef> = mapValues(CAPTAIN_TABLE, hydrateCaptain)
export const CAPTAIN_IDS: readonly CaptainId[] = keysOf(CAPTAINS)

export const SANDBOX_CAPTAIN: CaptainId = 'tester'

export const PICKABLE_CAPTAIN_IDS = CAPTAIN_IDS.filter((id) => id !== SANDBOX_CAPTAIN)
