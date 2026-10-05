import { hasComponent, query } from 'bitecs'
import { Floor, Projectile, Transform } from '../components'
import { floorAt } from '../utils/pass'
import type { Sim } from '../sim'

/** 帧末记下每样东西脚下的地面多高，画面按它抬起来；弹体记的是自己飞行的基准，由它自己写；平地的图不用记 */
export function settleFloors(sim: Sim): void {
  if (!sim.hooks.floorZ) return
  for (const eid of query(sim.world, [Transform])) {
    if (hasComponent(sim.world, eid, Projectile)) continue
    Floor.z[eid] = floorAt(sim, Transform.x[eid]!, Transform.y[eid]!)
  }
}
