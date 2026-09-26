import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { norm } from '../../util/vec'
import { KNOCKBACK } from '../../data/abilities'
import { Alive, Clock, Depth, Drive, Phys, Quad, Radius, Shard, Sprite, Tint, Transform, VisOff } from '../components'
import type { Sim } from '../sim'

/** 碎片是没有驱动的轻身体：飞出去后被地面阻力慢慢刹住 */
const SHARD_BODY = { mass: 1, drag: 5, grip: 0.2 }

export function spawnShards(
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
  const now = sim.fxMs
  for (let i = 0; i < 4; i++) {
    const col = i % 2 === 0 ? -1 : 1
    const ox = (flipX ? -col : col) * (dw / 2)
    const oy = (i < 2 ? -1 : 1) * (dh / 2)
    const dir = norm(ox, oy)
    const scatter = 45 + sim.rng.next() * 65
    const eid = newEntity(sim.world)
    addComponents(sim.world, eid, Shard, Transform, Sprite, Tint, Depth, VisOff, Phys, Drive, Clock, Alive, Radius)
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
    Depth.z[eid] = 6
    Phys.vx[eid] = flingVx + dir.x * scatter
    Phys.vy[eid] = flingVy + dir.y * scatter
    Phys.mass[eid] = SHARD_BODY.mass
    Phys.drag[eid] = SHARD_BODY.drag
    Phys.grip[eid] = SHARD_BODY.grip
    Clock.v[eid] = 1
    Alive.v[eid] = 1
    Radius.v[eid] = 0
    Shard.startMs[eid] = now
    Shard.until[eid] = now + KNOCKBACK.deathSlideMs
    Shard.rot[eid] = (sim.rng.next() - 0.5) * 6
    Shard.size[eid] = dw
  }
}
