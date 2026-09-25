import type { Rng } from './rng'

export interface Palette {
  bgFrom: string
  bgTo: string
  map: number
  shadow: number
}

export function hslToInt(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const [r, g, b] = rgb
  const m = l - c / 2
  const to255 = (v: number): number => Math.round((v + m) * 255)
  return (to255(r) << 16) | (to255(g) << 8) | to255(b)
}

export function randomPalette(_rng: Rng): Palette {
  return {
    bgFrom: '#292f33',
    bgTo: '#292f33',
    map: hslToInt(205, 0.06, 0.42),
    shadow: 0x000000,
  }
}
