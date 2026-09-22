import { addComponent, addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Drift, Spin } from '../components'
import { attachDrawable } from './drawable'
import type { DrawableInit } from './drawable'
import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'


export interface DecorInit extends DrawableInit {
  /** 自转 rad/s；省略即静止 */
  spin?: number
}

export function spawnDecor(world: EcsWorld, atlas: FrameIndex, init: DecorInit): number {
  const eid = newEntity(world)
  attachDrawable(world, eid, atlas, init)
  if (init.spin !== undefined) {
    addComponent(world, eid, Spin)
    Spin.rate[eid] = init.spin
  }
  return eid
}

/** init 的 x/y 只是首帧占位 */
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
