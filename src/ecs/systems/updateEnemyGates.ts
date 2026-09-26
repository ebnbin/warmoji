import { query } from 'bitecs'
import { Casting, Drive, Dancing, Dormant, ENEMY_SET, EnemyPhase, Morph, Slowed, Speed, Steering, Transform } from '../components'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 敌人这一帧能不能自己走：休眠、蹦迪、蓄力都不走，变形中只会慢速乱逛 */
export function updateEnemyGates(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    Drive.x[eid] = 0
    Drive.y[eid] = 0
    if (Dancing.until[eid] !== 0 && now >= Dancing.until[eid]!) {
      Dancing.until[eid] = 0
      Transform.rot[eid] = 0
    }
    if (Dormant.v[eid]) {
      Steering.v[eid] = 0
      continue
    }
    if (Dancing.until[eid] !== 0) {
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
      Steering.v[eid] = 0
      continue
    }
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      const d = wanderDir(sim, eid)
      const sp = Speed.v[eid]! * Slowed.v[eid]! * 0.5
      Drive.x[eid] = d.x * sp
      Drive.y[eid] = d.y * sp
      Steering.v[eid] = 0
      continue
    }
    if (now < Casting.until[eid]!) {
      Steering.v[eid] = 0
      continue
    }
    Steering.v[eid] = 1
  }
}
