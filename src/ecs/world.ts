import { createWorld } from 'bitecs'

/** eid 在 [1, MAX_ENTITIES)；并发峰值超出会数组越界 */
export const MAX_ENTITIES = 16384

export type EcsWorld = ReturnType<typeof createWorld>

export function makeWorld(): EcsWorld {
  return createWorld()
}
