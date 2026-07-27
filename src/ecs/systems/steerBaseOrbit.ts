import { hasComponent, query } from 'bitecs'
import { norm } from '../../util/vec'
import { BaseOrbit, BVel, Enemy, Nest, Slowed, Speed, Steering, Transform } from '../components'
import { nearestAlive } from './shared/steer'
import type { Sim } from '../sim'

/** 护巢环绕：绕巢盘旋，队员逼近巢即扑向他；巢被拆（Nest.of<0 或巢已不在）后直扑
 * （暴走档的倍率由 Orphan 在拆巢时施加，与本系统无关） */
export function steerBaseOrbit(sim: Sim): void {
  for (const eid of query(sim.world, [BaseOrbit, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestAlive(sim, ex, ey)
    const nest = Nest.of[eid]!
    let orbit = nest >= 0 && hasComponent(sim.world, nest, Enemy)
    if (orbit && target) {
      // 护巢判定:目标是「离本体最近的队员」(与扑击同一个人),再量他到巢的距离
      const td = sim.hooks.worldDelta(sim, Transform.x[nest]!, Transform.y[nest]!, target.x, target.y)
      const ar = BaseOrbit.aggroRange[eid]!
      if (td.x * td.x + td.y * td.y <= ar * ar) orbit = false
    }
    if (!orbit) {
      // 扑向队员经世界钩子(残垣图绕墙寻路)
      if (!target) continue
      const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
      BVel.x[eid] = dir.x * sp
      BVel.y[eid] = dir.y * sp
      continue
    }
    // 绕巢:切向环绕 + 半径回正(r<orbitRadius 外扩、r>orbitRadius 内收)
    const rx = ex - Transform.x[nest]!
    const ry = ey - Transform.y[nest]!
    const r = Math.hypot(rx, ry) || 1
    const want = BaseOrbit.orbitRadius[eid]!
    const radial = (want - r) / want
    const dir = norm(-ry / r + (rx / r) * radial * 1.5, rx / r + (ry / r) * radial * 1.5)
    BVel.x[eid] = dir.x * sp
    BVel.y[eid] = dir.y * sp
  }
}
