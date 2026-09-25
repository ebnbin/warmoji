import type { WEAPONS } from '../../defs/weapons'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'

export interface UpgradeCard {
  readonly icon: string
  readonly name: string
  readonly desc: string
}
export interface AbilityTier {
  readonly ability: AbilityId
  readonly card: UpgradeCard
}
export interface WeaponSource {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}
export type WeaponId = keyof typeof WEAPONS
export interface WeaponDef {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityDef
  readonly upgrades: readonly { readonly card: UpgradeCard; readonly ability: AbilityDef }[]
}
