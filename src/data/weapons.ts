import weaponsJson from '../assets/weapons.json'
import { ABILITIES } from './abilities'

import type { WeaponDef, WeaponId, WeaponSource } from '../types/weapons'

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
