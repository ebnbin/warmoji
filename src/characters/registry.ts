import charactersJson from '../gen/characters.json'
import type { AbilityDef } from '../abilities/defs'

// 角色花名册：角色 → 能力为单向绑定（角色配装固定；能力可被复用）。
// 两阶专属升级随角色归行：卡文案 + 解锁后的生效配装都是角色自己的属性，
// 商店升级卡条目（items/registry upgradeCard）从这里取文案。

/** 角色的一阶专属升级：商店卡文案 + 解锁后的生效配装（换持整行） */
export interface CharacterUpgrade {
  readonly icon: string
  readonly name: string
  readonly desc: string
  readonly abilities: readonly AbilityDef[]
}

/** 已解锁的能力档位：u1 = 一阶（下标 0 的卡），u2 = 二阶（下标 1 的卡） */
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}

export interface CharacterDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly abilities: readonly AbilityDef[]
  /** 两阶专属升级（商店专属卡解锁，累积生效）：[一阶, 一阶+二阶]，
   * 每档 = 卡文案 + 该档整套配装。升级 = 换持整行（abilities/registry 的
   * `2`/`3` 档位行），能力自身无升级逻辑 */
  readonly upgrades: readonly [CharacterUpgrade, CharacterUpgrade]
  /** 环形阵移动秉性：>0 沿环迎敌滑动，<0 避敌滑动，0 安分（被推才动）；见 characters/orbit.ts */
  readonly orbit: number
}

// 数据行在 defs/characters.ts（创作层），npm run gen 生成 characters.json
export type CharacterId = keyof typeof charactersJson
export const CHARACTERS = charactersJson as unknown as Record<CharacterId, CharacterDef>
export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]

/** 生效配装：升级卡质变 = 换持整行（一阶 → 二阶累积；未解锁用基础行） */
export function loadoutFor(def: CharacterDef, tiers: UpgradeTiers): readonly AbilityDef[] {
  if (!tiers.u1) return def.abilities
  return tiers.u2 ? def.upgrades[1].abilities : def.upgrades[0].abilities
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
