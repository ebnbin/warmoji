import { addComponents } from 'bitecs'
import { Depth, Quad, RENDERABLE, RIM, Sprite, Tint, Transform } from '../components'
import type { Rim } from '../components'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'

export interface DrawableInit {
  id: string
  rim?: Rim
  x: number
  y: number
  size: number
  rot?: number
  flipX?: boolean
  color?: number
  effect?: number
  alpha?: number
  z?: number
}

export function attachDrawable(world: EcsWorld, eid: number, atlas: FrameIndex, init: DrawableInit): void {
  addComponents(world, eid, ...RENDERABLE, Quad)
  Transform.x[eid] = init.x
  Transform.y[eid] = init.y
  Transform.rot[eid] = init.rot ?? 0
  Transform.w[eid] = init.size
  Transform.h[eid] = init.size
  Sprite.frame[eid] = atlas.index(init.id)
  Sprite.flipX[eid] = init.flipX ? 1 : 0
  Tint.color[eid] = init.color ?? 0xffffff
  Tint.effect[eid] = init.effect ?? 0
  Tint.alpha[eid] = init.alpha ?? 1
  Tint.rim[eid] = init.rim ?? RIM.none
  Depth.z[eid] = init.z ?? 0
  Quad.v[eid] = 0
}
