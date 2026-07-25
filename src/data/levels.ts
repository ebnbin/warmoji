import levelsJson from '../assets/levels.json'
import type { CharacterId } from './characters'
import type { CharacterEffects } from './items'

// 角色各等级形态的「基础属性质变」（与能力换行并列的另一半质变）。
// 语义是整体替换而非叠加：LEVEL_STATS[id][0] = 2 级形态相对基础队员的完整加成，
// [1] = 3 级形态相对基础队员的完整加成（已含更强的数值，不与 2 级叠加）。
// 主题化：坦克向堆血、爆发向堆伤/暴击、持续向堆攻速。
// 数据行在 defs/levels.ts（创作层），npm run gen 校验产出 levels.json，本文件只留取用逻辑。

type Tier = Partial<CharacterEffects>

export const LEVEL_STATS = levelsJson as unknown as Record<CharacterId, readonly [Tier, Tier]>

/** 某等级形态的基础属性片段（喂 aggregateCharacterEffects 的 extra）。
 * 1 级 = 基础队员（无片段）；2/3 级各取对应形态的完整片段（不叠加） */
export function levelStatsFor(id: CharacterId, level: number): Tier[] {
  if (level <= 1) return []
  const tier = LEVEL_STATS[id][Math.min(level, 3) - 2]
  return tier ? [tier] : []
}
