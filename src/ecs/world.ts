import { $internal, createWorld } from 'bitecs'
import type { InternalWorld } from 'bitecs'

/** 组件数组的初始容量；eid 越过即翻倍，见 storage.ts */
export const INITIAL_CAPACITY = 256

/** 活体数到此即停止生成可省的实体（刷怪、金币、碎片、敌弹） */
export const ENTITY_BUDGET = 14336

export type EcsWorld = ReturnType<typeof createWorld>

export function makeWorld(): EcsWorld {
  return createWorld()
}

export function crowded(world: EcsWorld): boolean {
  return (world as InternalWorld)[$internal].entityIndex.aliveCount >= ENTITY_BUDGET
}
