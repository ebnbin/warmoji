import charactersJson from '../assets/characters.json'
import teamJson from '../assets/team.json'
import { ABILITIES } from './abilities'

import type { AbilityDef } from '../types/abilityDefs'
import { WEAPONS } from './weapons'
import type { UpgradeCard, WeaponId } from '../types/weapons'
import type { Carrier, CharacterAuthoring, CharacterDef, CharacterId, InnateSource, TeamBaseline, UpgradeTiers } from '../types/characters'

// 角色花名册：一个角色由若干「攻击来源」（载体）组成——持有的武器（weapons，
// 引用实体武器）与自带的徒手能力（innate，无实体武器，直接引用能力）。
// 每个载体自带升级路径（base + 各档）。运行时把两类载体统一成 Carrier 视图，
// loadoutFor 按当前档位取各载体的生效能力（换持整行）。能力可被复用，身份/升级
// 路径归载体。磁盘形态（characters.json）能力以 id 引用，加载时解析成 def 一次。

function tierLevel(tiers: UpgradeTiers): 0 | 1 | 2 {
  return tiers.u2 ? 2 : tiers.u1 ? 1 : 0
}

function weaponCarrier(wid: WeaponId): Carrier {
  const w = WEAPONS[wid]
  return {
    name: w.name,
    icon: w.emoji,
    weaponId: wid,
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

/** id 引用 → def：加载时一次性解析（能力表/武器表由 gen 校验，此处断言收口） */
function hydrateCharacter(src: CharacterAuthoring): CharacterDef {
  return {
    emoji: src.emoji,
    name: src.name,
    desc: src.desc,
    orbit: src.orbit,
    carriers: [...src.weapons.map(weaponCarrier), ...src.innate.map(innateCarrier)],
  }
}

export const CHARACTERS = Object.fromEntries(
  Object.entries(charactersJson as unknown as Record<CharacterId, CharacterAuthoring>).map(
    ([id, src]) => [id, hydrateCharacter(src)],
  ),
) as Record<CharacterId, CharacterDef>
export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]

/** 载体在指定档位的生效能力（无该档停留最高档，如军医飞针无升级恒 base） */
function carrierAbility(c: Carrier, level: 0 | 1 | 2): AbilityDef {
  return c.tiers[Math.min(level, c.tiers.length - 1)]!
}

/** 生效配装：各载体在当前档位的能力（升级卡质变 = 换持整行；未解锁用基础行） */
export function loadoutFor(def: CharacterDef, tiers: UpgradeTiers): readonly AbilityDef[] {
  const level = tierLevel(tiers)
  return def.carriers.map((c) => carrierAbility(c, level))
}

/** 基础配装（0 档全体载体）：道具池推导 / 资源预载用 */
export function baseLoadout(def: CharacterDef): readonly AbilityDef[] {
  return def.carriers.map((c) => c.tiers[0]!)
}

/** 角色两档升级卡（多载体同档取首个有升级的载体，gen 已校验同档一致） */
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

const TB = teamJson as unknown as TeamBaseline
export const TEAM = TB.team
export const MEMBER = TB.member
