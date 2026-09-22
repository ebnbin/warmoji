import charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'

export interface InnateSource {
  readonly name: string
  readonly icon: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}
export interface CharacterAuthoring {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly orbit: number
  readonly weapons: readonly WeaponId[]
  readonly innate: readonly InnateSource[]
}
/** tiers = [base, 一阶, 二阶]；cards = [一阶卡, 二阶卡]，无该档为 null；weaponId 存在即实体武器 */
export interface Carrier {
  readonly name: string
  readonly icon: string
  readonly weaponId?: WeaponId
  readonly tiers: readonly AbilityDef[]
  readonly cards: readonly (UpgradeCard | null)[]
}
export interface CharacterDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly orbit: number
  readonly carriers: readonly Carrier[]
}
/** u1 = 一阶卡（下标 0），u2 = 二阶卡（下标 1） */
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}
export type CharacterId = keyof typeof charactersJson
export interface TeamBaseline {
  readonly team: {
    /** 角色环绕队形半径（≥4 人） */
    readonly ringRadius: number
    /** 3 人环半径 */
    readonly smallRingRadius: number
    /** 2 人阵圆心距；1~2 人不环绕 */
    readonly pairGap: number
    /** 队长按 reviveMul 缩放 */
    readonly reviveMs: number
    /** N 保 1 中心的受击半径系数 */
    readonly guardCenterHurtboxMul: number
  }
  readonly member: {
    readonly size: number
    readonly radius: number
    readonly maxHp: number
    readonly iframesMs: number
  }
}
