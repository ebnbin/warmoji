import abilitiesJson from '../assets/abilities.json'
import combatJson from '../assets/combat.json'
import type { AbilityDef } from './defs'

// 战斗手感常量的「设计数值」形状：数据行在 defs/combat.ts（创作层），gen 校验产出 combat.json；
// 本文件只从中派生惯用导出 KNOCKBACK/ACQUIRE，形状与数值不变。
export interface CombatTuning {
  /** 击退：命中冲量按指数衰减（tauMs）；合速度不超过 maxSpeed；致死一击尸体匀速飞 deathSlideMs */
  readonly knockback: {
    readonly tauMs: number
    readonly maxSpeed: number
    readonly deathSlideMs: number
  }
  /** 能力索敌上限（单位）：超出此距离的敌人不作为开火/瞄准目标 */
  readonly acquire: { readonly range: number }
}

const CT = combatJson as unknown as CombatTuning
export const KNOCKBACK = CT.knockback
export const ACQUIRE = CT.acquire

// 能力库：数据行在 defs/abilities.ts（创作层），npm run gen 校验并生成
// src/assets/abilities.json 打包进运行时——构建期保证合法，此处一次断言收口
export type AbilityId = keyof typeof abilitiesJson
export const ABILITIES = abilitiesJson as unknown as Record<AbilityId, AbilityDef>
