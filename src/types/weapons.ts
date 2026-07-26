import weaponsJson from '../assets/weapons.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'

/** 升级卡文案（商店展示） */
export interface UpgradeCard {
  readonly icon: string
  readonly name: string
  readonly desc: string
}
/** 一个升级档：该档的行为（能力 id 引用）+ 解锁卡文案 */
export interface AbilityTier {
  readonly ability: AbilityId
  readonly card: UpgradeCard
}
/** 创作层书写形态：能力以 id 引用 */
export interface WeaponSource {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityId
  readonly upgrades: readonly AbilityTier[]
}
export type WeaponId = keyof typeof weaponsJson
/** 运行时形态：base 与各档能力 id 已解析为 def（图鉴/面板直接取用） */
export interface WeaponDef {
  readonly name: string
  readonly emoji: string
  readonly base: AbilityDef
  readonly upgrades: readonly { readonly card: UpgradeCard; readonly ability: AbilityDef }[]
}
