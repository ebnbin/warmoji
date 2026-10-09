export interface XpState {
  level: number
  xp: number
}

/** 经验曲线：第 n 次升级要 first × (ratio − (ratio − 1) × e^(−(n − 1) / k))，前面升得快，往后贴近第一次的 ratio 倍，不封顶 */
export interface XpCurve {
  readonly first: number
  readonly ratio: number
  readonly k: number
}
