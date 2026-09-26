import charactersJson from '../assets/characters.json'
import teamJson from '../assets/team.json'
import { fromJson } from './json'
import { keysOf, mapValues } from '../util/record'
import { ABILITIES } from './abilities'

import type { AbilityDef } from '../types/abilityDefs'
import { WEAPONS } from './weapons'
import type { UpgradeCard, WeaponId } from '../types/weapons'
import type { Carrier, CharacterAuthoring, CharacterDef, CharacterId, InnateSource, TeamBaseline, UpgradeTiers } from '../types/characters'

function tierLevel(tiers: UpgradeTiers): 0 | 1 | 2 {
  return tiers.u2 ? 2 : tiers.u1 ? 1 : 0
}

function weaponCarrier(wid: WeaponId): Carrier {
  const w = WEAPONS[wid]
  return {
    name: w.name,
    icon: w.emoji,
    tiers: [w.base, ...w.upgrades.map((u) => u.ability)],
    cards: [w.upgrades[0]?.card ?? null, w.upgrades[1]?.card ?? null],
  }
}

function innateCarrier(i: InnateSource): Carrier {
  return {
    name: i.name,
    icon: i.icon,
    tiers: [ABILITIES[i.base], ...i.upgrades.map((u) => ABILITIES[u.ability])],
    cards: [i.upgrades[0]?.card ?? null, i.upgrades[1]?.card ?? null],
  }
}

function hydrateCharacter(src: CharacterAuthoring): CharacterDef {
  return {
    emoji: src.emoji,
    name: src.name,
    desc: src.desc,
    body: src.body,
    magnet: src.magnet,
    skill: { ...src.skill, ability: ABILITIES[src.skill.ability], aim: src.skill.aim === true },
    carriers: [...src.weapons.map(weaponCarrier), ...src.innate.map(innateCarrier)],
    resource: src.resource,
    rules: src.rules,
    forms: src.forms,
  }
}

const CHARACTER_TABLE = fromJson<Record<CharacterId, CharacterAuthoring>>(charactersJson)
export const CHARACTERS: Record<CharacterId, CharacterDef> = mapValues(CHARACTER_TABLE, hydrateCharacter)
export const ROSTER_IDS: readonly CharacterId[] = keysOf(CHARACTERS)

function carrierAbility(c: Carrier, level: 0 | 1 | 2): AbilityDef {
  return c.tiers[Math.min(level, c.tiers.length - 1)]!
}

export function loadoutFor(def: CharacterDef, tiers: UpgradeTiers): readonly AbilityDef[] {
  const level = tierLevel(tiers)
  return def.carriers.map((c) => carrierAbility(c, level))
}

export function baseLoadout(def: CharacterDef): readonly AbilityDef[] {
  return def.carriers.map((c) => c.tiers[0]!)
}

export function upgradeCardsFor(def: CharacterDef): readonly [UpgradeCard, UpgradeCard] {
  const pick = (k: 0 | 1): UpgradeCard => {
    for (const c of def.carriers) {
      const card = c.cards[k]
      if (card) return card
    }
    throw new Error('角色缺升级档')
  }
  return [pick(0), pick(1)]
}

const TB = fromJson<TeamBaseline>(teamJson)
export const TEAM = TB.team
export const MEMBER = TB.member
