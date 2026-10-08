import charactersJson from '../assets/characters.json'
import rosterJson from '../assets/roster.json'
import teamJson from '../assets/team.json'
import { fromJson } from './json'
import { mapValues } from '../util/record'
import { ABILITIES } from './abilities'

import type { AbilityDef } from '../types/abilityDefs'
import { WEAPONS } from './weapons'
import type { UpgradeCard, WeaponId } from '../types/weapons'
import type { Carrier, CharacterAuthoring, CharacterDef, CharacterId, InnateSource, TeamBaseline } from '../types/characters'
import { MAX_CHAR_LEVEL } from './charLevel'
import { foldStats } from './stats'
import { ROLES } from './roles'
import type { StatBase, StatMods, StatValues } from '../types/stats'

function weaponCarrier(wid: WeaponId): Carrier {
  const w = WEAPONS[wid]
  return {
    name: w.name,
    icon: w.emoji,
    tiers: [w.base, ...w.upgrades.map((u) => u.ability)],
    cards: w.upgrades.map((u) => u.card),
  }
}

function innateCarrier(i: InnateSource): Carrier {
  return {
    name: i.name,
    icon: i.icon,
    tiers: [ABILITIES[i.base], ...i.upgrades.map((u) => ABILITIES[u.ability])],
    cards: i.upgrades.map((u) => u.card),
  }
}

function hydrateCharacter(src: CharacterAuthoring): CharacterDef {
  const { skill, weapons, innate, instincts, ...unit } = src
  return {
    ...unit,
    skill: { ...skill, ability: ABILITIES[skill.ability], aim: skill.aim === true },
    carriers: [...weapons.map(weaponCarrier), ...innate.map(innateCarrier)],
    instincts: instincts ?? ROLES[src.role].instincts,
  }
}

const CHARACTER_TABLE = fromJson<Record<CharacterId, CharacterAuthoring>>(charactersJson)
export const CHARACTERS: Record<CharacterId, CharacterDef> = mapValues(CHARACTER_TABLE, hydrateCharacter)
const ROSTER = fromJson<{ readonly characters: readonly CharacterId[]; readonly legacyCharacters: readonly CharacterId[] }>(rosterJson)
/** 新角色：选角、招募与沙盒只列它们，按地图的先后 */
export const ROSTER_IDS: readonly CharacterId[] = ROSTER.characters
/** 旧角色：只给旧关卡的预设队伍与图鉴的旧角色页用 */
export const LEGACY_ROSTER_IDS: readonly CharacterId[] = ROSTER.legacyCharacters

/** 角色在这一级时各载体用的能力 */
export function loadoutFor(def: CharacterDef, level: number): readonly AbilityDef[] {
  return def.carriers.map((c) => c.tiers[Math.min(Math.min(level, MAX_CHAR_LEVEL), c.tiers.length) - 1]!)
}

export function baseLoadout(def: CharacterDef): readonly AbilityDef[] {
  return def.carriers.map((c) => c.tiers[0]!)
}

/** 2 级起每一级亮出的升级卡：取第一件在这一级有卡的载体 */
export function upgradeCardsFor(def: CharacterDef): readonly UpgradeCard[] {
  return Array.from({ length: MAX_CHAR_LEVEL - 1 }, (_, k) => {
    for (const c of def.carriers) {
      const card = c.cards[k]
      if (card) return card
    }
    throw new Error('角色缺升级档')
  })
}

const TB = fromJson<TeamBaseline>(teamJson)
export const TEAM = TB.team
export const MEMBER = TB.member
export const INSTINCT = TB.instinct

/** 角色的基础属性：全队通用的一份，再盖上角色自己写的 */
export function memberBase(def: CharacterDef): StatBase {
  return { ...MEMBER.stats, ...def.stats }
}

/** 角色战斗外的属性表：基础属性加上定位、道具与等级 */
export function memberStats(def: CharacterDef, gear: readonly StatMods[] = []): StatValues {
  return foldStats(memberBase(def), [ROLES[def.role].stats, ...gear])
}
