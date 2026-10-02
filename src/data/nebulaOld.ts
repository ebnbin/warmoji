import type { NebulaOldConfig } from '../types/maps'

/** 壳层在离中心 rU 格处的引力大小，格/秒²，指向中心 */
export function shellPull(shell: NebulaOldConfig['shell'], rU: number): number {
  const { innerU: a, outerU: b, gm } = shell
  if (rU <= a) return 0
  if (rU >= b) return gm / (rU * rU)
  return (gm * (rU ** 3 - a ** 3)) / ((b ** 3 - a ** 3) * rU * rU)
}
