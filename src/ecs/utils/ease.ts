// 与 Phaser 同名缓动同参

/** Sine.easeOut */
export function sineEaseOut(t: number): number {
  return Math.sin(t * (Math.PI / 2))
}

/** Sine.easeInOut */
export function sineEaseInOut(t: number): number {
  return 0.5 * (1 - Math.cos(Math.PI * t))
}

/** Cubic.easeOut */
export function cubicEaseOut(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

/** Cubic.easeIn */
export function cubicEaseIn(t: number): number {
  return t * t * t
}

/** Back.easeOut，Phaser 默认过冲量 */
export function backEaseOut(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}
