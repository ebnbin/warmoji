import type { Sim } from '../sim'

/** 队长技能的限时全队增伤到期复原 */
export function expireSkillBuff(sim: Sim): void {
  if (sim.skillDamageMul !== 1 && sim.elapsedMs >= sim.skillBuffUntil) sim.skillDamageMul = 1
}
