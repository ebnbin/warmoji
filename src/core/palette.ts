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

/** 每局随机的低饱和度配色：暗色渐变背景 + 同色相粉彩地图面 */
export function randomPalette(rng: Rng): Palette {
  const h = rng.int(0, 359)
  return {
    bgFrom: `hsl(${h} 28% 34%)`,
    bgTo: `hsl(${(h + 40) % 360} 28% 20%)`,
    map: hslToInt(h, 0.35, 0.72),
    shadow: 0x000000,
  }
}
