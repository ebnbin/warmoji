import { addEntity } from 'bitecs'
import { clearEntity, ensureCapacity, resetEntityStorage } from '../storage'
import { Uid } from '../components'
import type { EcsWorld } from '../world'

let nextUid = 1

/** 新开一场：清空实体存储，编号从头数，同一场打两遍编号一样 */
export function resetEntities(): void {
  resetEntityStorage()
  nextUid = 1
}

export function newEntity(world: EcsWorld): number {
  const eid = addEntity(world)
  ensureCapacity(eid)
  clearEntity(eid)
  Uid.v[eid] = nextUid++
  return eid
}

