import { addEntity } from 'bitecs'
import { ensureCapacity } from '../storage'
import type { EcsWorld } from '../world'

/** 唯一的建实体入口：编号越过组件数组容量时先扩容再交出 */
export function newEntity(world: EcsWorld): number {
  const eid = addEntity(world)
  ensureCapacity(eid)
  return eid
}
