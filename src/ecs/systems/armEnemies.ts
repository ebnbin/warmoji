import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyArm, Faction } from '../components'
import { equipAbility, NEUTRAL_AMP } from '../entities/ability'
import { npcAbilities } from '../entities/form'
import type { Sim } from '../sim'

/** 醒着的身体第一次进入战场时装上定义里的能力，阵营随身体；精英倍率是身上的标记，出手时折算 */
export function armEnemies(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || EnemyArm.armed[eid]) continue
    armEnemy(sim, eid)
  }
}

function armEnemy(sim: Sim, eid: number): void {
  const rows = npcAbilities(sim, eid)
  EnemyArm.armed[eid] = 1
  if (!rows) return
  const fireDelay = EnemyArm.fireDelayMs[eid]!
  for (const w of rows) {
    const delay = ('firstDelayMs' in w ? w.firstDelayMs : undefined) ?? fireDelay
    equipAbility(sim, eid, w, Faction.v[eid]!, delay, NEUTRAL_AMP)
  }
}
