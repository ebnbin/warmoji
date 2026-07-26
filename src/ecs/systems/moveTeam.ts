import { MoveSpeed } from '../components'
import { animateMembers, layout } from '../teamLayout'
import type { Sim } from '../sim'

/** 队伍位移 + 布局(镜像 moveTeam→layoutTeam);落点交给世界钩子(有界钳制/冰面动量) */
export function moveTeam(sim: Sim): void {
  const delta = sim.dtMs
  const dir = sim.teamDir
  const step = (MoveSpeed.v[sim.captain]! * sim.battleFx.moveSpeedMul * delta) / 1000
  const drift = sim.hooks.teamDrift(sim, delta)
  const next = sim.hooks.constrainTeam(
    sim,
    { x: sim.center.x + dir.x * step + drift.x, y: sim.center.y + dir.y * step + drift.y },
    delta,
  )
  sim.center.x = next.x
  sim.center.y = next.y
  layout(sim, delta)
  animateMembers(sim, delta)
}
