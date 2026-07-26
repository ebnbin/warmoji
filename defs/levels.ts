import type { CharacterId } from '../src/types/characters'
import type { CharacterEffects } from '../src/types/items'

// 角色各等级形态的「基础属性质变」（创作层·内容）：与能力换行并列的另一半质变。
// 语义是整体替换而非叠加：[0] = 2 级形态相对基础队员的完整加成，[1] = 3 级形态的完整加成
//（已含更强数值，不与 2 级叠加）。主题化：坦克向堆血、爆发向堆伤/暴击、持续向堆攻速。
// 取用逻辑在 src/characters/levels.ts，这里只放数据——经 gen 校验产出 levels.json。
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
