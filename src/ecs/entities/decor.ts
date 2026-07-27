import { addComponent, addComponents, addEntity } from 'bitecs'
import { Drift, Spin } from '../components'
import { attachDrawable } from './drawable'
import type { DrawableInit } from './drawable'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'

// 装饰物实体：草丛、蘑菇、钢板厂房的散落零件、河岸植被、水面漂浮物——
// 全是「按种子铺在图上的低透明度 emoji」，同一类东西。
//
// **会不会动是这颗装饰自己的属性，不是另一套实现**：静止的图只挂可绘制组件包，
// 会转的加 Spin，顺流漂的再加 Drift。从前不是这样——有界/无限图的装饰是 ECS 实体，
// 而奔流的岸植、工厂的零件是场景里 new 出来的 Phaser Image，水面漂浮物更是一个
// Drift[] 数组 + updateRiver 里的手写循环。同一个概念四套写法，只因为「这张图的
// 视觉层是自建的」。

export interface DecorInit extends DrawableInit {
  /** 自转 rad/s；省略即静止 */
  spin?: number
}

/** 建一个装饰物 */
export function spawnDecor(world: EcsWorld, atlas: FrameIndex, init: DecorInit): number {
  const eid = addEntity(world)
  attachDrawable(world, eid, atlas, init)
  if (init.spin !== undefined) {
    addComponent(world, eid, Spin)
    Spin.rate[eid] = init.spin
  }
  return eid
}

/** 顺流漂的装饰（奔流图水面漂浮物）：位姿每帧由 driftDecor 从 u/cross 算出，
 * 故这里 init 里的 x/y 只是首帧占位 */
export function spawnDriftDecor(
  world: EcsWorld,
  atlas: FrameIndex,
  init: DecorInit,
  d: { u: number; cross: number; speedMul: number; swayPhase: number; swayAmp: number },
): number {
  const eid = spawnDecor(world, atlas, init)
  addComponents(world, eid, Drift)
  Drift.u[eid] = d.u
  Drift.cross[eid] = d.cross
  Drift.speedMul[eid] = d.speedMul
  Drift.swayPhase[eid] = d.swayPhase
  Drift.swayAmp[eid] = d.swayAmp
  return eid
}
