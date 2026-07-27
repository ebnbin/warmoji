import { hasComponent, query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { norm } from '../../util/vec'
import {
  BreaksWalls, BVel, Charge, Dash, DashDetect, DashDist, DashTime, DashTimer,
  EDir, EState, Slowed, Speed, Sprite, Steering, Transform,
} from '../components'
import { aimPoint, nearestAlive, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 锁定冲刺方向（朝最近队员或队伍中心） */
function lockDir(sim: Sim, eid: number): void {
  const to = aimPoint(sim, eid, Dash.aimTeamCenter[eid] === 1)
  if (!to) return
  const dir = norm(to.x - Transform.x[eid]!, to.y - Transform.y[eid]!)
  EDir.x[eid] = dir.x
  EDir.y[eid] = dir.y
}

/** 蓄力冲刺：蓄力（定身颤动）→ 冲刺（锁向直冲）→ 冷却 / 回到 idle 移动。
 *
 * 触发方式与冲刺长度是 def 里的两个判别联合，各自拆成了组件：
 * DashTimer/DashDetect 决定「什么时候起冲、冲完回哪个状态」，
 * DashTime/DashDist 决定「冲多久」。所以这里没有一处 `if (kind === …)`。 */
export function steerDash(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Dash, Steering, Transform, Speed])) {
    if (!Steering.v[eid]) continue
    const state = EState.v[eid]!
    const slow = Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!

    if (state === 2) {
      // 蓄力:定身颤动(脚本化姿态,主循环不再叠环境摇摆);到时进冲刺
      Transform.rot[eid] = Math.sin(now / 28) * 0.14
      if (now < Charge.windupUntil[eid]!) continue
      if (Dash.lockAtLaunch[eid]) lockDir(sim, eid)
      EState.v[eid] = 3
      const speed = Dash.dashSpeed[eid]!
      Charge.dashUntil[eid] =
        now + (hasComponent(sim.world, eid, DashTime) ? DashTime.durationMs[eid]! : (DashDist.dist[eid]! / speed) * 1000)
      Transform.rot[eid] = 0
      if (Dash.whoosh[eid]) playSfx('whoosh')
      continue
    }

    if (state === 3) {
      // 冲刺:锁向直冲;到时冷却/回追（结束的这一帧仍按冲刺速度走完）
      if (now >= Charge.dashUntil[eid]!) {
        if (hasComponent(sim.world, eid, DashTimer)) {
          EState.v[eid] = 1
          Charge.nextDashAt[eid] = now + DashTimer.intervalMs[eid]!
        } else {
          EState.v[eid] = 4
          Charge.coolUntil[eid] = now + DashDetect.cooldownMs[eid]!
        }
      }
      // 脚本化姿态:本体前倾并按冲刺方向翻转
      Transform.rot[eid] = EDir.x[eid]! * 0.3
      Sprite.flipX[eid] = EDir.x[eid]! > 0 ? 1 : 0
      // 冲刺碾墙(残垣图拆迁 Boss):沿途碾碎断壁,只在冲刺态生效
      if (hasComponent(sim.world, eid, BreaksWalls)) sim.hooks.smashWall(sim, ex, ey)
      const v = Dash.dashSpeed[eid]! * slow
      BVel.x[eid] = EDir.x[eid]! * v
      BVel.y[eid] = EDir.y[eid]! * v
      continue
    }

    // 起冲判定：两种触发各自的簿记，起冲的共同动作在下面
    let launch = false
    if (hasComponent(sim.world, eid, DashTimer)) {
      launch = now >= Charge.nextDashAt[eid]!
    } else {
      const target = state !== 4 ? nearestAlive(sim, ex, ey) : null
      if (target) {
        const dx = target.x - ex
        const dy = target.y - ey
        const r = DashDetect.range[eid]!
        launch = dx * dx + dy * dy <= r * r
      }
      // 冷却到点：回 idle（下一帧才可能再进圈起冲）
      if (!launch && state === 4 && now >= Charge.coolUntil[eid]!) EState.v[eid] = 0
    }
    if (launch) {
      // 进蓄力即锁向（可预判横躲）；'launch' 档留到起跑瞬间再锁
      if (!Dash.lockAtLaunch[eid]) lockDir(sim, eid)
      EState.v[eid] = 2
      Charge.windupUntil[eid] = now + Dash.windupMs[eid]!
      continue
    }

    // idle 移动:逼近走位经世界钩子(残垣图流场绕墙;冲刺本身仍锁直线)
    const speed = Speed.v[eid]! * slow
    if (Dash.idleChase[eid]) {
      const to = aimPoint(sim, eid, Dash.aimTeamCenter[eid] === 1)
      if (!to) continue
      const dir = sim.hooks.chaseDir(sim, eid, to.x, to.y)
      BVel.x[eid] = dir.x * speed
      BVel.y[eid] = dir.y * speed
      continue
    }
    const d = wanderDir(sim, eid)
    BVel.x[eid] = d.x * speed
    BVel.y[eid] = d.y * speed
  }
}
