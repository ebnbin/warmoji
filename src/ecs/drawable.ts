import { addComponent } from 'bitecs'
import {
  Depth,
  Quad,
  Sprite,
  Tint,
  Transform,
} from './components'
import type { EcsWorld } from './world'
import type { FrameIndex } from './frames'
import type { OutlineKind } from '../emoji/svg'

// 「被画出来」这件事的组件包：Transform + Sprite + Tint + Depth 一次挂齐。
//
// 它**不是实体类型**，所以不在 entities/ 下——「可绘制」是任何实体都能具备的性质，
// 装饰物、持有物、召唤物、炮台、在途回旋镖各自是不同的实体，只是都想被画出来。
// 故这里只挂组件、不建实体：eid 由各实体工厂自己 addEntity 后传进来。

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

/** 给已有实体挂上可绘制组件包 */
export function attachDrawable(world: EcsWorld, eid: number, atlas: FrameIndex, init: DrawableInit): void {
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
}
