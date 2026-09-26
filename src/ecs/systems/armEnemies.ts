import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyArm, FACTION } from '../components'
import { equipAbility, NEUTRAL_AMP } from '../entities/ability'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

/** 醒着的敌人第一次进入战场时装上定义里的能力；精英倍率是身上的标记，出手时折算 */
export function armEnemies(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || EnemyArm.armed[eid]) continue
    armEnemy(sim, eid)
  }
}

function armEnemy(sim: Sim, eid: number): void {
  const rows = enemyDef[eid]?.abilities
  EnemyArm.armed[eid] = 1
  if (!rows) return
  const fireDelay = EnemyArm.fireDelayMs[eid]!
  rows.forEach((w, i) => {
    const delay = ('firstDelayMs' in w ? w.firstDelayMs : undefined) ?? fireDelay ?? 600 + i * 230
    equipAbility(sim, eid, w, FACTION.enemy, delay, NEUTRAL_AMP)
  })
}
