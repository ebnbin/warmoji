import type charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'

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
}
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
