/** 三个颜色通道各取一个波长，微米：大致对着屏幕的红、绿、蓝 */
export const LAMBDA: readonly [number, number, number] = [0.61, 0.55, 0.465]
/** 第二辐射常数 hc/k，微米·开尔文 */
export const C2 = 14388
/** 这个色温的黑体三个通道一样亮，是白 */
export const WHITE_K = 6504
/** 小颗粒尘埃的散射截面按波长的这个负次方变：短波散射得多，被尘埃反射出来的星光偏蓝 */
export const SCATTER_POW = 1.7

export type Rgb = readonly [number, number, number]

/** 黑体在三个通道上的亮度，以 6504 K 的黑体为 1：颜色与亮度一起给出 */
export function planck(k: number): Rgb {
  const t = Math.max(k, 800)
  const at = (l: number): number => {
    const x = C2 / (l * t)
    const x0 = C2 / (l * WHITE_K)
    return (Math.exp(x0 - x) * (1 - Math.exp(-x0))) / (1 - Math.exp(-x))
  }
  return [at(LAMBDA[0]), at(LAMBDA[1]), at(LAMBDA[2])]
}

/** 只留颜色：最亮的通道归一 */
export function hue(c: Rgb): Rgb {
  const m = Math.max(c[0], c[1], c[2]) || 1
  return [c[0] / m, c[1] / m, c[2] / m]
}

/** 这种颜色的光被尘埃散射出来是什么颜色 */
export function scattered(c: Rgb): Rgb {
  const k = (l: number): number => (LAMBDA[2] / l) ** SCATTER_POW
  return hue([c[0] * k(LAMBDA[0]), c[1] * k(LAMBDA[1]), c[2]])
}

export function rgbInt(c: Rgb): number {
  const ch = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2])
}
