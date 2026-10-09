/** 出手的姿势：出手那一刻身子朝出手方向一探、拉长压扁，随后弹回；lean 是最大的倾斜（弧度），起势占 rise */
export const STRIKE_POSE = { ms: 150, rise: 0.25, stretch: 0.16, squash: 0.1, lean: 0.28 } as const

/** 蓄力的姿势：越蓄越往后仰、压低身子，到出手那一刻最深 */
export const WINDUP_POSE = { squash: 0.14, widen: 0.08, lean: 0.24 } as const

/** 出手的姿势此刻有多深，0 到 1：起势快、收势慢；从没出过手的 at 是 0 */
export function strikeDepth(fxMs: number, at: number): number {
  if (at <= 0) return 0
  const t = (fxMs - at) / STRIKE_POSE.ms
  if (!(t >= 0 && t < 1)) return 0
  return t < STRIKE_POSE.rise ? t / STRIKE_POSE.rise : (1 - t) / (1 - STRIKE_POSE.rise)
}

/** 出手的姿势还没收完：收完以后再多写一帧，把倾斜归零 */
export function striking(fxMs: number, at: number): boolean {
  return at > 0 && fxMs - at < STRIKE_POSE.ms * 1.5
}

/** 朝 angle 方向倾斜：往右的顺时针歪，往左的逆时针歪，正上正下不歪 */
export function leanToward(angle: number, amount: number): number {
  return Math.cos(angle) * amount
}
