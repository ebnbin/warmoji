import type Phaser from 'phaser'
import { browserStorage } from '../core/storage'
import { loadSettings } from '../run/settings'
import { arenaSceneFor } from '../maps/registry'
import type { ArenaSceneKey, MapId } from '../maps/registry'
import { setLabEnemies, setLabInvincible, setLabRoster } from '../run/lab'
import type { CharacterId } from '../characters/registry'
import { EcsBattleScene } from '../ecs/EcsBattleScene'
import { ECS_SCENE_KEY } from '../ecs/keys'
import type { EcsSceneKey } from '../ecs/keys'

// ECS 实验的唯一接线面（facade）。
//
// 约束：**本文件是全仓唯一允许 import `src/ecs/` 与 bitecs 的模块**，由 eslint 的
// no-restricted-imports 强制（见 eslint.config.js）。项目代码一律经此处调用实验，
// 于是「实验与主干的耦合」= 本文件导出的这几个函数，一眼可数、不会悄悄长出新的。
//
// 下线实验时的完整清单（只此三步，无需再审计一遍）：
//   1. 删 `src/ecs/`、`src/experiments/`、`e2e/ecs-*.spec.ts`
//   2. 三个战斗启动点 battleSceneFor(...) → arenaSceneFor(...)（MapScene / ShopScene /
//      PromoteScene）；main.ts 去掉 ECS_SCENES 展开、isEcsSceneKey 分支、installEcsProbes()；
//      UIScene 去掉 ECS_SCENE_KEY 候选项
//   3. 删 settings 的 `ecs` 开关字段、eslint 的两处 ECS 条目、package.json 的 bitecs 依赖
//
// 不在清单内但由实验催生、删后可回收的：`src/battle/hudHost.ts`——为了一个 UIScene
// 同时服务新旧两套战斗而抽的结构化接口。它不 import ECS，ECS 走后只剩一个实现者，
// 可以内联回 UIScene，留着也能跑。

export { ECS_SCENE_KEY }
export type { EcsSceneKey }

/** 注册进 Phaser 的实验场景（main.ts 的 scene 列表展开它） */
export const ECS_SCENES: readonly (new () => Phaser.Scene)[] = [EcsBattleScene]

/** 是否启用 ECS 实验路径（读设置，默认 false） */
export function ecsEnabled(): boolean {
  return loadSettings(browserStorage()).ecs
}

/** 本图应进入的战斗场景键：ecs 开 = 统一的 ECS 场景；关 = 原按世界形态路由的旧场景。
 * A/B 分流只此一处，战斗启动点（地图页/商店/整编页）都调它 */
export function battleSceneFor(mapId: MapId): ArenaSceneKey | EcsSceneKey {
  return ecsEnabled() ? ECS_SCENE_KEY : arenaSceneFor(mapId)
}

/** 该场景键是否属于实验（main.ts 按它挂战斗 BGM、UIScene 按它探测宿主） */
export function isEcsSceneKey(key: string): boolean {
  return key === ECS_SCENE_KEY
}

/** 装调试探针（e2e 用）：只设定试炼场旋钮、不启动场景——供 e2e 随后经地图页测试模式进入 ECS。
 * 敌人勾选集默认清空（隔离测量：只出 e2e 显式投放的敌人）；无敌默认沿用试炼场缺省（开）。
 * 其余 __ecs* 探针由 EcsBattleScene 自己在运行时挂，随实验一并消失 */
export function installEcsProbes(): void {
  window.__ecsLabRoster = (ids: string[], enemies: string[] = [], invincible = true): void => {
    setLabRoster(ids as CharacterId[])
    setLabEnemies(enemies)
    setLabInvincible(invincible)
  }
}
