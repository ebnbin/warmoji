import captainsJson from '../assets/captains.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'

// 队长主动技能：每位队长一个，跨波 CD——剩余冷却存在 run 上、只按战斗
// 时钟推进（商店/整编不走表），上一波攒的进度带进下一波。左下角按钮或
// E 键释放。触发策略（豆子弹药/CD/按钮）与效果解耦：效果本体是标准
// 能力行，同一行放进角色配装即是普通自动能力
export interface CaptainSkillOf<A> {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
  /** 效果载荷：标准能力行，释放 = 逐个 castNow 单发（场景 castSkill） */
  readonly abilities: readonly A[]
}
export type CaptainSkillSource = CaptainSkillOf<AbilityId>
export type CaptainSkill = CaptainSkillOf<AbilityDef>
export interface CaptainOf<A> {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 主动技能（战斗内左下角按钮释放） */
  readonly skill: CaptainSkillOf<A>
  /** 编制上限：可招募的角色总数 */
  readonly teamSize: number
  /** 队伍移动速度（格/秒，每队长自己的绝对基线；道具 moveSpeedMul 叠乘其上） */
  readonly moveSpeed: number
  /** 金币拾取磁吸半径（格，绝对基线；道具 magnetMul 叠乘） */
  readonly coinMagnet: number
  /** 全队生命上限乘数：血量基数由队员层定（MEMBER.maxHp + 道具），队长按此缩放 */
  readonly hpMul: number
  /** 复活时间乘数（作用于 TEAM.reviveMs 基线；<1 更快复活） */
  readonly reviveMul: number
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
/** 创作层书写形态：技能载荷以能力 id 引用（gen 校验引用存在且 kind 可释放） */
export type CaptainSource = CaptainOf<AbilityId>
/** 运行时形态：能力 id 已解析为 def */
export type CaptainDef = CaptainOf<AbilityDef>
// 数据行在 defs/captains.ts（创作层），npm run gen 生成 captains.json
export type CaptainId = keyof typeof captainsJson
