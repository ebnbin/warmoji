import { hasComponent, query } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { Ability, Aim, Frozen, Held, Owner, Sector, Segment, Swing, Thrown, Tint, Transform, VisOff } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { muzzle } from '../utils/projectile'
import { lungeT, sweepT } from '../utils/swing'
import type { Sim } from '../sim'

/** 持械的能力把武器画在宿主手上：突刺随挥动前伸，横扫沿弧线转，其余停在握持位；徒手突刺则由宿主自己前冲 */
export function placeHeld(sim: Sim): void {
  const w = sim.world
  for (const e of query(w, [Ability, Held, Transform])) {
    const frozen = Frozen.v[e] === 1
    if (frozen) Swing.durMs[e] = 0
    const aim = Aim.rad[e]!
    const rest = Held.restOffset[e]!
    if (hasComponent(w, e, Segment) && !Segment.beam[e]) {
      const t = frozen ? 0 : lungeT(sim, e, Segment.ms[e]!)
      const dist = rest + t * (Segment.reach[e]! - rest)
      Transform.x[e] = ownerX(e) + Math.cos(aim) * dist
      Transform.y[e] = ownerY(e) + Math.sin(aim) * dist
      Transform.rot[e] = aim + Held.rotOffset[e]!
    } else if (hasComponent(w, e, Sector)) {
      const angle = aim + (sweepT(sim, e, Sector.ms[e]!) * Sector.arcDeg[e]! * DEG2RAD) / 2
      Transform.x[e] = ownerX(e) + Math.cos(angle) * rest
      Transform.y[e] = ownerY(e) + Math.sin(angle) * rest
      Transform.rot[e] = angle + Held.rotOffset[e]!
    } else {
      const p = muzzle(sim, e)
      Transform.x[e] = p.x
      Transform.y[e] = p.y
      Transform.rot[e] = aim + Held.rotOffset[e]!
    }
    Tint.alpha[e] = frozen || Thrown.n[e]! > 0 ? 0 : 1
  }
  for (const e of query(w, [Ability, Segment, Swing])) {
    if (hasComponent(w, e, Held) || Segment.lunge[e] === 0) continue
    const frozen = Frozen.v[e] === 1
    if (frozen) Swing.durMs[e] = 0
    const t = frozen ? 0 : lungeT(sim, e, Segment.ms[e]!)
    const m = Owner.eid[e]!
    VisOff.x[m] = Math.cos(Aim.rad[e]!) * t * Segment.lunge[e]!
    VisOff.y[m] = Math.sin(Aim.rad[e]!) * t * Segment.lunge[e]!
  }
}
