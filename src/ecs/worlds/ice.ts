
export function onFloe(x: number, y: number, floePx: number): boolean {
  return x >= 0 && x <= floePx && y >= 0 && y <= floePx
}
