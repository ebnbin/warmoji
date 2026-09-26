import { Leap, Leaping, Phys, Rushing, VisOff } from '../components'
import { leaderPoint, placeLeader } from '../utils/team'
import { settleBody, stepBody } from './shared/body'
import { leaderGrip } from './shared/squad'
import type { Sim } from '../sim'

/** 冲刺与跳跃期间队长不听摇杆，按技能给定的轨迹走 */
export function moveTeam(sim: Sim): void {
  const dt = Math.min(sim.dtMs, 50) / 1000
  if (dt <= 0) return
  const mover = sim.leader
  const from = leaderPoint(sim)
  if (Rushing.active[mover]) {
    Rushing.msLeft[mover] = Rushing.msLeft[mover]! - dt * 1000
    const vx = Rushing.vx[mover]!
    const vy = Rushing.vy[mover]!
    const next = { x: from.x + vx * dt, y: from.y + vy * dt }
    const to = sim.hooks.constrainBody(sim, from, next, sim.dtMs)
    const moved = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
    // 被墙挡住就提前结束
    if (Math.hypot(moved.x, moved.y) < Math.hypot(next.x - from.x, next.y - from.y) * 0.5) Rushing.msLeft[mover] = 0
    Phys.vx[mover] = vx
    Phys.vy[mover] = vy
    placeLeader(sim, to.x, to.y)
    return
  }
  if (Leaping.active[mover]) {
    Leaping.msLeft[mover] = Leaping.msLeft[mover]! - dt * 1000
    const ms = Leaping.ms[mover]!
    const t = Math.min(1, 1 - Leaping.msLeft[mover]! / ms)
    const fx = Leaping.fromX[mover]!
    const fy = Leaping.fromY[mover]!
    const tx = Leaping.toX[mover]!
    const ty = Leaping.toY[mover]!
    const to = sim.hooks.wrap(sim, fx + (tx - fx) * t, fy + (ty - fy) * t)
    VisOff.y[mover] = -Math.sin(Math.PI * t) * Leap.height[Leaping.skill[mover]!]!
    Phys.vx[mover] = ((tx - fx) / ms) * 1000
    Phys.vy[mover] = ((ty - fy) / ms) * 1000
    placeLeader(sim, to.x, to.y)
    if (t >= 1) {
      VisOff.y[mover] = 0
      Leaping.landed[mover] = 1
    }
    return
  }
  const thrust = Phys.thrust[mover]! * sim.battleFx.moveSpeedMul
  const next = stepBody(
    sim,
    mover,
    from.x,
    from.y,
    { driveX: sim.teamDir.x * thrust, driveY: sim.teamDir.y * thrust, extraX: 0, extraY: 0 },
    leaderGrip(),
    dt,
  )
  const to = sim.hooks.constrainBody(sim, from, next, sim.dtMs)
  settleBody(sim, mover, from, to, dt)
  placeLeader(sim, to.x, to.y)
}
