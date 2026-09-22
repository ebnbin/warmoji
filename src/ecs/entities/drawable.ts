import { addComponents } from 'bitecs'
import { Depth, Quad, RENDERABLE, Sprite, Tint, Transform } from '../components'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'
import type { OutlineKind } from '../../emoji/svg'

// 可绘制组件包；组件集合只在 components.ts 的 RENDERABLE 声明一次，这里展开它

export interface DrawableInit {
  id: string
  /** undefined = 不描边 */
  outline: OutlineKind | undefined
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

export function attachDrawable(world: EcsWorld, eid: number, atlas: FrameIndex, init: DrawableInit): void {
  addComponents(world, eid, ...RENDERABLE, Quad)
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
