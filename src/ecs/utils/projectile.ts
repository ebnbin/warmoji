import { hasComponent } from 'bitecs'
import type { } from '../../types/abilityDefs'
import { Aim, EnemyVel, Faction, FACTION, Held, Owner } from '../components'
import { } from '../store'
import { ownerX, ownerY } from './amp'
import type { Sim } from '../sim'

/** 队伍取本帧移动方向，敌人取本帧速度方向 */
export function headingOf(sim: Sim, e: number): { x: number; y: number } {
  if (Faction.v[e] !== FACTION.enemy) return sim.teamDir
  const o = Owner.eid[e]!
  return { x: EnemyVel.x[o]!, y: EnemyVel.y[o]! }
}

/** 无 Held 即施放锚点本身 */
export function muzzle(sim: Sim, e: number): { x: number; y: number } {
  if (!hasComponent(sim.world, e, Held)) return { x: ownerX(e), y: ownerY(e) }
  const aim = Aim.rad[e]!
  const off = Held.restOffset[e]!
  const lateral = Held.side[e]! * Held.gap[e]!
  return {
    x: ownerX(e) + Math.cos(aim) * off + Math.cos(aim + Math.PI / 2) * lateral,
    y: ownerY(e) + Math.sin(aim) * off + Math.sin(aim + Math.PI / 2) * lateral,
  }
}
