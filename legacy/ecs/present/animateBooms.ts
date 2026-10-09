import { query } from 'bitecs'
import { Fx, FxBoom, Tint, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

export function animateBooms(sim: Sim): void {
  for (const eid of query(sim.world, [Fx, FxBoom, Transform, Tint])) {
    const e = backEaseOut((sim.fxMs - Fx.bornMs[eid]!) / Fx.durMs[eid]!)
    const s = FxBoom.size[eid]! * (0.4 + 0.6 * e)
    Transform.w[eid] = s
    Transform.h[eid] = s
    Tint.alpha[eid] = 1 - e
  }
}
