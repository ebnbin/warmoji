import { query, removeEntity } from 'bitecs'
import { Alive, Built, Ctl, Drive, Frozen, Minion, Phys, Sprite, Swarmer, Tint } from '../components'
import { bodyRules } from '../store'
import type { Sim } from '../sim'

/** 蜜蜂：到寿命就消散；主人倒下时隐去、停飞、不蜇人；朝向跟着飞行方向 */
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
    Tint.alpha[b] = frozen ? 0 : 1
    if (frozen) {
      Drive.x[b] = 0
      Drive.y[b] = 0
      continue
    }
    const vx = Phys.vx[b]!
    if (Math.abs(vx) > 8) Sprite.flipX[b] = vx < 0 ? 1 : 0
  }
}
