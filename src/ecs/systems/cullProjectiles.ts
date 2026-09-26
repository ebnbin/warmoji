import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { Linger, PrevPos, Proj, PROJ_SET, Transform, Vel } from '../components'
import { cullProjectile } from './shared/projectile'
import type { Sim } from '../sim'

/** 会落地的弹体飞完就停在原地躺着 */
function settle(sim: Sim, eid: number): boolean {
  if (!hasComponent(sim.world, eid, Linger) || Linger.back[eid] || Linger.until[eid]! > 0 || Linger.ms[eid]! <= 0) return false
  Vel.x[eid] = 0
  Vel.y[eid] = 0
  Proj.spin[eid] = 0
  Linger.until[eid] = sim.elapsedMs + Linger.ms[eid]!
  Proj.dieAt[eid] = Linger.until[eid]!
  return true
}

/** 弹体到寿命、飞出画面、飞出世界、穿过墙体就消失（会落地的先躺一阵），敌我同一条 */
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
      if (now >= Proj.dieAt[eid]! && settle(sim, eid)) continue
      cullProjectile(sim, eid)
    }
  }
}
