import { UNIT } from '../lib/units'
import { CAPTAINS } from './registry'
import type { CaptainId } from './registry'

// 队长主动技能的纯逻辑：冷却推进/就绪/充能进度 + 数值缩放。
// 剩余冷却存在 RunState.skillCdMs（跨波持久），战斗场景逐帧调 tickSkillCd。

/** 冷却推进：战斗时钟每帧递减到 0 为止 */
export function tickSkillCd(remainMs: number, deltaMs: number): number {
  return Math.max(0, remainMs - deltaMs)
}

export function skillReady(remainMs: number): boolean {
  return remainMs <= 0
}

/** 充能进度 0..1（1 = 就绪）；按钮的扇形遮罩按此绘制 */
export function skillCharge(remainMs: number, captainId: CaptainId): number {
  const cd = CAPTAINS[captainId].skill.cdMs
  if (cd <= 0) return 1
  return Math.min(1, Math.max(0, 1 - remainMs / cd))
}

/** 降维打击对单个敌人的伤害：基准 × 当前波次血量倍率（与敌人成长同步），
 * Boss 按比例折减 */
export function prodigyDamage(hpMultiplier: number, isBoss: boolean): number {
  return Math.max(1, Math.round(SKILL.prodigy.damage * hpMultiplier * (isBoss ? SKILL.prodigy.bossRatio : 1)))
}

// 主动技能的效果参数（CD 在 CAPTAINS[id].skill.cdMs）。
// 释放门槛 = CD 就绪 且 至少 1 颗能量豆（经验每升一级得 1 颗，见 run/xp.ts）；
// 开局 CD 即就绪、0 颗豆——首放卡在挣第一颗豆上
export const SKILL = {
  /** 能量豆持有上限：满豆时经验冻结（不再增长），消耗后恢复 */
  maxBeans: 3,
  /** 圣光降临：存活者回复比例 + 全队无敌时长（走受击无敌帧通道，
   * 挡接触与敌弹；毒液池/毒雾是独立计时通道，不受无敌保护） */
  angel: { healRatio: 0.5, invulnMs: 2000 },
  /** 天降横财：砸最近 targets 个敌人，每袋伤害/击退/落地金币数 */
  moneybags: { targets: 8, damage: 60, knockback: 10 * UNIT, coinsPerHit: 1 },
  /** 全场蹦迪：全场敌人（含 Boss）定身跳舞时长 */
  party: { danceMs: 3500 },
  /** 弱点讲义：全队伤害倍率 + 持续时长（不跨波） */
  scholar: { damageMul: 1.6, durationMs: 8000 },
  /** 降维打击：基准伤害 × 当前波次血量倍率（与敌人成长同步），Boss 承伤比例 */
  prodigy: { damage: 70, bossRatio: 0.5 },
} as const
