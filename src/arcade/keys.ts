import { MAPS } from '../data/maps'
import type { MapId } from '../types/maps'

// 旧框架（Arcade）的场景身份：每种世界形态一套独立 Scene 实现，键即身份。
// 与 ecs/keys.ts 对称——ECS 那边只有一个统一场景，这边是一族。
// 键字符串是对外契约（e2e 断言 __warmoji.scene、BGM 按键挂载），搬迁不得改动。

/** 全部竞技场场景键（每种世界形态一套独立场景实现）：注册/路由/探针共用同一份 */
export const ARENA_SCENE_KEYS = [
  'arena',
  'arenaInfinite',
  'arenaRiver',
  'arenaVoid',
  'arenaRuins',
  'arenaDayNight',
  'arenaSpace',
  'arenaIce',
] as const
export type ArenaSceneKey = (typeof ARENA_SCENE_KEYS)[number]

/** 该地图应进入的竞技场场景（每种世界形态一套独立场景实现，按图路由） */
export function arenaSceneFor(id: MapId): ArenaSceneKey {
  const kind = MAPS[id].kind
  if (kind === 'infinite') return 'arenaInfinite'
  if (kind === 'river') return 'arenaRiver'
  if (kind === 'void') return 'arenaVoid'
  if (kind === 'ruins') return 'arenaRuins'
  if (kind === 'daynight') return 'arenaDayNight'
  if (kind === 'space') return 'arenaSpace'
  if (kind === 'ice') return 'arenaIce'
  return 'arena'
}
