// 队长主动技能的触发策略（纯逻辑）：只剩冷却推进。
// 效果本体是标准能力行（CAPTAINS[id].skill.abilities，场景 castSkill 单发），
// 剩余冷却存在 RunState.skillCdMs（跨波持久），战斗场景逐帧调 tickSkillCd。
// 释放门槛 = 纯 CD 就绪：开局 CD 即就绪，可立即首放；
// 冷却时长可被团队升级卡的 skillCdMul 缩短（见 data/cards.ts）。
// 就绪与充能进度由各战斗场景的 skillSnapshot() 自算（HUD 只读快照），故此处不再提供。

/** 冷却推进：战斗时钟每帧递减到 0 为止 */
export function tickSkillCd(remainMs: number, deltaMs: number): number {
  return Math.max(0, remainMs - deltaMs)
}
