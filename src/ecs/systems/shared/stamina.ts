import { STAMINA } from '../../../data/stamina'
import { Alive, Stamina, Stats } from '../../components'
import { numChoices } from './devNumbers'
import type { Sim } from '../../sim'

const numChoice = numChoices('体力')

export const exertionScale = numChoice('stamina.exertion', '费力倍率', '所有地面每格扣的体力同乘，0 是关掉体力', [0, 0.5, 1, 1.5, 2], 1, (v) => `×${v}`)
export const draftShare = numChoice('stamina.draft', '队员跟跑', '队员只扣队长那份的多少', [0.4, 0.6, 0.8, 1], STAMINA.draft, (v) => `${Math.round(v * 100)}%`)
export const regenScale = numChoice('stamina.regen', '回复倍率', '所有身体的体力回复同乘', [0.5, 1, 1.5, 2], 1, (v) => `×${v}`)

/** 剩下的体力占体力上限的比例 */
export function staminaLeft(eid: number): number {
  return Math.max(0, 1 - Stamina.used[eid]! / Stats.maxStamina[eid]!)
}

/** 全队按最累的活人算 */
export function squadStamina(sim: Sim): number {
  let v = 1
  for (const m of sim.characters) if (Alive.v[m]) v = Math.min(v, staminaLeft(m))
  return v
}

/** 拖慢全队的队员：累到减速，还比队长更累 */
export function dragging(sim: Sim, m: number): boolean {
  const v = staminaLeft(m)
  return m !== sim.leader && Alive.v[m] === 1 && v < STAMINA.slowFrom && v < staminaLeft(sim.leader) - 0.01
}

/** 体力决定的速度倍率：低于 slowFrom 线性降到 floor */
export function fatigue(v: number): number {
  if (v >= STAMINA.slowFrom) return 1
  return STAMINA.floor + ((1 - STAMINA.floor) * v) / STAMINA.slowFrom
}
