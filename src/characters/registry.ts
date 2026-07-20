import charactersJson from '../assets/characters.json'
import { ABILITIES } from '../abilities/registry'
import type { AbilityId } from '../abilities/registry'
import type { AbilityDef } from '../abilities/defs'
import { WEAPONS } from '../weapons/registry'
import type { AbilityTier, UpgradeCard, WeaponId } from '../weapons/registry'

// 角色花名册：一个角色由若干「攻击来源」（载体）组成——持有的武器（weapons，
// 引用实体武器）与自带的徒手能力（innate，无实体武器，直接引用能力）。
// 每个载体自带升级路径（base + 各档）。运行时把两类载体统一成 Carrier 视图，
// loadoutFor 按当前档位取各载体的生效能力（换持整行）。能力可被复用，身份/升级
// 路径归载体。磁盘形态（characters.json）能力以 id 引用，加载时解析成 def 一次。

/** 徒手能力（角色自带、无实体武器）：与武器并列的另一种攻击来源，自带升级路径 */
export interface InnateSource {
  readonly name: string
  readonly icon: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}

/** 角色磁盘/创作层形态：持有的武器 + 自带的徒手能力两类攻击来源 */
export interface CharacterAuthoring {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly orbit: number
  readonly weapons: readonly WeaponId[]
  readonly innate: readonly InnateSource[]
}

/** 运行时载体：武器与徒手能力统一视图。tiers = [base, 一阶, 二阶]（军医飞针只有 base）；
 * cards = [一阶卡, 二阶卡]（无该档为 null）。weaponId 存在即表示这是一件实体武器。 */
export interface Carrier {
  readonly name: string
  readonly icon: string
  readonly weaponId?: WeaponId
  readonly tiers: readonly AbilityDef[]
  readonly cards: readonly (UpgradeCard | null)[]
}

/** 运行时角色：攻击来源统一为有序的载体列表 */
export interface CharacterDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly orbit: number
  readonly carriers: readonly Carrier[]
}

/** 已解锁的能力档位：u1 = 一阶（下标 0 的卡），u2 = 二阶（下标 1 的卡） */
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}

// 数据行在 defs/characters.ts（创作层），npm run gen 生成 characters.json
export type CharacterId = keyof typeof charactersJson

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

// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 characters/formation.ts；满员后可在整编页切换队形与互换站位。
export const TEAM = {
  ringRadius: 0.8,
  /** 3 人环收紧的小半径（人少时更像一个整体）；≥4 人用 ringRadius */
  smallRingRadius: 0.58,
  /** 2 人阵的左右圆心距（紧凑贴身，允许轻微视觉重叠）；1~2 人不环绕 */
  pairGap: 1.1,
  moveSpeed: 5.5,
  reviveMs: 10_000,
  /** N 保 1 中心的受击判定半径系数：被保护的实际收益（碰撞圆减半更难被摸到） */
  guardCenterHurtboxMul: 0.5,
} as const

export const MEMBER = {
  size: 1.2,
  radius: 0.45,
  maxHp: 100,
  // 波次制要求整波存活，受击间隔放宽让「蹭到怪」是磨损而非速死
  iframesMs: 700,
} as const
