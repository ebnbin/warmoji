import captainsJson from '../assets/captains.json'
import type { AbilityId } from './abilities'
import type { AbilityDef } from './abilityDefs'

// 技能冷却只按战斗时钟推进，跨波保留
export interface CaptainSkillOf<A> {
  readonly name: string
  readonly desc: string
  readonly cdMs: number
  /** 释放时逐个单发 */
  readonly abilities: readonly A[]
}
export type CaptainSkillSource = CaptainSkillOf<AbilityId>
export type CaptainSkill = CaptainSkillOf<AbilityDef>
export interface CaptainOf<A> {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly skill: CaptainSkillOf<A>
  readonly teamSize: number
  /** 格/秒；道具 moveSpeedMul 叠乘其上 */
  readonly moveSpeed: number
  /** 格；道具 magnetMul 叠乘其上 */
  readonly coinMagnet: number
  /** 作用于 MEMBER.maxHp + 道具 */
  readonly hpMul: number
  /** 作用于 TEAM.reviveMs */
  readonly reviveMul: number
  /** >1 时难度时钟按跳过的波次预推进，阵容仍从零起步 */
  readonly startWave: number
  readonly startCoins: number
  readonly xpGainMul: number
  /** 否则存活者血量保留、阵亡者按 reviveHpRatio 复活 */
  readonly reviveInShop: boolean
  readonly freeRefreshes: number
  readonly firstWaveShop: boolean
}
/** 技能载荷以能力 id 引用 */
export type CaptainSource = CaptainOf<AbilityId>
/** 能力 id 已解析为 def */
export type CaptainDef = CaptainOf<AbilityDef>
export type CaptainId = keyof typeof captainsJson
