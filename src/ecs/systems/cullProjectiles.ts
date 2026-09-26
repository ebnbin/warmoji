import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { PrevPos, Proj, PROJ_SET, Transform } from '../components'
import { cullProjectile } from './shared/projectile'
import type { Sim } from '../sim'

/** 弹体到寿命、飞出画面、飞出世界、穿过墙体就消失，敌我同一条 */
export function cullProjectiles(sim: Sim): void {
  const now = sim.elapsedMs
  const view = sim.view
  const slack = 4 * UNIT
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (
      now >= Proj.dieAt[eid]! ||
      x < view.x - slack ||
      x > view.right + slack ||
      y < view.y - slack ||
      y > view.bottom + slack ||
      sim.hooks.outside(sim, x, y) ||
      sim.hooks.wallHit(sim, PrevPos.x[eid]!, PrevPos.y[eid]!, x, y) !== null
    ) {
      cullProjectile(sim, eid)
    }
  }
}
