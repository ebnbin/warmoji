type UpTo4<T> = readonly [] | readonly [T] | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T]

/** 买道具攒角色经验的一局：经验攒到这些值依次升到 2 级、3 级……，最多 5 级 */
export const CHAR_XP_THRESHOLDS = [80, 320] as const satisfies UpTo4<number>
/** 角色等级的天花板：各人的上限按自己写了几级属性，都不超过它 */
export const MAX_CHAR_LEVEL = 5

export function characterLevel(xp: number): number {
  let level = 1
  for (const t of CHAR_XP_THRESHOLDS) if (xp >= t) level += 1
  return level
}
