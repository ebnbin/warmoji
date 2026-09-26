import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyArm } from '../components'
import { armNpc } from '../entities/form'
import type { Sim } from '../sim'

/** 醒着的身体第一次进入战场时装上定义里的能力，阵营随身体；精英倍率是身上的标记，出手时折算 */
export function armEnemies(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || EnemyArm.armed[eid]) continue
    armNpc(sim, eid)
  }
}

