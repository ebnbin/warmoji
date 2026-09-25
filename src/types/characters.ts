import type charactersJson from '../assets/characters.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'
import type { AbilityTier, UpgradeCard, WeaponId } from './weapons'

export interface BodyParams {
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
export interface CharacterAuthoring {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly body: BodyParams
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
  readonly carriers: readonly Carrier[]
}
export interface UpgradeTiers {
  u1: boolean
  u2: boolean
}
export type CharacterId = keyof typeof charactersJson
export interface TeamBaseline {
  readonly team: {
    readonly ringRadius: number
    readonly smallRingRadius: number
    readonly pairGap: number
    readonly maxSize: number
    readonly reviveMs: number
    readonly leaderSizeMul: number
    readonly followerSizeMul: number
    readonly leaderGrip: number
  }
  readonly member: {
    readonly size: number
    readonly radius: number
    readonly maxHp: number
    readonly iframesMs: number
  }
}
