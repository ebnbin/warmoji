import { query } from 'bitecs'
import type { QueryTerm } from 'bitecs'
import { Depth, FACTION, Faction, Projectile } from '../components'
import { enemyZ } from '../entities/enemy'
import type { Sim } from '../sim'

/** 打得到队伍的弹体画在最上面，队伍自己的压在所有身体下面：躲的时候只看得见要躲的 */
export const FOE_SHOT_Z = 61
const TEAM_SHOT_Z = enemyZ(-Infinity) - 0.1

const SHOTS: QueryTerm[] = [Projectile, Faction, Depth]

/** 弹体按此刻的阵营排前后：反弹会换边 */
export function layerShots(sim: Sim): void {
  for (const eid of query(sim.world, SHOTS)) Depth.z[eid] = Faction.v[eid] === FACTION.team ? TEAM_SHOT_Z : FOE_SHOT_Z
}
