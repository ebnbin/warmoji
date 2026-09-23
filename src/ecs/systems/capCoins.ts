import { hasComponent, query, removeEntity } from 'bitecs'
import { Collected, GrantCoins, Pickup } from '../components'
import { pickupDef, pickupSfx } from '../store'
import type { Sim } from '../sim'

/** 地上金币上限；掉落时不管，每帧超出即从最早落地的删起，允许一帧内短暂超额 */
const COIN_CAP = 2048

/** 已拾取、待结算的不计也不动，须排在 reapCollected 之后 */
export function capCoins(sim: Sim): void {
  const coins: number[] = []
  for (const c of query(sim.world, [Pickup, GrantCoins])) {
    if (!hasComponent(sim.world, c, Collected)) coins.push(c)
  }
  if (coins.length <= COIN_CAP) return
  coins.sort((a, b) => Pickup.bornMs[a]! - Pickup.bornMs[b]!)
  for (let i = 0; i < coins.length - COIN_CAP; i++) {
    const c = coins[i]!
    pickupDef[c] = undefined
    pickupSfx[c] = undefined
    removeEntity(sim.world, c)
  }
}
