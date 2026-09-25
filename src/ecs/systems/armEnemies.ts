import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyArm, FACTION, Morph, Transform } from '../components'
import { equipAbility, NEUTRAL_AMP } from '../entities/ability'
import { postponeAbilities } from './shared/ability'
import { restoreMorphVisual } from '../entities/enemy'
import { enemyDef } from '../store'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

export function armEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    if (!EnemyArm.armed[eid]) armEnemy(sim, eid)
    if (isDancing(sim)) continue
    if (Morph.until[eid] === 0 || now < Morph.until[eid]!) continue
    restoreMorphVisual(sim.frames, eid)
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'puff' })
    postponeAbilities(sim, eid, 700)
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
