/**
 * 首尾相接的噪声：格点的坐标按 period 取模再哈希，整圈正好 period 个格点，左右、上下两条边拼得严丝合缝。坐标以格点计
 */

/** 整数格点上的哈希，落在 [0, 1) */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number): number => t * t * (3 - 2 * t)
const wrap = (i: number, n: number): number => ((i % n) + n) % n

/** 平滑的值噪声，落在 [0, 1)，每 period 个格点重复一次 */
export function tileNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const x0 = wrap(ix, period)
  const y0 = wrap(iy, period)
  const x1 = wrap(ix + 1, period)
  const y1 = wrap(iy + 1, period)
  const a = hash(x0, y0, seed)
  const b = hash(x1, y0, seed)
  const c = hash(x0, y1, seed)
  const d = hash(x1, y1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 分形叠加：每层频率与周期都加倍、幅度减半，落在 [0, 1) */
export function tileFbm(x: number, y: number, period: number, seed: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(x * f, y * f, period * f, seed + o * 1013) * amp
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}
