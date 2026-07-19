/** 地面效果参数：留在地面的持续区（灼烧/毒液/…）。阵营与伤害归属由
 * 生成方注入（能力经 ctx、死亡效果在引擎侧直调）；跳伤施加语义按目标
 * 阵营分流（groundEffects.ts）。radius 为格值，进战斗经 toPx */
export interface GroundEffectDef {
  readonly radius: number
  readonly durationMs: number
  readonly tickMs: number
  readonly damage: number
  /** 视觉：主色 + 填充/描边透明度 + 入场缩放时长 */
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly enterMs: number
}
