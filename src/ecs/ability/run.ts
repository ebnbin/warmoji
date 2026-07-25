import { castAreaBlasts } from './kinds/areaBlast'
import { castAssassinates } from './kinds/assassinate'
import { castBoomerangs } from './kinds/boomerang'
import { castBuffs } from './kinds/buff'
import { castChainArcs } from './kinds/chainArc'
import { castDances } from './kinds/dance'
import { castHeals } from './kinds/heal'
import { castLasers } from './kinds/laser'
import { castNukes } from './kinds/nuke'
import { castProjectiles } from './kinds/projectile'
import { castRallies } from './kinds/rally'
import { castSlowAuras } from './kinds/slowAura'
import { castStrikes } from './kinds/strike'
import { castSummons } from './kinds/summon'
import { castSweeps } from './kinds/sweep'
import { castThrusts } from './kinds/thrust'
import { castTimeStops } from './kinds/timeStop'
import { castTurrets } from './kinds/turret'
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
  castAreaBlasts(sim, dt)
  castChainArcs(sim)
  castThrusts(sim, dt)
  castSweeps(sim)
  castStrikes(sim)
  castAssassinates(sim, dt)
  castProjectiles(sim)
  castBoomerangs(sim, dt)
  castLasers(sim)
  castSummons(sim, dt)
  castTurrets(sim, dt)
  castSlowAuras(sim, dt)
}
