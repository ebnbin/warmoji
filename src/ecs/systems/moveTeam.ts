import { MoveSpeed } from '../components'
import { centerX, centerY, setCenter } from '../utils/team'
import type { Sim } from '../sim'

export function moveTeam(sim: Sim): void {
  const delta = sim.dtMs
  const dir = sim.teamDir
  const step = (MoveSpeed.v[sim.captain]! * sim.battleFx.moveSpeedMul * delta) / 1000
  const drift = sim.hooks.teamDrift(sim, delta)
  const next = sim.hooks.constrainTeam(
    sim,
    { x: centerX(sim) + dir.x * step + drift.x, y: centerY(sim) + dir.y * step + drift.y },
    delta,
  )
  setCenter(sim, next.x, next.y)
}
