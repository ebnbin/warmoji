import type { MapId } from './maps'

export type Polarity = 'buff' | 'debuff'
/** 与 teamFx 相乘 */
export interface BattleEffects {
  /** 队伍移速倍率（乘） */
  moveSpeedMul: number
  /** 全队伤害倍率（乘） */
  teamDamageMul: number
  /** 全队冷却倍率（乘，<1 攻速更快） */
  teamCooldownMul: number
  /** 全队暴击率加成（加，与角色/团队暴击相加后封顶 0.5） */
  critAdd: number
  /** 全体敌人移速倍率（乘） */
  enemySlowMul: number
}
export interface FieldPickupDef {
  readonly id: string
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  readonly durationMs: number
  readonly fx: Partial<BattleEffects>
}
export interface BattlefieldTuning {
  /** 每图至少 1 增益 + 1 减益 */
  readonly pools: Record<MapId, readonly FieldPickupDef[]>
  /** 单位：格 */
  readonly field: {
    /** 队伍中心进入即收，不磁吸 */
    readonly grabRadiusU: number
    readonly groundMs: number
    readonly auraRadiusU: number
  }
  /** 固定数量，非概率 */
  readonly carrierBudget: {
    readonly boss: { readonly buff: number; readonly debuff: number }
    /** 命中首个 wave ≤ upToWave 的档 */
    readonly waveTiers: readonly {
      readonly upToWave: number
      readonly buff: number
      readonly debuff: number
    }[]
    readonly fallback: { readonly buff: number; readonly debuff: number }
  }
}
export interface BattleMod {
  id: string
  emoji: string
  polarity: Polarity
  until: number
  totalMs: number
  fx: Partial<BattleEffects>
}
