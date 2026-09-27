import { STAMINA } from '../../../data/stamina'
import { Alive, Stamina } from '../../components'
import type { Sim } from '../../sim'

/** 全队按最累的活人算 */
export function squadStamina(sim: Sim): number {
  let v = 1
  for (const m of sim.characters) if (Alive.v[m]) v = Math.min(v, Stamina.v[m]!)
  return v
}

/** 拖慢全队的队员：累到减速，还比队长更累 */
export function dragging(sim: Sim, m: number): boolean {
  const v = Stamina.v[m]!
  return m !== sim.leader && Alive.v[m] === 1 && v < STAMINA.slowFrom && v < Stamina.v[sim.leader]! - 0.01
}

/** 体力决定的速度倍率：低于 slowFrom 线性降到 floor */
export function fatigue(v: number): number {
  if (v >= STAMINA.slowFrom) return 1
  return STAMINA.floor + ((1 - STAMINA.floor) * v) / STAMINA.slowFrom
}
