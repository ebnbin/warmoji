import { query } from 'bitecs'
import { SPAWN } from '../../data/enemies'
import { UNIT } from '../../util/units'
import { Dormant, ENEMY_SET, Morph, Nest, Transform } from '../components'
import { spawnBrood } from '../entities/enemy'
import { enemyDef } from '../store'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

function broodCount(sim: Sim, nestEid: number): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Nest.of[eid] === nestEid) n++
  }
  return n
}

export function updateSpawners(sim: Sim): void {
  const atlas = sim.frames
  if (sim.over) return
  const now = sim.elapsedMs
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  let active = eids.length
  for (const eid of eids) {
    if (Dormant.v[eid]) continue // 休眠的巢不产子
    const spawner = enemyDef[eid]?.spawner
    if (!spawner) continue
    // 压制期既不产子也不推进计时
    if (isDancing(sim)) continue
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue
    if (now < Nest.nextSpawnAt[eid]!) continue
    Nest.nextSpawnAt[eid] = now + spawner.intervalMs
    if (active >= SPAWN.maxAlive) continue
    const room = spawner.maxAlive - broodCount(sim, eid)
    if (room <= 0) continue
    const n = Math.min(spawner.count, room)
    spawnBrood(sim, atlas, spawner.into, n, Transform.x[eid]!, Transform.y[eid]!, 0.6 * UNIT, eid)
    active += n // 同帧后面的巢看得到刚产的子敌
  }
}
