import weaponsJson from '../assets/weapons.json'
import { ABILITIES } from '../abilities/registry'
import type { AbilityId } from '../abilities/registry'
import type { AbilityDef } from '../abilities/defs'

// 武器 = 包装了 Ability 的实体载体（有身份：名字/图标/手持视觉，进图鉴「武器」栏）。
// 一把武器自带升级路径：base + 若干档（每档 = 一张升级卡文案 + 该档的行为 Ability）。
// Ability 本身是纯行为、可被复用（左右双枪共用同一弹道行为，只是持有侧不同）。
// 创作层数据行在 defs/weapons.ts，npm run gen 校验并生成 src/assets/weapons.json。

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

function hydrate(w: WeaponSource): WeaponDef {
  return {
    name: w.name,
    emoji: w.emoji,
    base: ABILITIES[w.base],
    upgrades: w.upgrades.map((u) => ({ card: u.card, ability: ABILITIES[u.ability] })),
  }
}

export const WEAPONS = Object.fromEntries(
  Object.entries(weaponsJson as unknown as Record<WeaponId, WeaponSource>).map(([id, w]) => [
    id,
    hydrate(w),
  ]),
) as Record<WeaponId, WeaponDef>
export const WEAPON_IDS = Object.keys(WEAPONS) as readonly WeaponId[]
