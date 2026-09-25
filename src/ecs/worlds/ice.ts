
export function onFloe(x: number, y: number, floePx: number): boolean {
  return x >= 0 && x <= floePx && y >= 0 && y <= floePx
}

export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}
