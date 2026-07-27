import { query } from 'bitecs'
import { AI } from '../../data/enemies'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { BVel, Slowed, Speed, Standoff, Steering, Transform } from '../components'
import { nearestAlive, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 定距风筝：太远贴近、太近后退、站位带内停手（射击由能力驱动）。
 * 几百只会在队伍四周围成一圈 */
export function steerStandoff(sim: Sim): void {
  const band = AI.standoffBandU * UNIT
  for (const eid of query(sim.world, [Standoff, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestAlive(sim, ex, ey)
    const dx = target ? target.x - ex : 0
    const dy = target ? target.y - ey : 0
    const dist = target ? Math.hypot(dx, dy) : Infinity
    if (dist > Standoff.detectRange[eid]!) {
      // 圈外只慢速游荡
      const d = wanderDir(sim, eid)
      BVel.x[eid] = d.x * sp * 0.5
      BVel.y[eid] = d.y * sp * 0.5
      continue
    }
    const stand = Standoff.standoffDist[eid]!
    if (dist > stand + band) {
      const d = norm(dx, dy)
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      continue
    }
    if (dist < stand - band) {
      // 后退:方向经世界钩子(有界图贴边沿墙滑行,不顶死在边上)
      const away = norm(-dx, -dy)
      const d = sim.hooks.fleeDir(sim, eid, away.x, away.y)
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      continue
    }
    // 站位带内停手（BVel 已由 updateEnemyGates 清零）
  }
}
