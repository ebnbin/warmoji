import { createWorld } from 'bitecs'

export const INITIAL_CAPACITY = 256

export type EcsWorld = ReturnType<typeof createWorld>

export function makeWorld(): EcsWorld {
  return createWorld()
}
