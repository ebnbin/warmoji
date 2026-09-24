import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Poison } from '../components'
import { applyDamage } from './shared/combat'
import type { Sim } from '../sim'

/** 休眠者的跳伤挂起，醒来后逐帧补跳 */
export function tickPoison(sim: Sim): void {
  // 跳伤可能击杀，须先快照
  const enemies = [...query(sim.world, ENEMY_SET as unknown as object[])]
  const now = sim.elapsedMs
  for (const eid of enemies) {
    if (Poison.until[eid] === 0 || Dormant.v[eid]) continue
    // 落在 until 上的那一跳也算
    if (now >= Poison.nextTick[eid]! && Poison.nextTick[eid]! <= Poison.until[eid]!) {
      Poison.nextTick[eid] = Poison.nextTick[eid]! + Poison.tickMs[eid]!
      applyDamage(sim, eid, Poison.dmg[eid]!, 0, undefined, undefined, Poison.slot[eid]!)
      continue
    }
    if (now >= Poison.until[eid]!) Poison.until[eid] = 0
  }
}
