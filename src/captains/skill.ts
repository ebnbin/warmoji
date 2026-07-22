import { CAPTAINS } from './registry'
import type { CaptainId } from './registry'

// 队长主动技能的触发策略（纯逻辑）：冷却推进/就绪/充能进度 + 弹药上限。
// 效果本体是标准能力行（CAPTAINS[id].skill.abilities，场景 castSkill 单发），
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

// 释放门槛 = 纯 CD 就绪（不再依赖能量豆）：开局 CD 即就绪，可立即首放；
// 冷却时长可被团队升级卡的 skillCdMul 缩短（见 cards/registry.ts）
