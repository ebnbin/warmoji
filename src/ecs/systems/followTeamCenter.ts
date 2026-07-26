import { query } from 'bitecs'
import { Captain, Transform } from '../components'
import type { Sim } from '../sim'

/** 队伍锚点跟随队伍中心：唯一职责是把队伍中心写进锚点实体的位姿 */
export function followTeamCenter(sim: Sim): void {
  for (const e of query(sim.world, [Captain, Transform])) {
    Transform.x[e] = sim.center.x
    Transform.y[e] = sim.center.y
  }
}
