import { WEAPONS as WEAPON_TABLE } from '../../defs/weapons'
import { mapValues } from '../util/record'
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

export const WEAPONS: Record<WeaponId, WeaponDef> = mapValues(WEAPON_TABLE, hydrate)
