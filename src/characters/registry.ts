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
  /** 环形阵移动秉性：>0 沿环迎敌滑动，<0 避敌滑动，0 安分（被推才动）；见 core/orbit.ts */
  readonly orbit: number
}

// 数据行在 defs/characters.ts（创作层），npm run gen 生成 characters.json
export type CharacterId = keyof typeof charactersJson.characters
export const CHARACTERS = charactersJson.characters as unknown as Record<CharacterId, CharacterDef>
export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]
export type CaptainId = keyof typeof charactersJson.captains
export const CAPTAINS = charactersJson.captains as unknown as Record<CaptainId, CaptainDef>
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

/** 生效配装：升级卡质变 = 换持整行（一阶 → 二阶累积；未解锁用基础行） */
export function loadoutFor(def: CharacterDef, tiers: UpgradeTiers): readonly AbilityDef[] {
  if (!tiers.u1) return def.abilities
  return tiers.u2 ? def.upgrades[1].abilities : def.upgrades[0].abilities
}

// 队长主动技能：每位队长一个，跨波 CD——剩余冷却存在 run 上、只按战斗
// 时钟推进（商店/整编不走表），上一波攒的进度带进下一波。左下角按钮或
// E 键释放；效果逻辑按队长 id 在 BaseArenaScene.castSkill 分派，效果参数
// 见下方 SKILL 常量（与「能力先直接建模为字段」同一约定，不做通用效果系统）
export interface CaptainSkill {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
}

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 能力先直接建模为字段，需要通用效果系统时再抽象；编制上限/经验相关能力由队长决定。
export interface CaptainDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 主动技能（战斗内左下角按钮释放） */
  readonly skill: CaptainSkill
  /** 编制上限：可招募的角色总数 */
  readonly teamSize: number
  /** 开局波次（通常 1）；>1 时跳过之前的波次，难度时钟按被跳过的
   * 波次时长预推进——敌人配比与强度都是该波的真实水平，且能量豆拉满；
   * 阵容仍从零起步，由玩家在整编页逐个自选招满（core/run.ts beginRun） */
  readonly startWave: number
  /** 开局金币 */
  readonly startCoins: number
  /** 全队经验获取倍率 */
  readonly xpGainMul: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
  /** 开局整编结束后是否先进商店再开战（自带开局金币的队长用） */
  readonly firstWaveShop: boolean
}

// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 battle/formation.ts；满员后可在整编页切换队形与互换站位。
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
