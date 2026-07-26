import charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'

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
// 队伍：玩家操控队伍中心点，角色按队形岗位随行；除此之外角色是完全独立的单位。
// 队形几何在 characters/formation.ts；满员后可在整编页切换队形与互换站位。
// 队伍/角色基线的「设计数值」形状：数据行在 defs/team.ts（创作层），gen 校验产出 team.json；
// 本文件只从中派生惯用导出 TEAM/MEMBER，形状与数值不变。
export interface TeamBaseline {
  readonly team: {
    /** 角色环绕队形半径（≥4 人） */
    readonly ringRadius: number
    /** 3 人环收紧的小半径（人少时更像一个整体） */
    readonly smallRingRadius: number
    /** 2 人阵的左右圆心距（紧凑贴身；1~2 人不环绕） */
    readonly pairGap: number
    /** 复活基线时长（队长按 reviveMul 缩放；移速已下放到 CaptainDef.moveSpeed） */
    readonly reviveMs: number
    /** N 保 1 中心的受击判定半径系数（碰撞圆减半更难被摸到） */
    readonly guardCenterHurtboxMul: number
  }
  readonly member: {
    readonly size: number
    readonly radius: number
    readonly maxHp: number
    /** 受击无敌间隔：让「蹭到怪」是磨损而非速死 */
    readonly iframesMs: number
  }
}
