import { CAPTAINS, SKILL } from '../config'
import type { CaptainId } from '../config'

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
