import { query } from 'bitecs'
import { BVel, DanceWindow, Dormant, ENEMY_SET, EnemyPhase, Morph, Slow, Slowed, Speed, SpMul, Steering, Transform, ZoneSlow } from '../components'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

export function updateEnemyGates(sim: Sim): void {
  const now = sim.elapsedMs
  const until = DanceWindow.until[sim.captain]!
  if (until !== 0 && now >= until) {
    DanceWindow.until[sim.captain] = 0
    for (const eid of query(sim.world, ENEMY_SET)) Transform.rot[eid] = 0
  }
  const dancing = isDancing(sim)
  for (const eid of query(sim.world, ENEMY_SET)) {
    BVel.x[eid] = 0
    BVel.y[eid] = 0
    if (Dormant.v[eid]) {
      Steering.v[eid] = 0
      continue
    }
    const slow =
      ZoneSlow.v[eid]! *
      (now < Slow.until[eid]! ? Slow.mul[eid]! : 1) *
      SpMul.v[eid]! *
      sim.battleFx.enemySlowMul
    Slowed.v[eid] = slow
    if (dancing) {
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
      Steering.v[eid] = 0
      continue
    }
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      const d = wanderDir(sim, eid)
      const sp = Speed.v[eid]! * slow * 0.5
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      Steering.v[eid] = 0
      continue
    }
    Steering.v[eid] = 1
  }
}
