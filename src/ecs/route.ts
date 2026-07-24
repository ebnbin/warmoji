import { browserStorage } from '../core/storage'
import { loadSettings } from '../run/settings'
import { arenaSceneFor } from '../maps/registry'
import type { ArenaSceneKey, MapId } from '../maps/registry'
import { ECS_SCENE_KEY } from './keys'
import type { EcsSceneKey } from './keys'

// A/B 路由:战斗启动点用 battleSceneFor 取代 arenaSceneFor——
// 设置里 ecs 关(默认)→ 走原竞技场场景(逐字节等价);ecs 开 → 走 ECS 实验场景。

/** 是否启用 ECS 实验路径（读设置,默认 false） */
export function ecsEnabled(): boolean {
  return loadSettings(browserStorage()).ecs
}

/** 本图应进入的战斗场景键:ecs 开 = 统一的 ECS 场景;关 = 原按世界形态路由的旧场景 */
export function battleSceneFor(mapId: MapId): ArenaSceneKey | EcsSceneKey {
  return ecsEnabled() ? ECS_SCENE_KEY : arenaSceneFor(mapId)
}
