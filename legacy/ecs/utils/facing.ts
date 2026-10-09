import { hasComponent } from 'bitecs'
import { EDir, Facing, Phys } from '../components'
import type { Sim } from '../sim'

/** 身体的朝向角：角色看滤波后的移动方向，其余身体看速度，停着时看游荡方向 */
export function facingAngle(sim: Sim, eid: number): number {
  if (hasComponent(sim.world, eid, Facing)) return Math.atan2(Facing.y[eid]!, Facing.x[eid]!)
  const vx = Phys.vx[eid]!
  const vy = Phys.vy[eid]!
  if (vx * vx + vy * vy > 1) return Math.atan2(vy, vx)
  return Math.atan2(EDir.y[eid]!, EDir.x[eid]!)
}
