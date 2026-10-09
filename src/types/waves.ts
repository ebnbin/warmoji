import type { XpCurve } from './xp'

export interface WaveState {
  spawnIntervalMs: number
  hpMultiplier: number
}

/**
 * 难度曲线，都按难度时钟走到的秒数 t 算：
 * 敌人血量乘 1 + t / 60 × hpGrowthPerMin；
 * 没写间隔的连续刷怪，间隔在 rampSeconds 秒内从 startIntervalMs 匀速缩到 minIntervalMs，再除以人数系数 teamFactorBase + teamFactorPerMember × 队伍人数；
 * 击杀掉金币的几率从 1 起按 e^(−t / coinDropChanceHalfLifeSec) 衰减到 coinDropChanceMin。
 */
export interface DifficultyCurve {
  readonly hpGrowthPerMin: number
  readonly startIntervalMs: number
  readonly minIntervalMs: number
  readonly rampSeconds: number
  readonly teamFactorBase: number
  readonly teamFactorPerMember: number
  readonly coinDropChanceMin: number
  readonly coinDropChanceHalfLifeSec: number
}

export interface Progression {
  readonly summaryMs: number
  /** 不靠全队升级的一局的全队经验 */
  readonly xp: XpCurve
}
