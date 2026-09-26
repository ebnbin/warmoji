import { query } from 'bitecs'
import { Boss, Dormant, ENEMY_SET, Transform } from '../components'
import type { Sim } from '../sim'
import { leaderX, leaderY } from '../utils/team'
import { despawnEnemy } from './shared/combat'

const DORMANT_TTL_MS = 30000

export function updateDormancy(sim: Sim): void {
  const half = sim.hooks.activeHalf(sim)
  if (half === Infinity) return
  const now = sim.elapsedMs
  const expired: number[] = []
  for (const eid of query(sim.world, ENEMY_SET)) {
    const within =
      Boss.v[eid] === 1 ||
      (Math.abs(Transform.x[eid]! - leaderX(sim)) <= half && Math.abs(Transform.y[eid]! - leaderY(sim)) <= half)
    if (within) {
      Dormant.v[eid] = 0
    } else if (!Dormant.v[eid]) {
      Dormant.v[eid] = 1
      Dormant.since[eid] = now
    } else if (now - Dormant.since[eid]! >= DORMANT_TTL_MS) {
      expired.push(eid)
    }
  }
  for (const eid of expired) despawnEnemy(sim, eid, false)
}
