type UpTo4<T> = readonly [] | readonly [T] | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T]

/** 角色经验攒到这些值依次升到 2 级、3 级……，最多 5 级 */
export const CHAR_XP_THRESHOLDS = [80, 320] as const satisfies UpTo4<number>
export const MAX_CHAR_LEVEL = CHAR_XP_THRESHOLDS.length + 1

export function characterLevel(xp: number): number {
  let level = 1
  for (const t of CHAR_XP_THRESHOLDS) if (xp >= t) level += 1
  return level
}
