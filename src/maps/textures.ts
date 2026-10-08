import type Phaser from 'phaser'
import { fbm } from '../util/noise'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const tex = scene.textures.createCanvas(key, w, h)!
  if (draw) draw(tex.getContext())
  tex.refresh()
  return tex
}

/** 柔软的烟团：中心实、边缘淡出，带一点絮状的不均匀 */
export function drawPuff(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const fluff = 0.75 + 0.25 * fbm(x / 9, y / 9, 7, 3)
      const a = clamp01(1 - d) ** 1.6 * fluff
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 发光的小点：火星、蒸汽里的水珠都用它，靠着色得到颜色 */
export function drawSpark(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const a = clamp01(1 - d) ** 2.2
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
