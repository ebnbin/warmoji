import { addEntity } from 'bitecs'
import { attachDrawable } from './drawable'
import type { DrawableInit } from './drawable'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'

// 装饰物实体：草丛、蘑菇、散落零件这些纯布景。
// 除了「被画出来」之外没有任何行为——所以它只挂可绘制组件包。

/** 建一个装饰物 */
export function spawnDecor(world: EcsWorld, atlas: FrameIndex, init: DrawableInit): number {
  const eid = addEntity(world)
  attachDrawable(world, eid, atlas, init)
  return eid
}
