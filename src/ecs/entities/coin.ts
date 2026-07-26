import { addComponent, addEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { PICKUPS } from '../../data/pickups'
import { Coin, Depth, Pop, Quad, Sprite, Tint, Transform, Vel } from '../components'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 金币实体的生成。金币是 emoji 精灵,天然走统一批绘。
// 磁吸 / 入账 / 弹出动画在 ../pickups.ts。

/** 掉落弹出时长(镜像 spawnCoins 的 tween duration) */
export const COIN_POP_MS = 160

/** 生成 count 枚金币(镜像 spawnCoins:多枚散开 + 入场 Back.easeOut 弹出) */
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
    Quad.v[eid] = 0
    Pop.until[eid] = sim.fxMs + COIN_POP_MS // 掉落弹出(镜像 spawnCoins 的 Back.easeOut 缩放,走视觉时钟)
  }
}
