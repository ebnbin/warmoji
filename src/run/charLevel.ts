import type { UpgradeTiers } from '../characters/registry'

// 角色专属经验（与团队战斗经验完全独立）：只在商店为某角色购买道具时累积
//（每张卡自带 upgradeXp）。攒满档位即自动、免费升级——每次升级是「换一个更强的
// 角色形态」（整套能力 + 基础属性质变）。3 个等级（1/2/3）= 2 次升级；经验只增不减、
// 跨波持久，阵亡/复活不影响。

/** 升到 2 级 / 3 级所需的累计经验阈值。
 * 配合各卡 upgradeXp：1→2 约 5~8 张普通；2→3 约 7~10 张稀有 */
export const CHAR_XP_THRESHOLDS = [80, 320] as const
export const MAX_CHAR_LEVEL = CHAR_XP_THRESHOLDS.length + 1

/** 累计经验 → 当前等级（1..MAX_CHAR_LEVEL） */
export function characterLevel(xp: number): number {
  let level = 1
  for (const t of CHAR_XP_THRESHOLDS) if (xp >= t) level += 1
  return level
}

/** 等级 → 能力档位（喂 loadoutFor / 池推导；2 级解锁一阶、3 级解锁二阶） */
export function tiersForLevel(level: number): UpgradeTiers {
  return { u1: level >= 2, u2: level >= 3 }
}

/** 商店进度条数据：当前等级、本级内进度、是否满级 */
export interface LevelProgress {
  level: number
  maxed: boolean
  /** 本级已攒 / 升下一级所需（满级时均为 0） */
  cur: number
  need: number
  ratio: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = characterLevel(xp)
  if (level >= MAX_CHAR_LEVEL) return { level, maxed: true, cur: 0, need: 0, ratio: 1 }
  const prev = level === 1 ? 0 : CHAR_XP_THRESHOLDS[level - 2]!
  const next = CHAR_XP_THRESHOLDS[level - 1]!
  const cur = xp - prev
  const need = next - prev
  return { level, maxed: false, cur, need, ratio: Math.max(0, Math.min(1, cur / need)) }
}
