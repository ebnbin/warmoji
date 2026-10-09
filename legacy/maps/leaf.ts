import { BLADE, bladeDist, STALK_LEN, STALK_W } from './blade'

/** 飘落与漂在水上的枫叶：从上往下看、正中那片裂片的尖朝贴图的右边（x 正向），逐像素画一次 */

/** 几种飘落的叶色与各占几成：正橙、金黄、橙红、黄、朱红，还有落了几天发褐的 */
export const LEAF_COLORS: readonly { readonly weight: number; readonly rgb: readonly [number, number, number] }[] = [
  { weight: 0.32, rgb: [246, 136, 36] },
  { weight: 0.24, rgb: [244, 172, 48] },
  { weight: 0.18, rgb: [238, 104, 36] },
  { weight: 0.1, rgb: [238, 198, 70] },
  { weight: 0.06, rgb: [226, 68, 34] },
  { weight: 0.1, rgb: [180, 118, 58] },
]

/** 叶片的长占贴图边长的几成：连着叶柄整个放得下 */
const SPAN = 1.72
/** 叶片的中段（叶柄的根与正中那片的尖之间）落在贴图正中 */
const MID_U = 0.19

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * 一片七裂的鸡爪槭叶子，rgb 是它的本色：叶心浅一点、偏橙，裂片的尖深一点，边上一圈细锯齿；中脉从叶心放射到每片裂片的尖，
 * 正面的叶脉比叶肉浅；back 是翻过来的背面，颜色发白发灰、叶脉凸起来更显眼。叶柄从叶心往后伸出去，略弯
 */
export function drawLeaf(ctx: CanvasRenderingContext2D, size: number, rgb: readonly [number, number, number], back: boolean): void {
  const img = ctx.createImageData(size, size)
  const k = size / SPAN
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5 - size / 2) / k + MID_U
      const v = (py + 0.5 - size / 2) / k
      const d = bladeDist(u, v, 7, 7)
      const lobe = BLADE.lobe
      const axis = BLADE.axis
      const along = BLADE.along
      const a = clamp01(0.5 - d * k)
      let stalk = 0
      if (u < -0.1 && u > -STALK_LEN) {
        const bend = 0.12 * ((u + 0.1) / STALK_LEN) ** 2
        const w = STALK_W * (1.4 - 0.6 * ((-u - 0.1) / STALK_LEN))
        stalk = clamp01(0.5 - (Math.abs(v - bend) - w) * k)
      }
      if (a <= 0 && stalk <= 0) continue
      let r = rgb[0]
      let g = rgb[1]
      let b = rgb[2]
      const heart = lobe < 0 ? 1 : clamp01(1 - along / 0.35)
      r += (Math.min(255, r * 1.04 + 10) - r) * heart * 0.55
      g += (Math.min(255, g * 1.25 + 22) - g) * heart * 0.55
      b += (Math.min(255, b * 1.1 + 8) - b) * heart * 0.55
      const tip = lobe >= 0 ? clamp01((along - 0.55) / 0.45) : 0
      r *= 1 - 0.1 * tip
      g *= 1 - 0.22 * tip
      b *= 1 - 0.12 * tip
      const mottle = 0.95 + 0.05 * Math.sin(u * 9 + Math.sin(v * 7) * 2) * Math.sin(v * 11 - u * 3)
      r *= mottle
      g *= mottle
      b *= mottle
      if (back) {
        r = r * 0.7 + 66
        g = g * 0.62 + 64
        b = b * 0.6 + 58
      }
      // 叶脉：每片裂片一道中脉，越往尖越细
      const vw = 0.022 * (1 - 0.6 * along)
      if (lobe >= 0 && axis < vw + 0.012) {
        const vk = clamp01((vw + 0.012 - axis) / 0.012) * (back ? 0.55 : 0.35)
        r += (Math.min(255, r + 40) - r) * vk
        g += (Math.min(255, g + 56) - g) * vk
        b += (Math.min(255, b + 30) - b) * vk
      }
      if (stalk > a) {
        r = rgb[0] * 0.72 + 20
        g = rgb[1] * 0.6 + 18
        b = rgb[2] * 0.6 + 14
      }
      const o = (py * size + px) * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = Math.max(a, stalk) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
