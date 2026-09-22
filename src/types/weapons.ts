import weaponsJson from '../assets/weapons.json'
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
/** 能力以 id 引用 */
export interface WeaponSource {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}
export type WeaponId = keyof typeof weaponsJson
/** 能力 id 已解析为 def */
export interface WeaponDef {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityDef
  readonly upgrades: readonly { readonly card: UpgradeCard; readonly ability: AbilityDef }[]
}
