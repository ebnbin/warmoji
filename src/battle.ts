import type Phaser from 'phaser'
import { browserStorage } from './util/storage'
import { loadSettings } from './save/settings'
import type { MapId } from './types/maps'
// ── 旧框架（arcade）──
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
// ── ECS 实验 ──
import { EcsBattleScene } from './ecs/EcsBattleScene'
import { ECS_SCENE_KEY } from './ecs/keys'
import type { EcsSceneKey } from './ecs/keys'

// 战斗实现的唯一接线面（facade）。
//
// 本作有两套并列的战斗实现，各自成包、互不引用：
//   · src/arcade/ —— 原框架：Phaser Scene 继承 + Arcade Physics body + 一实体一 GameObject，
//                    能力是每（持有者×能力）一个运行时对象（arcade/abilities/）
//   · src/ecs/    —— 实验：bitECS 数据导向 + 自绘批量渲染管线，能力本身就是实体，
//                    按 kind tag 分流给各自的施放系统（ecs/ability/）
// 共享层只剩「与战斗形态无关」的那些：data 表 / types / emoji / audio / ui /
// run（局外进度：RunState、经验曲线、技能冷却、HUD 接缝）/ util。两侧都依赖它，
// 且它**不反向依赖任何一侧**，故任一侧都能被整体摘除。
//
// 战斗世界本身（命中几何 / 轨道动力学 / 敌人 AI / 各图世界模型 / 视口重映射…）
// **不在共享层**：它按两套架构各自的分层拆进了各自包内，两份代码有意重复。
// 从前它们合住在 src/war/，一个包同时服侍两套架构——省下的那点重复，代价是
// 「删掉一侧」不再是删一个目录，且这一层永远只能长成两边的最小公约数。
//
// 约束：**本文件是全仓唯一允许 import `src/arcade/` 与 `src/ecs/`（及 bitecs）的模块**，
// 由 eslint 的 no-restricted-imports 强制。项目代码一律经此处调用，于是「两套实现与
// 主干的耦合」= 本文件导出的这几项，一眼可数、不会悄悄长出新的。
//
// 淘汰其中一侧时的完整清单（两侧各实测删过一遍：src/ 编译与 lint 均通过，无残留引用）：
//   1. 删该侧目录
//   2. 本文件删掉该侧的 import 与它在 BATTLE_SCENES / BATTLE_SCENE_KEYS / battleSceneFor
//      里的那一半；删 ECS 侧再删 settings 的 `ecs` 字段
//   3. eslint.config.js 去掉该侧的护栏与白名单；删 ECS 侧一并删 package.json 的 bitecs
//   （e2e 已收敛为 smoke + gameplay 两条底线守卫，不绑任一侧实现，故无需增删）
//
// 删后共享层不会留下死文件——每个共享文件都还有别的使用方；战斗世界那部分随目录一起走。
// 另有 `src/run/hudHost.ts`——为了一个 UIScene 同时服务两套战斗而抽的双向接缝
//（HudHost：HUD 读战斗；HudInput：战斗读移动输入），只剩一个实现者时可简化。

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
 * A/B 分流只此一处，战斗启动点（地图页/商店/整编页/开发者面板）都调它。
 *
 * 曾经这里还有一条「基准模式按基准页选的框架强制路由」的特例——那是第二个真相，
 * 于是「现在跑的是哪套战斗」要看两个地方。开发者面板改成直接写 settings.ecs 后
 * 特例删除：用哪套战斗永远只由那一个开关决定 */
export function battleSceneFor(mapId: MapId): BattleSceneKey {
  return ecsEnabled() ? ECS_SCENE_KEY : arenaSceneFor(mapId)
}

/** 该场景键是否是战斗场景（区别于大厅页） */
export function isBattleSceneKey(key: string): boolean {
  return (BATTLE_SCENE_KEYS as readonly string[]).includes(key)
}

