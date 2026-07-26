import type { MapId } from './maps'

export type Polarity = 'buff' | 'debuff'
/** 限时战斗层：与 teamFx 并行相乘的短时增/减益（拾取施加，逐个到期）。 */
export interface BattleEffects {
  /** 队伍移速倍率（乘） */
  moveSpeedMul: number
  /** 全队伤害倍率（乘） */
  teamDamageMul: number
  /** 全队冷却倍率（乘，<1 攻速更快） */
  teamCooldownMul: number
  /** 全队暴击率加成（加，与角色/团队暴击相加后封顶 0.5） */
  critAdd: number
  /** 全体敌人移速倍率（乘，<1 更慢；>1 敌人狂化更快） */
  enemySlowMul: number
}
export interface FieldPickupDef {
  readonly id: string
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  /** 拾取后效果的持续时长（毫秒）——短时，制造趋避的节奏 */
  readonly durationMs: number
  readonly fx: Partial<BattleEffects>
}
// 战场拾取的「设计数据」形状：各图拾取池（内容）+ 拾取管线旋钮（手感）。
// 数据行在 defs/battlefield.ts（创作层），gen 校验产出 battlefield.json；本文件只留逻辑。
export interface BattlefieldTuning {
  /** 每图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益 */
  readonly pools: Record<MapId, readonly FieldPickupDef[]>
  /** 拾取管线旋钮（格值，进战斗乘 UNIT） */
  readonly field: {
    /** 拾取半径：队伍中心进入即收（不磁吸，需主动走位） */
    readonly grabRadiusU: number
    /** 地面停留时长：无人拾取则淡出 */
    readonly groundMs: number
    /** 携带者光环半径 */
    readonly auraRadiusU: number
  }
  /** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压 */
  readonly carrierBudget: {
    /** Boss 波预算 */
    readonly boss: { readonly buff: number; readonly debuff: number }
    /** 常规波按波次分档：命中首个 wave ≤ upToWave 的档 */
    readonly waveTiers: readonly {
      readonly upToWave: number
      readonly buff: number
      readonly debuff: number
    }[]
    /** 超出所有档的兜底预算 */
    readonly fallback: { readonly buff: number; readonly debuff: number }
  }
}
/** 已激活的限时效果（拾取后短时生效） */
export interface BattleMod {
  id: string
  emoji: string
  polarity: Polarity
  until: number
  totalMs: number
  fx: Partial<BattleEffects>
}
