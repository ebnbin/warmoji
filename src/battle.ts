import type Phaser from 'phaser'
import { browserStorage } from './util/storage'
import { loadSettings } from './save/settings'
import type { MapId } from './types/maps'
// ── arcade ──
import { ARENA_SCENE_KEYS, arenaSceneFor } from './arcade/keys'
import type { ArenaSceneKey } from './arcade/keys'
import { BoundedScene } from './arcade/maps/BoundedScene'
import { InfiniteScene } from './arcade/maps/InfiniteScene'
import { RiverScene } from './arcade/maps/RiverScene'
import { VoidScene } from './arcade/maps/VoidScene'
import { RuinsScene } from './arcade/maps/RuinsScene'
import { DayNightScene } from './arcade/maps/DayNightScene'
import { SpaceScene } from './arcade/maps/SpaceScene'
import { IceScene } from './arcade/maps/IceScene'
// ── ecs ──
import { EcsBattleScene } from './ecs/EcsBattleScene'
import { ECS_SCENE_KEY } from './ecs/keys'
import type { EcsSceneKey } from './ecs/keys'

// 全仓唯一允许 import src/arcade/、src/ecs/ 与 bitecs 的模块（eslint 强制）

export type BattleSceneKey = ArenaSceneKey | EcsSceneKey

/** 全部战斗场景：都注册、互斥运行，由 battleSceneFor 选择 */
export const BATTLE_SCENES: readonly (new () => Phaser.Scene)[] = [
  BoundedScene,
  InfiniteScene,
  RiverScene,
  VoidScene,
  RuinsScene,
  DayNightScene,
  SpaceScene,
  IceScene,
  EcsBattleScene,
]

export const BATTLE_SCENE_KEYS: readonly BattleSceneKey[] = [...ARENA_SCENE_KEYS, ECS_SCENE_KEY]

export function ecsEnabled(): boolean {
  return loadSettings(browserStorage()).ecs
}

/** A/B 分流只此一处：所有战斗启动点都调它 */
export function battleSceneFor(mapId: MapId): BattleSceneKey {
  return ecsEnabled() ? ECS_SCENE_KEY : arenaSceneFor(mapId)
}

export function isBattleSceneKey(key: string): boolean {
  return (BATTLE_SCENE_KEYS as readonly string[]).includes(key)
}

