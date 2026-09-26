import { Casting, Drive, LeapShape, Leaping, Phys, Sprinting, SpeedMul, Transform, VisOff } from '../components'
import { leaderGrip } from './shared/squad'
import type { Sim } from '../sim'

/** 队长的驱动来自摇杆；冲刺与跳跃期间不听摇杆，按技能给定的轨迹走；蓄力中停下 */
export function driveTeam(sim: Sim): void {
  const mover = sim.leader
  Phys.grip[mover] = leaderGrip()
  Drive.x[mover] = 0
  Drive.y[mover] = 0
  if (Sprinting.active[mover] || sim.elapsedMs < Casting.until[mover]!) return
  if (Leaping.active[mover]) {
    const dt = Math.min(sim.dtMs, 50)
    Leaping.msLeft[mover] = Leaping.msLeft[mover]! - dt
    const ms = Leaping.ms[mover]!
    const t = Math.min(1, 1 - Leaping.msLeft[mover]! / ms)
    const fx = Leaping.fromX[mover]!
    const fy = Leaping.fromY[mover]!
    const tx = Leaping.toX[mover]!
    const ty = Leaping.toY[mover]!
    const to = sim.hooks.wrap(sim, fx + (tx - fx) * t, fy + (ty - fy) * t)
    VisOff.y[mover] = -Math.sin(Math.PI * t) * LeapShape.height[Leaping.skill[mover]!]!
    Phys.vx[mover] = ((tx - fx) / ms) * 1000
    Phys.vy[mover] = ((ty - fy) / ms) * 1000
    Transform.x[mover] = to.x
    Transform.y[mover] = to.y
    if (t >= 1) {
      VisOff.y[mover] = 0
      Leaping.landed[mover] = 1
    }
    return
  }
  const speed = (Phys.thrust[mover]! / Phys.drag[mover]!) * SpeedMul.v[mover]!
  Drive.x[mover] = sim.teamDir.x * speed
  Drive.y[mover] = sim.teamDir.y * speed
}
