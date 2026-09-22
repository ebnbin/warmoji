import { $internal, createWorld } from 'bitecs'
import type { InternalWorld } from 'bitecs'

/** eid 在 [1, MAX_ENTITIES)；并发峰值超出会数组越界 */
export const MAX_ENTITIES = 16384

/** 活体数到此即停止生成可省的实体（刷怪、金币、碎片、敌弹），余量留给其余生成路径，保证 eid 不越过 MAX_ENTITIES */
export const ENTITY_BUDGET = MAX_ENTITIES - 2048

export type EcsWorld = ReturnType<typeof createWorld>

export function makeWorld(): EcsWorld {
  return createWorld()
}

export function crowded(world: EcsWorld): boolean {
  return (world as InternalWorld)[$internal].entityIndex.aliveCount >= ENTITY_BUDGET
}
