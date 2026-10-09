import { fbm } from '../../util/noise'

/** 遗迹图集：2×2 块，每块边长 REMNANT_TILE 像素；块里的坐标以遗迹半径为 1，铺到 ±REMNANT_SPAN */
export const REMNANT_TILE = 384
export const REMNANT_PX = REMNANT_TILE * 2
export const REMNANT_SPAN = 1.2

/**
 * 图集里的四块。超新星遗迹的三块：R 是二次电离的氧发的青绿细丝，G 是激波里氢、氮、硫、氧发的橙红细丝，B 是同步辐射的蓝白。
 * 薄壳型像天鹅圈：细丝都在外缘；实心型像蟹状星云：中间是脉冲星风吹出的同步辐射，外面裹着一张红色的丝网；团块型像仙后座 A：一圈碎块。
 * 行星状星云那一块：R 是中间被白矮星电离的氧和氦（青蓝），G 是外圈氢和氮的红环与环内侧一颗颗彗星状的结，B 是更外面一圈淡淡的晕
 */
export const REMNANT_SHELL = 0
export const REMNANT_CRAB = 1
export const REMNANT_PLANETARY = 2
export const REMNANT_KNOTS = 3

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const ridge = (n: number): number => 1 - Math.abs(2 * n - 1)

/** 沿圆周取的噪声：绕一圈接得上；k 是一圈里起伏几次，rr·m 是沿半径的坐标 */
function around(th: number, rr: number, k: number, m: number, seed: number, octaves: number): number {
  const t = (th + Math.PI) / (Math.PI * 2)
  const a = fbm(t * k, rr * m, seed, octaves)
  const w = smooth(0.85, 1, t)
  return w > 0 ? a + (fbm((t - 1) * k, rr * m, seed, octaves) - a) * w : a
}

/** 外缘稍微不圆 */
function wobble(th: number, k: number, amp: number, seed: number): number {
  return 1 + amp * (around(th, 0, k, 0, seed, 2) - 0.5) * 2
}

type Tile = (x: number, y: number, seed: number) => readonly [number, number, number]

/** 薄壳型：青绿的细丝贴着外缘一弧一弧地拉长，橙红的细丝在它里面一点、碎一些，哪边亮哪边暗随机 */
const shellRemnant: Tile = (x, y, seed) => {
  const th = Math.atan2(y, x)
  const u = Math.hypot(x, y) / wobble(th, 3, 0.07, seed + 1)
  const o = ridge(around(th, u, 22, 10, seed + 2, 3)) ** 7 * smooth(0.8, 0.94, u) * smooth(1.06, 0.97, u)
  const oSide = 0.3 + 0.7 * smooth(0.3, 0.7, around(th, 0, 3, 0, seed + 3, 2))
  const h = ridge(around(th, u, 30, 14, seed + 4, 3)) ** 6 * smooth(0.66, 0.86, u) * smooth(1, 0.9, u)
  const hSide = 0.3 + 0.7 * smooth(0.35, 0.75, around(th, 0, 4, 0, seed + 5, 2))
  const inner = smooth(1, 0.2, u) * 0.1 * fbm(x * 3, y * 3, seed + 6, 3)
  return [o * oSide, h * hSide, inner]
}

/** 实心型：椭圆的一团，中间同步辐射的蓝白雾带着几缕，外面一张橙红的丝网，最外一层淡淡的青绿 */
const crabRemnant: Tile = (x, y, seed) => {
  const ex = x
  const ey = y / 0.72
  const u = Math.hypot(ex, ey) / (1 + 0.1 * (fbm(x * 1.5, y * 1.5, seed + 1, 2) - 0.5) * 2)
  const body = smooth(1, 0.8, u)
  const web = ridge(fbm(x * 4.5 + 3, y * 4.5, seed + 2, 3)) ** 5 * 0.8 + ridge(fbm(x * 9, y * 9, seed + 3, 2)) ** 7 * 0.4
  const red = web * body * (0.5 + 0.5 * smooth(0.2, 0.85, u))
  const sync = Math.exp(-(u * u) / (0.42 * 0.42)) * (0.75 + 0.25 * fbm(x * 3, y * 3, seed + 4, 3)) + ridge(fbm(x * 2.2, y * 6, seed + 5, 2)) ** 8 * smooth(0.6, 0.2, u) * 0.3
  const skin = smooth(0.82, 0.96, u) * smooth(1.08, 0.98, u) * 0.35 * fbm(x * 5, y * 5, seed + 6, 2)
  return [skin, red, sync * 0.9]
}

/** 行星状星云：中间一团斑驳的青蓝，外圈一道红环，环的内侧一颗颗朝外拖着尾巴的结，最外一圈淡淡的晕 */
const planetaryNebula: Tile = (x, y, seed) => {
  const th = Math.atan2(y, x)
  const u = Math.hypot(x, y) / wobble(th, 4, 0.05, seed + 1)
  const core = smooth(0.72, 0.38, u) * (0.65 + 0.35 * fbm(x * 5, y * 5, seed + 2, 3))
  const band = Math.exp(-(((u - 0.8) / 0.15) ** 2)) * (0.6 + 0.4 * fbm(x * 7, y * 7, seed + 3, 3))
  const knots = smooth(0.62, 0.9, around(th, u, 55, 3, seed + 4, 1)) * smooth(0.55, 0.65, u) * smooth(0.82, 0.7, u)
  const halo = Math.exp(-(((u - 1.06) / 0.07) ** 2)) * 0.35 * smooth(0.3, 0.7, around(th, 0, 3, 0, seed + 5, 2))
  return [core, Math.min(1, band + knots * 0.8), halo]
}

/** 团块型：一圈大小不一的碎块，富氧的发青绿、富硫的发红，各在各的地方，外缘一圈淡淡的同步辐射 */
const knotRemnant: Tile = (x, y, seed) => {
  const th = Math.atan2(y, x)
  const u = Math.hypot(x, y) / wobble(th, 3, 0.06, seed + 1)
  const shell = smooth(0.62, 0.8, u) * smooth(1.02, 0.88, u)
  const o = smooth(0.62, 0.82, fbm(x * 7, y * 7, seed + 2, 3)) * shell
  const s = smooth(0.6, 0.8, fbm(x * 6 + 5, y * 6 - 3, seed + 3, 3)) * shell
  const sync = (Math.exp(-(((u - 0.92) / 0.08) ** 2)) * 0.45 + smooth(0.9, 0.3, u) * 0.12) * (0.6 + 0.4 * fbm(x * 4, y * 4, seed + 4, 2))
  return [o, s, sync]
}

const TILES: readonly Tile[] = [shellRemnant, crabRemnant, planetaryNebula, knotRemnant]

/** 画遗迹图集的 [r0, r1) 行：每块的边缘淡到零，取样时不会渗进隔壁那块；数据图必须满 alpha */
export function paintRemnants(seed: number, out: Uint8ClampedArray, r0: number, r1: number): void {
  for (let py = r0; py < r1; py++) {
    const ty = py < REMNANT_TILE ? 0 : 1
    const y = (((py % REMNANT_TILE) + 0.5) / REMNANT_TILE) * 2 * REMNANT_SPAN - REMNANT_SPAN
    for (let px = 0; px < REMNANT_PX; px++) {
      const tx = px < REMNANT_TILE ? 0 : 1
      const x = (((px % REMNANT_TILE) + 0.5) / REMNANT_TILE) * 2 * REMNANT_SPAN - REMNANT_SPAN
      const edge = smooth(REMNANT_SPAN, REMNANT_SPAN - 0.08, Math.hypot(x, y))
      const o = ((py - r0) * REMNANT_PX + px) * 4
      out[o + 3] = 255
      if (edge <= 0) {
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
        continue
      }
      const c = TILES[ty * 2 + tx]!(x, y, seed + (ty * 2 + tx) * 101)
      out[o] = clamp01(c[0] * edge) * 255
      out[o + 1] = clamp01(c[1] * edge) * 255
      out[o + 2] = clamp01(c[2] * edge) * 255
    }
  }
}
