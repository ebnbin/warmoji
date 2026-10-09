import { entityExists } from 'bitecs'
import { Uid } from '../components'
import type { EcsWorld } from '../world'

export function isSameEntity(world: EcsWorld, eid: number, uid: number): boolean {
  return uid !== 0 && entityExists(world, eid) && Uid.v[eid] === uid
}
