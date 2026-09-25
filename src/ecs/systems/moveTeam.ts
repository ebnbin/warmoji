import { Phys } from '../components'
import { centerX, centerY, setCenter } from '../utils/team'
import { settleBody, stepBody } from './shared/body'
import { leaderGrip } from './shared/squad'
import type { Sim } from '../sim'

export function moveTeam(sim: Sim): void {
  const dt = Math.min(sim.dtMs, 50) / 1000
  if (dt <= 0) return
  const mover = sim.leader >= 0 ? sim.leader : sim.captain
  const thrust = Phys.thrust[mover]! * sim.battleFx.moveSpeedMul
  const from = { x: centerX(sim), y: centerY(sim) }
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
