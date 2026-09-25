export function sineEaseOut(t: number): number {
  return Math.sin(t * (Math.PI / 2))
}

export function sineEaseInOut(t: number): number {
  return 0.5 * (1 - Math.cos(Math.PI * t))
}

export function cubicEaseOut(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

export function cubicEaseIn(t: number): number {
  return t * t * t
}

export function backEaseOut(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}
