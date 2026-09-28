export interface XpState {
  level: number
  xp: number
}

/** 经验曲线：从 n 级升到下一级要 base × growth^(n-1)，到 maxLevel 就满级 */
export interface XpCurve {
  readonly base: number
  readonly growth: number
  readonly maxLevel: number
}
