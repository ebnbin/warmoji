import type charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'
import type { BodyRules, FormDef, ResourceDef } from './enemies'
import type { StatBase } from './stats'
import type { RoleId } from './roles'

/** 职责：在队伍里干什么 */
export type DutyTag = 'damage' | 'defense' | 'support' | 'control'
/** 打法：怎么打 */
export type StyleTag = 'melee' | 'ranged' | 'area' | 'summon' | 'mobile'
/** 角色的标签，只用于展示与筛选，不改数值 */
export type CharacterTag = DutyTag | StyleTag
/** 一名角色的标签：先写职责，至少一项 */
type CharacterTags = readonly [DutyTag, ...CharacterTag[]]
/** 身体的力学：阻力与质量决定起步和被推开时的手感 */
interface BodyParams {
  readonly drag: number
  readonly mass: number
}
/** 角色自己的基础属性，盖过全队通用的那份；移速与体力每人都要写 */
type CharacterStats = StatBase & {
  readonly moveSpeed: number
  readonly maxStamina: number
  readonly staminaRegen: number
  readonly exertion: number
}
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
  readonly tags: CharacterTags
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
/** 载体：tiers 是 1 级起每一级用的能力，到顶后一直用最后一档；cards 是 2 级起每一级亮出的升级卡 */
export interface Carrier {
  readonly name: string
  readonly icon: string
  readonly tiers: readonly AbilityDef[]
  readonly cards: readonly UpgradeCard[]
}
export interface CharacterDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly role: RoleId
  readonly tags: CharacterTags
  readonly body: BodyParams
  readonly stats: CharacterStats
  readonly skill: SkillDef
  readonly carriers: readonly Carrier[]
  readonly resource?: ResourceDef
  readonly rules?: CharacterRules
  readonly forms?: readonly FormDef[]
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
