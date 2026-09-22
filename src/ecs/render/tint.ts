// 0xAARRGGBB。alpha 须先钳进 [0,1]：打包是 ((a * 255) | 0) & 0xff，越界会绕回低 8 位。不 import phaser，以便进单测
export function packTint(rgb: number, alpha: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  return (((a * 255) | 0) << 24) | (rgb >>> 0)
}
