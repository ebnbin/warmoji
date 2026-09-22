import captainsJson from '../assets/captains.json'
import { ABILITIES } from './abilities'
import type { AbilityId } from '../types/abilities'
import type { AbilityDef } from '../types/abilityDefs'
import type { CaptainDef, CaptainId, CaptainSource } from '../types/captains'

const resolveAbilities = (ids: readonly AbilityId[]): AbilityDef[] => ids.map((id) => ABILITIES[id]!)

function hydrateCaptain(src: CaptainSource): CaptainDef {
  return { ...src, skill: { ...src.skill, abilities: resolveAbilities(src.skill.abilities) } }
}

export const CAPTAINS = Object.fromEntries(
  Object.entries(captainsJson as unknown as Record<CaptainId, CaptainSource>).map(
    ([id, src]) => [id, hydrateCaptain(src)],
  ),
) as Record<CaptainId, CaptainDef>
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

/** 不进队长选择页 */
export const SANDBOX_CAPTAIN: CaptainId = 'tester'

export const PICKABLE_CAPTAIN_IDS = CAPTAIN_IDS.filter((id) => id !== SANDBOX_CAPTAIN)
