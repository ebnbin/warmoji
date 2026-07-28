import type Phaser from 'phaser'
import type { RunState } from './state'
import type { Polarity } from '../types/battlefield'

// HUD 与战斗场景之间的**双向接缝**：
//   HudHost   战斗 → HUD：UIScene 需要从「当前战斗场景」读到的全部东西
//   HudInput  HUD → 战斗：战斗侧需要从 HUD 读的全部东西（只有移动输入）
//
// 两套战斗实现（ArcadeBattleScene / EcsBattleScene）都按结构满足 HudHost，UIScene
// 因此不必知道自己挂在哪一套实现上——这是 A/B 两条路共用同一个 HUD 的唯一接缝。
// 抽成接口而非让 ECS 继承 ArcadeBattleScene：两套战斗内部结构完全不同（GameObject 阵
// vs 组件数组），共享的只有这张「对外读数」表。
//
// 为什么住在 run/ 而不是战斗侧或 scene/：它两边都要用，而战斗实现 ↔ scene/ 互不可见
//（eslint 双向拦着）。落在两边都够得到的下层才不用削弱那条边界；而「当前正在跑的
// 战斗场景」本就是单局运行时状态，与 run/ 的其余内容同类。

export interface HudSnapshot {
  xp: number
  xpNext: number
  level: number
  kills: number
  coins: number
  wave: number
  seconds: number
  remainMs: number
  over: boolean
  /** 终波 Boss 在场时的血量（null = 无 Boss） */
  bossHp: number | null
  bossMaxHp: number
  /** 已激活的战场拾取效果（HUD 图标 + 剩余计时） */
  battleFx: { emoji: string; polarity: Polarity; remainMs: number; totalMs: number }[]
}

/** 波末结算横幅的战果（本波增量） */
export interface WaveSummary {
  wave: number
  kills: number
  coins: number
  levels: number
}

/** 当前在跑的战斗场景（唯一）。战斗场景在 create 里登记自己，UIScene 据此取宿主。
 *
 * 为什么不按场景键反查：那要求 UIScene 知道「有哪些战斗场景键」，而那份清单属于
 * A/B facade（它才知道 arcade 有 8 个键、ecs 有 1 个），于是 war → experiments →
 * arcade/ecs → war 成环，方向是反的。改成宿主主动登记后，war 不再认识任何具体实现。
 * 也不必再担心「场景 data 跨局残留」——登记发生在 create、先于 scene.launch('ui')。
 * 不在 shutdown 清空：视口变化会单独重启 UIScene 而战斗场景照旧，清了反而读不到。 */
let active: HudHost | undefined

export function setActiveHudHost(host: HudHost): void {
  active = host
}

export function activeHudHost(): HudHost | undefined {
  return active
}

export interface HudHost {
  /** 试炼场（沙盒）：HUD 据此放开开发者面板的沙盒页签、计时改为正计时 */
  readonly sandbox: boolean
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
  /** 试炼场「无敌」旋钮变更后重算队员血量上限 */
  applySandboxInvincible(): void
}

// ── 反方向：战斗侧要从 HUD 读的全部东西 ──────────────────────────
//
// 只有一样：本帧的移动输入。之所以要立这条契约，是因为两套战斗框架此前都在
// `import type { UIScene }` + `scene.get('ui') as UIScene`，为读一个摇杆向量
// 把整个 871 行的 HUD 类拖成依赖——方向是反的：HUD 依赖战斗天经地义，
// 战斗不该认识 HUD 长什么样。收成契约后战斗侧只知道「有人会告诉我移动向量」。

/** HUD 向战斗侧提供的输入 */
export interface HudInput {
  /** 本帧移动输入（摇杆；键盘在战斗侧自行合流），未推时为零向量 */
  readonly moveVector: { x: number; y: number }
}

const NO_MOVE = { x: 0, y: 0 }
let activeInput: HudInput | undefined

export function setActiveHudInput(input: HudInput | undefined): void {
  activeInput = input
}

/** 本帧移动输入；HUD 未挂载时为零向量（战斗可以没有 HUD，反之不行） */
export function hudMoveVector(): { x: number; y: number } {
  return activeInput?.moveVector ?? NO_MOVE
}
