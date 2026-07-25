import type Phaser from 'phaser'
import type { RunState } from '../run/state'
import type { HudSnapshot } from './BaseArenaScene'

// HUD 宿主契约：UIScene 需要从「当前战斗场景」读到的全部东西，仅此而已。
// 旧的 BaseArenaScene 与 ECS 实验的 EcsBattleScene 都按结构满足它，UIScene 因此
// 不必知道自己挂在哪一套战斗实现上——这是 A/B 两条路共用同一个 HUD 的唯一接缝。
// 抽成接口而非让 ECS 继承 BaseArenaScene：两套战斗内部结构完全不同（GameObject 阵
// vs 组件数组），共享的只有这张「对外读数」表。

export interface HudHost {
  /** 测试模式（沙盒）：HUD 据此显示实验室控件、计时改为正计时 */
  readonly testMode: boolean
  /** 场景事件（wave-complete / wave-warning / skill-cast / field-collected） */
  readonly events: Phaser.Events.EventEmitter
  /** 场景插件（暂停/恢复/重启/切场景） */
  readonly scene: Phaser.Scenes.ScenePlugin
  /** 当前 run（HUD 读 mapId 等） */
  readonly run: RunState
  /** 顶栏读数（经验/波次/金币/Boss 血条/战场增益…） */
  hudSnapshot(): HudSnapshot
  /** 主动技能读数（名称/冷却/就绪） */
  skillSnapshot(): { name: string; remainMs: number; cdMs: number; ready: boolean }
  /** 性能面板读数 */
  perfSnapshot(): {
    enemies: number
    projectiles: number
    coins: number
    pending: number
    objects: number
    bodies: number
    combatSec: number
    spawnIntervalMs: number
    hpMultiplier: number
  }
  /** 释放主动技能（按钮/E 键），返回是否真的放出 */
  castSkill(): boolean
  /** 测试模式免死开关变更后重算队员血量上限 */
  applyTestInvincible(): void
}
