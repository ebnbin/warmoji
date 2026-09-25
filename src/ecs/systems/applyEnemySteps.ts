import { query } from 'bitecs'
import { BVel, Dormant, ENEMY_SET, EnemyVel, Step } from '../components'
import type { Sim } from '../sim'

export function applyEnemySteps(sim: Sim): void {
  const delta = sim.wdtMs
  const dt = delta / 1000
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid]) continue
    const post = sim.hooks.postSteerEnemy(sim, eid, BVel.x[eid]!, BVel.y[eid]!, delta)
    Step.x[eid] = post.vx * dt
    Step.y[eid] = post.vy * dt
    if (dt > 0) {
      EnemyVel.x[eid] = post.vx
      EnemyVel.y[eid] = post.vy
    }
  }
}
