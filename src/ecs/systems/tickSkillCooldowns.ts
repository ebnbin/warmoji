import { hasComponent } from 'bitecs'
import { Cd, Charges } from '../components'
import { openStage } from './shared/avail'
import type { Sim } from '../sim'

/** 主动技能还要等多久：充能的还剩次数、连段还能接下一段时不用等 */
export function skillRemainMs(sim: Sim, e: number): number {
  if (hasComponent(sim.world, e, Charges) && Charges.n[e]! > 0) return 0
  if (openStage(sim, e) !== 0) return 0
  return Math.max(0, Cd.left[e]!)
}

/** 每个角色主动技能的剩余冷却抄进这一局，跨波保留，也给队伍环显示 */
export function tickSkillCooldowns(sim: Sim): void {
  const cd = sim.run.skillCd
  sim.skills.forEach((e, slot) => {
    if (slot < cd.length) cd[slot] = skillRemainMs(sim, e)
  })
}
