import { addEntity } from 'bitecs'
import { ensureCapacity } from '../storage'
import { Uid } from '../components'
import type { EcsWorld } from '../world'

/** 进程内单调递增，跨局不重置 */
let nextUid = 1

/** 唯一的建实体入口：编号越过组件数组容量时先扩容，再发一个全局唯一编号 */
export function newEntity(world: EcsWorld): number {
  const eid = addEntity(world)
  ensureCapacity(eid)
  Uid.v[eid] = nextUid++
  return eid
}

