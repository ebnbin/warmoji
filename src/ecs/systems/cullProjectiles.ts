import { hasComponent, query } from 'bitecs'
import { Linger, Proj, PROJ_SET, Transform, Vel } from '../components'
import { projSplit } from '../store'
import { splitBolt } from '../entities/projectile'
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

/** 弹体到寿命（撞上障碍的当场到寿命）、飞出世界就消失（会落地的先躺一阵，会分裂的到寿命时先裂开），敌我同一条；镜头看不看得到与射程无关 */
export function cullProjectiles(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (now >= Proj.dieAt[eid]! || sim.hooks.outside(sim, x, y)) {
      if (now >= Proj.dieAt[eid]! && settle(sim, eid)) continue
      if (projSplit[eid] && !sim.hooks.outside(sim, x, y)) splitBolt(sim, eid)
      cullProjectile(sim, eid)
    }
  }
}
