import { createWorld } from 'bitecs'

/** 组件数组的初始容量；eid 越过即翻倍，见 storage.ts */
export const INITIAL_CAPACITY = 256

export type EcsWorld = ReturnType<typeof createWorld>

export function makeWorld(): EcsWorld {
  return createWorld()
}
