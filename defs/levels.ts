import type { CharacterId } from '../src/types/characters'
import type { CharacterEffects } from '../src/types/items'

type Tier = Partial<CharacterEffects>

export const LEVEL_STATS = {
  juggler: [{ damageMul: 1.2, hpAdd: 15 }, { damageMul: 1.45, hpAdd: 35, cooldownMul: 0.9 }],
  unicorn: [{ damageMul: 1.25, hpAdd: 25 }, { damageMul: 1.55, hpAdd: 50 }],
  troll: [{ hpAdd: 70, damageMul: 1.12 }, { hpAdd: 170, damageMul: 1.28 }],
  cowboy: [{ cooldownMul: 0.88, hpAdd: 15 }, { cooldownMul: 0.75, damageMul: 1.2, hpAdd: 30 }],
  mage: [{ damageMul: 1.3, hpAdd: 10 }, { damageMul: 1.65, hpAdd: 25 }],
  kangaroo: [{ damageMul: 1.2, hpAdd: 25 }, { damageMul: 1.45, hpAdd: 55, rangeMul: 1.15 }],
  robot: [{ damageMul: 1.2, hpAdd: 40 }, { damageMul: 1.4, hpAdd: 90 }],
  snowman: [{ hpAdd: 50, damageMul: 1.15 }, { hpAdd: 120, damageMul: 1.3 }],
  fairy: [{ cooldownMul: 0.85, hpAdd: 20 }, { cooldownMul: 0.72, hpAdd: 45 }],
  assassin: [{ damageMul: 1.3, critChance: 0.1 }, { damageMul: 1.6, critChance: 0.2, hpAdd: 20 }],
  beaver: [{ hpAdd: 40, damageMul: 1.15 }, { hpAdd: 100, damageMul: 1.3 }],
  queenBee: [{ damageMul: 1.2, hpAdd: 30 }, { damageMul: 1.45, hpAdd: 70 }],
  medic: [{ hpAdd: 40, damageMul: 1.2 }, { hpAdd: 90, damageMul: 1.45 }],
  jellyfish: [{ damageMul: 1.25, hpAdd: 20 }, { damageMul: 1.5, hpAdd: 45 }],
} as const satisfies Record<CharacterId, readonly [Tier, Tier]>
