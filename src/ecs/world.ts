import { createWorld } from 'bitecs'

// ECS 世界（bitECS 0.4 core API）：组件 = 按 eid 索引的 SoA 类型化数组（见 components.ts）。
// entity ↔ image 彻底解绑——实体只是 SoA 里的一行,渲染交给自绘 pipeline 批量画（见 render/）。

/** 组件数组容量上限：eid 在 [1, MAX_ENTITIES)。bitECS 回收已删 eid,并发峰值不超此值即可。
 * 上千实体留足冗余;超出会数组越界,需按需调大。 */
export const MAX_ENTITIES = 16384

export type EcsWorld = ReturnType<typeof createWorld>

/** 新建一个空 ECS 世界 */
export function makeWorld(): EcsWorld {
  return createWorld()
}
