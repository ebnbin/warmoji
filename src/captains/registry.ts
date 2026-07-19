import captainsJson from '../gen/captains.json'
import type { AbilityDef } from '../abilities/defs'

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 被动增益先直接建模为字段（编制上限/经验倍率等），主动技能的效果走能力系统。

// 队长主动技能：每位队长一个，跨波 CD——剩余冷却存在 run 上、只按战斗
// 时钟推进（商店/整编不走表），上一波攒的进度带进下一波。左下角按钮或
// E 键释放。触发策略（豆子弹药/CD/按钮）与效果解耦：效果本体是标准
// 能力行，同一行放进角色配装即是普通自动能力
export interface CaptainSkill {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
  /** 效果载荷：标准能力行，释放 = 逐个 castNow 单发（场景 castSkill） */
  readonly abilities: readonly AbilityDef[]
}

export interface CaptainDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 主动技能（战斗内左下角按钮释放） */
  readonly skill: CaptainSkill
  /** 编制上限：可招募的角色总数 */
  readonly teamSize: number
  /** 开局波次（通常 1）；>1 时跳过之前的波次，难度时钟按被跳过的
   * 波次时长预推进——敌人配比与强度都是该波的真实水平，且能量豆拉满；
   * 阵容仍从零起步，由玩家在整编页逐个自选招满（core/run.ts beginRun） */
  readonly startWave: number
  /** 开局金币 */
  readonly startCoins: number
  /** 全队经验获取倍率 */
  readonly xpGainMul: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
  /** 开局整编结束后是否先进商店再开战（自带开局金币的队长用） */
  readonly firstWaveShop: boolean
}

// 数据行在 defs/captains.ts（创作层），npm run gen 生成 captains.json
export type CaptainId = keyof typeof captainsJson
export const CAPTAINS = captainsJson as unknown as Record<CaptainId, CaptainDef>
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]
