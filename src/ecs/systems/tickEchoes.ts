import { query } from 'bitecs'
import { blastAt } from './shared/areaBlast'
import { ACQUIRE } from '../../data/abilities'
import { UNIT } from '../../util/units'
import { ownerX, ownerY } from '../utils/amp'
import { Ability, AreaBlast, Followup, Frozen } from '../components'
import { sourceOf } from '../utils/source'
import { targetsNear } from '../utils/targets'
import type { Sim } from '../sim'

export function tickEchoes(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, AreaBlast, Followup])) {
    if (Followup.left[e]! <= 0) continue
    if (Frozen.v[e]) {
      // 阵亡即作废
      Followup.left[e] = 0
      continue
    }
    Followup.left[e] = Followup.left[e]! - dt
    if (Followup.left[e]! > 0) continue
    Followup.left[e] = 0
    const ox = ownerX(e)
    const oy = ownerY(e)
    const r = ACQUIRE.range * UNIT
    const near = targetsNear(sim, sourceOf(sim, e), ox, oy, r).filter((t) => (t.x - ox) ** 2 + (t.y - oy) ** 2 <= r * r)
    if (near.length === 0) continue
    const t = near[Math.floor(Math.random() * near.length)]!
    blastAt(sim, e, t.x, t.y, Followup.damage[e]!)
  }
}
