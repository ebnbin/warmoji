import type charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'
import type { BodyRules, FormDef, ResourceDef } from './enemies'

interface BodyParams {
  readonly thrust: number
  readonly drag: number
  readonly mass: number
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
  readonly body: BodyParams
  /** 吸金币的半径，单位格 */
  readonly magnet: number
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
  readonly body: BodyParams
  readonly magnet: number
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
    readonly reviveMs: number
    readonly leaderSizeMul: number
    readonly followerSizeMul: number
    readonly leaderGrip: number
    readonly followerGrip: number
  }
  readonly member: {
    readonly size: number
    readonly radius: number
    readonly maxHp: number
    readonly iframesMs: number
  }
}
