import { hasComponent } from 'bitecs'
import { CharScale, Grow, Pop, Radius, Stats, Transform } from '../../components'
import type { EcsWorld } from '../../world'

/** 角色的画面尺寸：本来的尺寸 × 队长倍率 × 体型 */
export function charSize(eid: number): number {
  return Grow.s0[eid]! * CharScale.v[eid]! * Grow.v[eid]!
}

/** 体型按属性表变了：判定半径与画面尺寸一起跟着变；角色的画面尺寸由动画按 charSize 每帧算 */
export function rescale(world: EcsWorld, eid: number): void {
  if (!hasComponent(world, eid, Grow)) return
  const v = Stats.scale[eid]!
  Grow.v[eid] = v
  const char = hasComponent(world, eid, CharScale)
  Radius.v[eid] = Grow.r0[eid]! * (char ? CharScale.v[eid]! : 1) * v
  if (char || !hasComponent(world, eid, Pop)) return
  Pop.size[eid] = Grow.s0[eid]! * v
  if (Pop.until[eid] !== 0) return
  Transform.w[eid] = Pop.size[eid]!
  Transform.h[eid] = Pop.size[eid]!
}
