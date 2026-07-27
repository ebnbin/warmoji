import type { Rng } from './rng'

export interface Palette {
  /** CSS 渐变起点（左上） */
  bgFrom: string
  /** CSS 渐变终点（右下） */
  bgTo: string
  /** 地图面填充色（Phaser 数值色） */
  map: number
  shadow: number
}

/** h: 0-360, s/l: 0-1 → 0xRRGGBB */
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

/** 菜单（game scope）固定中性背景 #292f33；地图面保持一个中性值。
 * rng 已不再使用（背景固定），保留签名以兼容各场景调用点 */
export function randomPalette(_rng: Rng): Palette {
  return {
    bgFrom: '#292f33',
    bgTo: '#292f33',
    map: hslToInt(205, 0.06, 0.42),
    shadow: 0x000000,
  }
}
