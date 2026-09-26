import { Leap, Phys, VisOff } from '../components'
import { centerX, centerY, setCenter } from '../utils/team'
import { settleBody, stepBody } from './shared/body'
import { leaderGrip } from './shared/squad'
import type { Sim } from '../sim'

/** 冲刺与跳跃期间队长不听摇杆，按技能给定的轨迹走 */
export function moveTeam(sim: Sim): void {
  const dt = Math.min(sim.dtMs, 50) / 1000
  if (dt <= 0) return
  const mover = sim.leader
  const from = { x: centerX(sim), y: centerY(sim) }
  const rush = sim.rush
  if (rush) {
    rush.msLeft -= dt * 1000
    const next = { x: from.x + rush.vx * dt, y: from.y + rush.vy * dt }
    const to = sim.hooks.constrainBody(sim, from, next, sim.dtMs)
    const moved = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
    // 被墙挡住就提前结束
    if (Math.hypot(moved.x, moved.y) < Math.hypot(next.x - from.x, next.y - from.y) * 0.5) rush.msLeft = 0
    Phys.vx[mover] = rush.vx
    Phys.vy[mover] = rush.vy
    setCenter(sim, to.x, to.y)
    return
  }
  const leap = sim.leap
  if (leap) {
    leap.msLeft -= dt * 1000
    const t = Math.min(1, 1 - leap.msLeft / leap.ms)
    const next = { x: leap.fromX + (leap.toX - leap.fromX) * t, y: leap.fromY + (leap.toY - leap.fromY) * t }
    const to = sim.hooks.wrap(sim, next.x, next.y)
    VisOff.y[mover] = -Math.sin(Math.PI * t) * Leap.height[leap.e]!
    Phys.vx[mover] = ((leap.toX - leap.fromX) / leap.ms) * 1000
    Phys.vy[mover] = ((leap.toY - leap.fromY) / leap.ms) * 1000
    setCenter(sim, to.x, to.y)
    if (t >= 1) {
      VisOff.y[mover] = 0
      leap.landed = true
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
  setCenter(sim, to.x, to.y)
}
