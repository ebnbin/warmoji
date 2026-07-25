import { castBuffs } from './kinds/buff'
import { castDances } from './kinds/dance'
import { castHeals } from './kinds/heal'
import { castNukes } from './kinds/nuke'
import { castRallies } from './kinds/rally'
import { castTimeStops } from './kinds/timeStop'
import { tickCooldowns } from './systems/cooldown'
import { followTeamCenter, updateAbilityGates } from './systems/gates'
import type { Sim } from '../sim'

// 一帧的能力推进：闸门 → 冷却 → 逐 kind 施放。每一条都是独立系统，次序即语义。

export function stepAbilities(sim: Sim, dt: number): void {
  followTeamCenter(sim)
  updateAbilityGates(sim)
  tickCooldowns(sim, dt)
  castRallies(sim)
  castDances(sim)
  castBuffs(sim)
  castTimeStops(sim)
  castNukes(sim)
  castHeals(sim)
}
