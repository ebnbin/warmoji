import { addComponent, addEntity } from 'bitecs'
import {
  Depth,
  Quad,
  Sprite,
  Tint,
  Transform,
} from '../components'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'
import type { OutlineKind } from '../../emoji/svg'

// 「可绘制实体」的通用底座：只挂 Transform + Sprite + Tint + Depth,别的一概不管。
// 装饰物(草丛/蘑菇)直接用它;能力的持有物、召唤物、炮台、在途回旋镖先用它建壳,
// 再由各自的工厂追加专属组件。
// 注意与 Sprite **组件**区分:那是「怎么画」,这里是「建一个只负责被画的实体」。

export interface DrawableInit {
  id: string
  outline: OutlineKind
  x: number
  y: number
  /** 显示尺寸(世界像素,正方) */
  size: number
  rot?: number
  flipX?: boolean
  /** 0xRRGGBB;默认白=原色 */
  color?: number
  /** 0=正常相乘 1=纯色填充(闪白) */
  effect?: number
  alpha?: number
  z?: number
}

/** 装配一个可渲染实体(Transform+Sprite+Tint+Depth),返回 eid */
export function spawnDrawable(world: EcsWorld, atlas: FrameIndex, init: DrawableInit): number {
  const eid = addEntity(world)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  Transform.x[eid] = init.x
  Transform.y[eid] = init.y
  Transform.rot[eid] = init.rot ?? 0
  Transform.w[eid] = init.size
  Transform.h[eid] = init.size
  Sprite.frame[eid] = atlas.index(init.id, init.outline)
  Sprite.flipX[eid] = init.flipX ? 1 : 0
  Tint.color[eid] = init.color ?? 0xffffff
  Tint.effect[eid] = init.effect ?? 0
  Tint.alpha[eid] = init.alpha ?? 1
  Depth.z[eid] = init.z ?? 0
  Quad.v[eid] = 0
  return eid
}
