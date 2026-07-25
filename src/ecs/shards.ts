import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { norm } from '../core/vec'
import { KNOCKBACK } from '../abilities/registry'
import { Depth, Quad, Shard, SHARD_SET, Sprite, Tint, Transform } from './components'
import type { Sim } from './sim'

// 死亡碎片(镜像 spawnShards):敌人本体裂成四象限碎块,继承致死击退速度匀速飞散,
// 飞行中缩小到 ~1/5 并旋转淡出。象限取样由渲染层的 Quad 组件负责(把该 frame 的 UV 四等分)。

/** 在死亡点炸出四块碎片(flingVx/Vy = 致死一击的击退速度,碎片继承之) */
export function spawnShardsEcs(
  sim: Sim,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
  flipX: number,
  z: number,
  flingVx: number,
  flingVy: number,
): void {
  const dw = w / 2
  const dh = h / 2
  const now = sim.elapsedMs
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
    Depth.z[eid] = z
    Shard.vx[eid] = flingVx + dir.x * scatter
    Shard.vy[eid] = flingVy + dir.y * scatter
    Shard.startMs[eid] = now
    Shard.until[eid] = now + KNOCKBACK.deathSlideMs
    Shard.rot[eid] = (sim.rng.next() - 0.5) * 6
    Shard.size[eid] = dw
  }
}

/** 逐帧推进碎片:匀速飞散(落点过世界钩子)+ 线性缩小/旋转/淡出,到时回收 */
export function updateShards(sim: Sim, delta: number): void {
  const eids = query(sim.world, SHARD_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  for (const eid of eids) {
    const span = Shard.until[eid]! - Shard.startMs[eid]!
    const t = span > 0 ? Math.min(1, (now - Shard.startMs[eid]!) / span) : 1
    if (t >= 1) {
      Quad.v[eid] = 0
      removeEntity(sim.world, eid)
      continue
    }
    const p = sim.hooks.constrainShard(sim, Transform.x[eid]! + Shard.vx[eid]! * dt, Transform.y[eid]! + Shard.vy[eid]! * dt)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
    const size = Shard.size[eid]! * (1 - 0.8 * t)
    Transform.w[eid] = size
    Transform.h[eid] = size
    Transform.rot[eid] = Shard.rot[eid]! * t
    Tint.alpha[eid] = 1 - t
  }
}
