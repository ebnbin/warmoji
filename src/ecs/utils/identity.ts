import { entityExists } from 'bitecs'
import { Uid } from '../components'
import type { EcsWorld } from '../world'

/** 记下的 (eid, uid) 是否仍是同一个在场实体 */
export function isSameEntity(world: EcsWorld, eid: number, uid: number): boolean {
  return uid !== 0 && entityExists(world, eid) && Uid.v[eid] === uid
}
