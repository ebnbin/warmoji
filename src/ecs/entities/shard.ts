import { addComponent, addEntity } from 'bitecs'
import { norm } from '../../util/vec'
import { KNOCKBACK } from '../../data/abilities'
import { Depth, Quad, Shard, Sprite, Tint, Transform } from '../components'
import type { Sim } from '../sim'

// 死亡碎片的生成(镜像 spawnShards):敌人本体裂成四象限碎块,继承致死击退速度匀速飞散。
// 象限取样由渲染层的 Quad 组件负责(把该 frame 的 UV 四等分)。
// 逐帧推进与回收在 ../shards.ts。

/** 在死亡点炸出四块碎片(flingVx/Vy = 致死一击的击退速度,碎片继承之) */
export function spawnShardsEcs(
  sim: Sim,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  flipX: number,
  flingVx: number,
  flingVy: number,
): void {
  const dw = w / 2
  const dh = h / 2
  const now = sim.fxMs // 纯视觉时钟:不吃时停、不随过场冻结(镜像旧碎片的 tween 驱动)
  for (let i = 0; i < 4; i++) {
    // 翻转的敌人纹理左半显示在右侧:碎片同步镜像,保证碎裂瞬间与本体无缝
    const col = i % 2 === 0 ? -1 : 1
    const ox = (flipX ? -col : col) * (dw / 2)
    const oy = (i < 2 ? -1 : 1) * (dh / 2)
    const dir = norm(ox, oy)
    // 散开幅度收紧:碎裂足迹整体控制在原尺寸 ~1.5 倍内
    const scatter = 45 + sim.rng.next() * 65
    const eid = addEntity(sim.world)
    addComponent(sim.world, eid, Shard)
    addComponent(sim.world, eid, Transform)
    addComponent(sim.world, eid, Sprite)
    addComponent(sim.world, eid, Tint)
    addComponent(sim.world, eid, Depth)
    Transform.x[eid] = x + ox
    Transform.y[eid] = y + oy
    Transform.rot[eid] = 0
    Transform.w[eid] = dw
    Transform.h[eid] = dh
    Sprite.frame[eid] = frame
    Sprite.flipX[eid] = flipX
    Quad.v[eid] = i + 1
    Tint.color[eid] = 0xffffff
    Tint.effect[eid] = 0
    Tint.alpha[eid] = 1
    Depth.z[eid] = 6 // 与旧 shardPool 同深度(压在地面效果之上、血条之下)
    Shard.vx[eid] = flingVx + dir.x * scatter
    Shard.vy[eid] = flingVy + dir.y * scatter
    Shard.startMs[eid] = now
    Shard.until[eid] = now + KNOCKBACK.deathSlideMs
    Shard.rot[eid] = (sim.rng.next() - 0.5) * 6
    Shard.size[eid] = dw
  }
}
