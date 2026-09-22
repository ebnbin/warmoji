// 打滑：速度以时间常数 tau 趋近目标速度；在冰上还是水里是纯几何判定

/** 世界像素；出界即落水 */
export function onFloe(x: number, y: number, floePx: number): boolean {
  return x >= 0 && x <= floePx && y >= 0 && y <= floePx
}

/** 一阶低通，帧率无关 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}
