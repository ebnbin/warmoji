import { query } from 'bitecs'
import { Alive, Built, Minion, Phys, Sprite, Swarmer, Tint } from '../components'
import type { Sim } from '../sim'

/** 蜜蜂：主人倒下时隐去；朝向跟着飞行方向，这张图本来朝右 */
export function animateBees(sim: Sim): void {
  for (const b of query(sim.world, [Swarmer, Minion, Built, Sprite, Tint])) {
    Tint.alpha[b] = Alive.v[b] ? 1 : 0
    if (!Alive.v[b]) continue
    const vx = Phys.vx[b]!
    if (Math.abs(vx) > 8) Sprite.flipX[b] = vx < 0 ? 1 : 0
  }
}
