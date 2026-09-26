import { query } from 'bitecs'
import { SPAWN } from '../../data/enemies'
import { UNIT } from '../../util/units'
import { Dormant, ENEMY_SET, MARK, Nest, Transform } from '../components'
import { hasMark } from '../utils/marks'
import { awakeCount, spawnBrood } from '../entities/enemy'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

function broodCount(sim: Sim, nestEid: number): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Nest.of[eid] === nestEid) n++
  }
  return n
}

export function updateSpawners(sim: Sim): void {
  const atlas = sim.frames
  if (sim.over) return
  const now = sim.elapsedMs
  const eids = [...query(sim.world, ENEMY_SET)]
  let active = awakeCount(sim)
  for (const eid of eids) {
    if (Dormant.v[eid]) continue
    const spawner = enemyDef[eid]?.spawner
    if (!spawner) continue
    if (hasMark(sim, eid, MARK.stun) || hasMark(sim, eid, MARK.morph)) continue
    if (now < Nest.nextSpawnAt[eid]!) continue
    Nest.nextSpawnAt[eid] = now + spawner.intervalMs
    if (active >= SPAWN.maxAlive) continue
    const room = spawner.maxAlive - broodCount(sim, eid)
    if (room <= 0) continue
    const n = Math.min(spawner.count, room)
    spawnBrood(sim, atlas, spawner.into, n, Transform.x[eid]!, Transform.y[eid]!, 0.6 * UNIT, eid)
    active += n
  }
}
