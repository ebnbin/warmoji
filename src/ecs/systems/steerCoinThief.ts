import { hasComponent, query, removeEntity } from 'bitecs'
import { AI } from '../../data/enemies'
import { PICKUPS } from '../../data/pickups'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { BVel, CoinThief, GrantCoins, PICKUP_SET, Radius, Slowed, Speed, Steering, Thief, Transform } from '../components'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 偷币鼠：直奔最近金币，贴上按冷却逐枚吞（偷走不入账）；没金币慢速游荡。
 * 吞下的币死亡时吐回（+利息），见 grantKillRewards */
export function steerCoinThief(sim: Sim): void {
  for (const eid of query(sim.world, [CoinThief, Steering, Transform, Speed, Radius])) {
    if (!Steering.v[eid]) continue
    const slow = Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    let coin = -1
    let bestD = Infinity
    let coinX = 0
    let coinY = 0
    for (const c of query(sim.world, PICKUP_SET as unknown as object[])) {
      if (!hasComponent(sim.world, c, GrantCoins)) continue // 只认给钱的:战场增/减益不是它的口粮
      const w = sim.hooks.worldDelta(sim, ex, ey, Transform.x[c]!, Transform.y[c]!)
      const d = w.x * w.x + w.y * w.y
      if (d < bestD) {
        bestD = d
        coin = c
        coinX = ex + w.x
        coinY = ey + w.y
      }
    }
    if (coin < 0) {
      // 没金币:慢速游荡
      const d = wanderDir(sim, eid)
      const sp = Speed.v[eid]! * 0.3 * slow
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      continue
    }
    const eatR = Radius.v[eid]! + PICKUPS.coin.radius * UNIT
    if (bestD <= eatR * eatR) {
      // 贴上金币:过冷却才吞一枚(偷走,不入账)；吞的这一帧不移动
      if (sim.elapsedMs >= Thief.nextEatAt[eid]!) {
        removeEntity(sim.world, coin)
        Thief.eaten[eid] = Thief.eaten[eid]! + 1
        Thief.nextEatAt[eid] = sim.elapsedMs + AI.coinThiefEatCdMs
      }
      continue
    }
    const dir = norm(coinX - ex, coinY - ey)
    const sp = Speed.v[eid]! * slow
    BVel.x[eid] = dir.x * sp
    BVel.y[eid] = dir.y * sp
  }
}
