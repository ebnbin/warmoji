import { UNIT } from '../../util/units'
import { SQUAD } from '../../data/feel'
import { Alive, Facing, Phys } from '../components'
import type { Sim } from '../sim'

const HEADING_MIN = 0.5

/** 朝向：速度先低通滤波，滤波后快过阈值才更新，静止时保留上一次的方向 */
export function faceCharacters(sim: Sim): void {
  const k = Math.min(1, sim.dtMs / SQUAD.facingTauMs)
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    const fvx = Facing.vx[eid]! + (Phys.vx[eid]! - Facing.vx[eid]!) * k
    const fvy = Facing.vy[eid]! + (Phys.vy[eid]! - Facing.vy[eid]!) * k
    Facing.vx[eid] = fvx
    Facing.vy[eid] = fvy
    const speed = Math.hypot(fvx, fvy)
    if (speed <= HEADING_MIN * UNIT) continue
    Facing.x[eid] = fvx / speed
    Facing.y[eid] = fvy / speed
  }
}
