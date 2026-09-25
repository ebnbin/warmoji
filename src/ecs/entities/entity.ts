import { addEntity } from 'bitecs'
import { clearEntity, ensureCapacity } from '../storage'
import { Uid } from '../components'
import type { EcsWorld } from '../world'

let nextUid = 1

export function newEntity(world: EcsWorld): number {
  const eid = addEntity(world)
  ensureCapacity(eid)
  clearEntity(eid)
  Uid.v[eid] = nextUid++
  return eid
}

