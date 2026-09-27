import { addComponents } from 'bitecs'
import { Ring, Tint, Transform } from '../components'
import { newEntity } from './entity'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

/** 地上的一圈：据点、救援的范围；位置与颜色由用它的系统每帧更新 */
export function spawnGroundRing(sim: Sim, at: Point, radius: number): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Transform, Tint, Ring)
  Transform.x[eid] = at.x
  Transform.y[eid] = at.y
  Tint.alpha[eid] = 1
  Ring.radius[eid] = radius
  Ring.fillAlpha[eid] = 0.16
  Ring.lineAlpha[eid] = 0.9
  Ring.lineWidth[eid] = 4
  Ring.born[eid] = sim.fxMs
  Ring.z[eid] = 1
  return eid
}
