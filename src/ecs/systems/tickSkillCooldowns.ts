import type { Sim } from '../sim'

/** 每个角色的主动技能冷却按真实时间递减，当队员时照走 */
export function tickSkillCooldowns(sim: Sim): void {
  const cd = sim.run.skillCd
  for (let i = 0; i < cd.length; i++) {
    if (cd[i]! > 0) cd[i] = Math.max(0, cd[i]! - sim.dtMs)
  }
}
