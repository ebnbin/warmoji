import type Phaser from 'phaser'
import { browserStorage } from '../core/storage'
import { loadSettings } from '../run/settings'
import { setLabEnemies, setLabInvincible, setLabRoster } from '../run/lab'
import type { MapId } from '../maps/registry'
import type { CharacterId } from '../characters/registry'
// ── 旧框架（arcade）──
import { ARENA_SCENE_KEYS, arenaSceneFor } from '../arcade/keys'
import type { ArenaSceneKey } from '../arcade/keys'
import { installArcadeProbes } from '../arcade/probes'
import { BoundedScene } from '../arcade/maps/BoundedScene'
import { InfiniteScene } from '../arcade/maps/InfiniteScene'
import { RiverScene } from '../arcade/maps/RiverScene'
import { VoidScene } from '../arcade/maps/VoidScene'
import { RuinsScene } from '../arcade/maps/RuinsScene'
import { DayNightScene } from '../arcade/maps/DayNightScene'
import { SpaceScene } from '../arcade/maps/SpaceScene'
import { IceScene } from '../arcade/maps/IceScene'
// ── ECS 实验 ──
import { EcsBattleScene } from '../ecs/EcsBattleScene'
import { ECS_SCENE_KEY } from '../ecs/keys'
import type { EcsSceneKey } from '../ecs/keys'

// 战斗实现的唯一接线面（facade）。
//
// 本作有两套并列的战斗实现，各自成包、互不引用：
//   · src/arcade/ —— 原框架：Phaser Scene 继承 + Arcade Physics body + 一实体一 GameObject
//   · src/ecs/    —— 实验：bitECS 数据导向 + 自绘批量渲染管线
// 共享层（abilities / maps 几何 / registry / emoji / run / core …）两侧都依赖，
// 且**不反向依赖任何一侧**，故任一侧都能被整体摘除。
//
// 约束：**本文件是全仓唯一允许 import `src/arcade/` 与 `src/ecs/`（及 bitecs）的模块**，
// 由 eslint 的 no-restricted-imports 强制。项目代码一律经此处调用，于是「两套实现与
// 主干的耦合」= 本文件导出的这几项，一眼可数、不会悄悄长出新的。
//
// 淘汰其中一侧时的完整清单（只此三步）：
//   1. 删该侧目录（`src/arcade/` 或 `src/ecs/`）与它的 e2e（`e2e/ecs-*.spec.ts` 归 ECS 侧）
//   2. 本文件删掉该侧的 import 与它在 BATTLE_SCENES / BATTLE_SCENE_KEYS / battleSceneFor /
//      installBattleProbes 里的那一半；若删的是 ECS 侧，再删 settings 的 `ecs` 开关字段
//   3. eslint.config.js 去掉该侧的护栏条目与白名单条目；删 ECS 侧时一并删 package.json 的 bitecs
//
// 由实验催生、删后可回收但不影响编译的：`src/battle/hudHost.ts`——为了一个 UIScene
// 同时服务两套战斗而抽的结构化接口。只剩一个实现者时可内联回 UIScene。

export type BattleSceneKey = ArenaSceneKey | EcsSceneKey

/** 注册进 Phaser 的全部战斗场景（main.ts 的 scene 列表展开它）。
 * 两侧都注册但互斥运行——具体进哪个由 battleSceneFor 按开关决定 */
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

/** 全部战斗场景键（UIScene 探测当前宿主、main 挂战斗 BGM 用） */
export const BATTLE_SCENE_KEYS: readonly BattleSceneKey[] = [...ARENA_SCENE_KEYS, ECS_SCENE_KEY]

/** 是否启用 ECS 实验路径（读设置，默认 false） */
export function ecsEnabled(): boolean {
  return loadSettings(browserStorage()).ecs
}

/** 本图应进入的战斗场景键：ecs 开 = 统一的 ECS 场景；关 = 按世界形态路由的旧场景。
 * A/B 分流只此一处，战斗启动点（地图页/商店/整编页）都调它 */
export function battleSceneFor(mapId: MapId): BattleSceneKey {
  return ecsEnabled() ? ECS_SCENE_KEY : arenaSceneFor(mapId)
}

/** 该场景键是否是战斗场景（区别于大厅页） */
export function isBattleSceneKey(key: string): boolean {
  return (BATTLE_SCENE_KEYS as readonly string[]).includes(key)
}

/** 装两侧的 e2e 调试探针。各自只对本框架有效，随该侧一起消失。
 * `__ecsLabRoster` 之外的 __ecs* 由 EcsBattleScene 运行时自挂；旧框架那批在 arcade/probes.ts */
export function installBattleProbes(game: Phaser.Game): void {
  installArcadeProbes(game)
  // ECS 试炼场旋钮：只设定、不启动场景——供 e2e 随后经地图页测试模式进入 ECS。
  // 敌人勾选集默认清空（隔离测量：只出 e2e 显式投放的敌人）；无敌默认沿用试炼场缺省（开）
  window.__ecsLabRoster = (ids: string[], enemies: string[] = [], invincible = true): void => {
    setLabRoster(ids as CharacterId[])
    setLabEnemies(enemies)
    setLabInvincible(invincible)
  }
}
