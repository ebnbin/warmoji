import type charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'
import type { BodyRules, FormDef, ResourceDef } from './enemies'
import type { StatBase } from './stats'
import type { RoleId } from './roles'

/** 身体的力学：阻力与质量决定起步和被推开时的手感 */
interface BodyParams {
  readonly drag: number
  readonly mass: number
}
/** 角色自己的基础属性，盖过全队通用的那份；移速每人都要写 */
type CharacterStats = StatBase & { readonly moveSpeed: number }
export interface InnateSource {
  readonly name: string
  readonly icon: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}
interface SkillSource {
  readonly name: string
  readonly icon: string
  readonly desc: string
  readonly cdMs: number
  readonly ability: AbilityId
  readonly aim?: boolean
}
interface SkillDef {
  readonly name: string
  readonly icon: string
  readonly desc: string
  readonly cdMs: number
  readonly ability: AbilityDef
  readonly aim: boolean
}
export interface CharacterAuthoring {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly role: RoleId
  readonly body: BodyParams
  readonly stats: CharacterStats
  readonly skill: SkillSource
  readonly weapons: readonly WeaponId[]
  readonly innate: readonly InnateSource[]
  /** 资源与被动：角色身体自己的规则，和敌人同一套 */
  readonly resource?: ResourceDef
  readonly rules?: CharacterRules
  /** 可切换的形态：换外观、换自动能力、换体型；主动技能不换 */
  readonly forms?: readonly FormDef[]
}
type CharacterRules = Pick<BodyRules, 'onHurt' | 'onKill' | 'onTouched' | 'onTouch' | 'onLethal' | 'onLowHp' | 'onIdle'>
export interface Carrier {
  readonly name: string
  readonly icon: string
  readonly tiers: readonly AbilityDef[]
  readonly cards: readonly (UpgradeCard | null)[]
}
export interface CharacterDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly role: RoleId
  readonly body: BodyParams
  readonly stats: CharacterStats
  readonly skill: SkillDef
  readonly carriers: readonly Carrier[]
  readonly resource?: ResourceDef
  readonly rules?: CharacterRules
  readonly forms?: readonly FormDef[]
}
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}
export type CharacterId = keyof typeof charactersJson
export interface TeamBaseline {
  readonly team: {
    readonly maxSize: number
    readonly leaderSizeMul: number
    readonly followerSizeMul: number
    readonly leaderGrip: number
    readonly followerGrip: number
  }
  readonly member: {
    readonly size: number
    readonly radius: number
    /** 每个角色都有的基础属性 */
    readonly stats: StatBase
  }
}
