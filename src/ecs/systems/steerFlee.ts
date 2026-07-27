import { query } from 'bitecs'
import { AI } from '../../data/enemies'
import { norm } from '../../util/vec'
import { BVel, Flee, Slowed, Speed, Steering, Transform } from '../components'
import { nearestAlive, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 逃跑：队伍进 range 就背身逃开（方向经世界钩子修正，有界图贴边沿墙滑行），
 * 否则慢速游荡 */
export function steerFlee(sim: Sim): void {
  for (const eid of query(sim.world, [Flee, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const speed = Speed.v[eid]!
    const slow = Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestAlive(sim, ex, ey)
    if (target) {
      const d = sim.hooks.worldDelta(sim, ex, ey, target.x, target.y)
      const r = Flee.range[eid]!
      if (d.x * d.x + d.y * d.y <= r * r) {
        const away = norm(-d.x, -d.y)
        const dir = sim.hooks.fleeDir(sim, eid, away.x, away.y)
        BVel.x[eid] = dir.x * speed * slow
        BVel.y[eid] = dir.y * speed * slow
        continue
      }
    }
    const w = wanderDir(sim, eid)
    const sp = speed * AI.fleeIdleSpeedMul * slow
    BVel.x[eid] = w.x * sp
    BVel.y[eid] = w.y * sp
  }
}
