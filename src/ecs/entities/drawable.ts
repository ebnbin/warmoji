import { addComponents } from 'bitecs'
import { Depth, Quad, RENDERABLE, Sprite, Tint, Transform } from '../components'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'
import type { OutlineKind } from '../../emoji/svg'

// 「被画出来」这件事的组件包（bundle）：一次挂齐 RENDERABLE 那几件 + 取样象限。
//
// 它**不建实体**——eid 由各实体工厂 addEntity 后传进来。这不是异类：entities/ 里的
// 东西全都是「把组件挂齐」，只是 spawnX 挂到一颗新实体上、attachX 挂到已有实体上。
// 「可绘制」是任何实体都能具备的性质，装饰物、持有物、召唤物、炮台、在途回旋镖
// 各自是不同的实体，只是都想被画出来。
//
// **组件集合只在 components.ts 的 RENDERABLE 声明一次**，这里展开它。
// 两处各写一份的话，往渲染包里加组件而漏改一边是静默的：要么写好了却永远不进批绘，
// 要么进了批绘但那个字段是上一位住户的残值。Quad 从前就是这样——只写值没挂组件，
// 全项目只有在途镖那一处真的 addComponent 过它。

export interface DrawableInit {
  id: string
  /** 描边阵营；undefined = 不描边（特效贴图用，见 frames.ts） */
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

/** 给已有实体挂上可绘制组件包 */
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
