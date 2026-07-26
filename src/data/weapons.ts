import weaponsJson from '../assets/weapons.json'
import { ABILITIES } from './abilities'

import type { WeaponDef, WeaponId, WeaponSource } from '../types/weapons'

// 武器 = 包装了 Ability 的实体载体（有身份：名字/图标/手持视觉，进图鉴「武器」栏）。
// 一把武器自带升级路径：base + 若干档（每档 = 一张升级卡文案 + 该档的行为 Ability）。
// Ability 本身是纯行为、可被复用（左右双枪共用同一弹道行为，只是持有侧不同）。
// 创作层数据行在 defs/weapons.ts，npm run gen 校验并生成 src/assets/weapons.json。

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
