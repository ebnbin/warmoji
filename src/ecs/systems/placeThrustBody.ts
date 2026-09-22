import { hasComponent, query } from 'bitecs'
import { lungeT } from '../utils/thrust'
import { Ability, Aim, Followup, Frozen, Held, Owner, Swing, Thrust, Tint, Transform, VisOff } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

export function placeThrustBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, Thrust, Aim, Swing])) {
    const frozen = Frozen.v[e] === 1
    if (frozen) {
      // 阵亡即收势
      Swing.durMs[e] = 0
      Followup.left[e] = 0
    }
    const t = frozen ? 0 : lungeT(sim, e, Thrust.thrustMs[e]!)
    if (hasComponent(sim.world, e, Held)) {
      const aim = Aim.rad[e]!
      const rest = Held.restOffset[e]!
      const dist = rest + t * (Thrust.reach[e]! - rest)
      Transform.x[e] = ownerX(e) + Math.cos(aim) * dist
      Transform.y[e] = ownerY(e) + Math.sin(aim) * dist
      Transform.rot[e] = aim + Held.rotOffset[e]!
      Tint.alpha[e] = frozen ? 0 : 1
      continue
    }
    const m = Owner.eid[e]!
    VisOff.x[m] = Math.cos(Aim.rad[e]!) * t * Thrust.lungeDist[e]!
    VisOff.y[m] = Math.sin(Aim.rad[e]!) * t * Thrust.lungeDist[e]!
  }
}
