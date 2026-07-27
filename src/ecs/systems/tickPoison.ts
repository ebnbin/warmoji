import { query } from 'bitecs'
import { ENEMY_SET, Poison } from '../components'
import { applyDamage } from './shared/combat'
import type { Sim } from '../sim'

/** 中毒 DoT:每 tickMs 一跳,到期解毒(镜像 steerEnemies 的毒逻辑核心) */
export function tickPoison(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  const now = sim.elapsedMs
  for (const eid of enemies) {
    if (Poison.until[eid] === 0) continue
    if (now >= Poison.until[eid]!) {
      Poison.until[eid] = 0
      continue
    }
    if (now >= Poison.nextTick[eid]!) {
      Poison.nextTick[eid] = Poison.nextTick[eid]! + Poison.tickMs[eid]!
      applyDamage(sim, eid, Poison.dmg[eid]!, 0, undefined, undefined, Poison.slot[eid]!)
    }
  }
}
