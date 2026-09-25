export function packTint(rgb: number, alpha: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  return (((a * 255) | 0) << 24) | (rgb >>> 0)
}
