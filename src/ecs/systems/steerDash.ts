import { hasComponent, query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { norm } from '../../util/vec'
import {
  BreaksWalls, Charge, Dash, DashDetect, DashDist, DashTime, DashTimer, Drive,
  EDir, EState, Rushing, Slowed, Speed, Sprite, Steering, Transform,
} from '../components'
import { aimPoint, nearestFoe, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

function lockDir(sim: Sim, eid: number): void {
  const to = aimPoint(sim, eid, Dash.aimLeader[eid] === 1)
  if (!to) return
  const dir = norm(to.x - Transform.x[eid]!, to.y - Transform.y[eid]!)
  EDir.x[eid] = dir.x
  EDir.y[eid] = dir.y
}

/** 突刺本身是身体上的冲刺脚本：速度精确、撞墙即止，与角色的冲刺同一条积分 */
export function steerDash(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Dash, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const state = EState.v[eid]!
    const slow = Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!

    if (state === 2) {
      Transform.rot[eid] = Math.sin(now / 28) * 0.14
      if (now < Charge.windupUntil[eid]!) continue
      if (Dash.lockAtLaunch[eid]) lockDir(sim, eid)
      EState.v[eid] = 3
      const speed = Dash.dashSpeed[eid]! * slow
      Rushing.active[eid] = 1
      Rushing.msLeft[eid] = hasComponent(sim.world, eid, DashTime)
        ? DashTime.durationMs[eid]!
        : (DashDist.dist[eid]! / Dash.dashSpeed[eid]!) * 1000
      Rushing.vx[eid] = EDir.x[eid]! * speed
      Rushing.vy[eid] = EDir.y[eid]! * speed
      Rushing.stamp[eid] = now
      Transform.rot[eid] = 0
      if (Dash.whoosh[eid]) playSfx('whoosh')
      continue
    }

    if (state === 3) {
      if (!Rushing.active[eid]) {
        if (hasComponent(sim.world, eid, DashTimer)) {
          EState.v[eid] = 1
          Charge.nextDashAt[eid] = now + DashTimer.intervalMs[eid]!
        } else {
          EState.v[eid] = 4
          Charge.coolUntil[eid] = now + DashDetect.cooldownMs[eid]!
        }
        continue
      }
      Transform.rot[eid] = EDir.x[eid]! * 0.3
      Sprite.flipX[eid] = EDir.x[eid]! > 0 ? 1 : 0
      if (hasComponent(sim.world, eid, BreaksWalls)) sim.hooks.smashWall(sim, ex, ey)
      continue
    }

    let launch = false
    if (hasComponent(sim.world, eid, DashTimer)) {
      launch = now >= Charge.nextDashAt[eid]!
    } else {
      const target = state !== 4 ? nearestFoe(sim, eid, ex, ey) : null
      if (target) {
        const dx = target.x - ex
        const dy = target.y - ey
        const r = DashDetect.range[eid]!
        launch = dx * dx + dy * dy <= r * r
      }
      if (!launch && state === 4 && now >= Charge.coolUntil[eid]!) EState.v[eid] = 0
    }
    if (launch) {
      if (!Dash.lockAtLaunch[eid]) lockDir(sim, eid)
      EState.v[eid] = 2
      Charge.windupUntil[eid] = now + Dash.windupMs[eid]!
      continue
    }

    const speed = Speed.v[eid]! * slow
    if (Dash.idleChase[eid]) {
      const to = aimPoint(sim, eid, Dash.aimLeader[eid] === 1)
      if (!to) continue
      const dir = sim.hooks.chaseDir(sim, eid, to.x, to.y)
      Drive.x[eid] = dir.x * speed
      Drive.y[eid] = dir.y * speed
      continue
    }
    const d = wanderDir(sim, eid)
    Drive.x[eid] = d.x * speed
    Drive.y[eid] = d.y * speed
  }
}
