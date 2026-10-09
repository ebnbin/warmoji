/** 精灵整块填成染色的颜色，只留下剪影 */
export const TINT_FILL = 1

// alpha 须先钳进 [0,1]：打包是 ((a * 255) | 0) & 0xff，越界会绕回低 8 位
export function packTint(rgb: number, alpha: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  return (((a * 255) | 0) << 24) | (rgb >>> 0)
}
