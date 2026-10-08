import { query, removeEntity } from 'bitecs'
import { Alive, Built, Ctl, Drive, Frozen, Minion, Swarmer } from '../components'
import { bodyRules } from '../store'
import type { Sim } from '../sim'

/** 蜜蜂：到寿命就消散；主人倒下时停飞、不蜇人 */
export function updateBees(sim: Sim): void {
  for (const b of [...query(sim.world, [Swarmer, Minion, Built, Ctl])]) {
    if (sim.elapsedMs >= Minion.dieAt[b]!) {
      bodyRules[b] = undefined
      removeEntity(sim.world, b)
      continue
    }
    const frozen = Frozen.v[Built.by[b]!] === 1
    Alive.v[b] = frozen ? 0 : 1
    Ctl.move[b] = frozen ? 0 : 1
    if (frozen) {
      Drive.x[b] = 0
      Drive.y[b] = 0
    }
  }
}
