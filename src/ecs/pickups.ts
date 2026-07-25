import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { UNIT } from '../core/units'
import { norm } from '../core/vec'
import { playSfx } from '../audio/sfx'
import { PICKUP, PICKUPS } from '../pickups/registry'
import { Alive, Coin, COIN_SET, Depth, Sprite, Tint, Transform, Vel } from './components'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'

// 拾取经济(镜像 pickups.ts):金币生成 / 磁吸 / 入账。金币是 emoji 精灵,天然走统一批绘。
// 磁吸与入账以队伍中心为基点(队员碰到也捡);森林无闲置漂移/世界回收(coinIdleVelocity=0)。

/** 生成 count 枚金币(镜像 spawnCoins:多枚散开;入场弹出为纯视觉,P6 补) */
export function spawnCoinsEcs(sim: Sim, atlas: EcsAtlas, x: number, y: number, count: number): void {
  const size = PICKUPS.coin.size * UNIT
  const frame = atlas.index(PICKUPS.coin.emoji, 'player')
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    // 落点交给世界钩子(浮冰:钳进冰面,免得漂进水里隔着掉血区捡不回)
    const p = sim.hooks.constrainCoin(sim, x + jx, y + jy)
    const eid = addEntity(sim.world)
    addComponent(sim.world, eid, Coin)
    addComponent(sim.world, eid, Transform)
    addComponent(sim.world, eid, Vel)
    addComponent(sim.world, eid, Sprite)
    addComponent(sim.world, eid, Tint)
    addComponent(sim.world, eid, Depth)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
    Transform.rot[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
    Vel.x[eid] = 0
    Vel.y[eid] = 0
    Sprite.frame[eid] = frame
    Sprite.flipX[eid] = 0
    Tint.color[eid] = 0xffffff
    Tint.effect[eid] = 0
    Tint.alpha[eid] = 1
    Depth.z[eid] = 3
  }
}

/** 场景侧排空本帧待落地金币(需 atlas) */
export function drainPendingCoins(sim: Sim, atlas: EcsAtlas): void {
  if (sim.pendingCoins.length === 0) return
  for (const c of sim.pendingCoins) spawnCoinsEcs(sim, atlas, c.x, c.y, c.count)
  sim.pendingCoins.length = 0
}

/** 逐帧磁吸 + 入账(镜像 magnetCoins:中心磁吸;入账半径内 / 队员近身即入账 +1 币) */
export function magnetCoinsEcs(sim: Sim, delta: number): void {
  const coins = query(sim.world, COIN_SET as unknown as object[])
  if (coins.length === 0) return
  const dt = delta / 1000
  const cx = sim.center.x
  const cy = sim.center.y
  const r2 = sim.reward.magnetRadius * sim.reward.magnetRadius
  const collect = PICKUP.collectRadius * UNIT
  const collect2 = collect * collect
  const speed = PICKUP.magnetSpeed * UNIT
  for (const eid of coins) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const dx = cx - x
    const dy = cy - y
    const dist2 = dx * dx + dy * dy
    // 入账:近队伍中心 或 近任一活着队员(镜像 overlap)
    if (dist2 <= collect2 || nearAliveMember(sim, x, y, collect2)) {
      collectCoinEcs(sim, eid)
      continue
    }
    if (dist2 < r2) {
      const dir = norm(dx, dy)
      Vel.x[eid] = dir.x * speed
      Vel.y[eid] = dir.y * speed
    } else {
      Vel.x[eid] = 0
      Vel.y[eid] = 0
    }
    Transform.x[eid] = x + Vel.x[eid]! * dt
    Transform.y[eid] = y + Vel.y[eid]! * dt
  }
}

/** 金币是否落在任一活着队员的入账半径内 */
function nearAliveMember(sim: Sim, x: number, y: number, collect2: number): boolean {
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const dx = Transform.x[m]! - x
    const dy = Transform.y[m]! - y
    if (dx * dx + dy * dy <= collect2) return true
  }
  return false
}

/** 入账一枚(镜像 collectCoin:拾取金爆 + 音效 + run.coins+1) */
function collectCoinEcs(sim: Sim, eid: number): void {
  sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 4, kind: 'coin' })
  playSfx('coin')
  sim.run.coins += 1
  removeEntity(sim.world, eid)
}
