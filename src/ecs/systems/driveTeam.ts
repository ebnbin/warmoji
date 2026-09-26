import { Ctl, Drive, Phys, SpeedMul } from '../components'
import { leaderGrip } from './shared/squad'
import type { Sim } from '../sim'

/** 队长的驱动来自摇杆；这一帧不能自己走时不听摇杆 */
export function driveTeam(sim: Sim): void {
  const mover = sim.leader
  Phys.grip[mover] = leaderGrip()
  Drive.x[mover] = 0
  Drive.y[mover] = 0
  if (!Ctl.move[mover]) return
  const speed = (Phys.thrust[mover]! / Phys.drag[mover]!) * SpeedMul.v[mover]!
  Drive.x[mover] = sim.teamDir.x * speed
  Drive.y[mover] = sim.teamDir.y * speed
}
