import { UNIT } from '../../util/units.ts'
import { SUN } from '../../data/light.ts'
import { cellNearest, fbm, valueNoise } from '../../util/noise.ts'
import { bilinear, smooth } from '../worlds/floe.ts'
import type { FloeField } from '../worlds/floe.ts'

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 南极夏天的太阳整天贴着地平线绕：方位与角色的光一致，只是低得多，雪堆拖出长长的蓝影 */
const SUN_ELEV = 24 * (Math.PI / 180)
const SUN_H = Math.hypot(SUN.x, SUN.y)
export const LIGHT = {
  x: (SUN.x / SUN_H) * Math.cos(SUN_ELEV),
  y: (SUN.y / SUN_H) * Math.cos(SUN_ELEV),
  z: Math.sin(SUN_ELEV),
} as const
/** 地面上一点朝太阳那一侧的水平单位方向，与太阳的仰角正切 */
export const TOWARD = { x: SUN.x / SUN_H, y: SUN.y / SUN_H }
const SUN_TAN = Math.tan(SUN_ELEV)

/** 冰面贴图每格多少像素 */
export const FLOE_PPU = 32
/** 高度图每格分几份：雪棱比距离场的格子细 */
const HEIGHT_SPLIT = 2
/** 冰缘断口顶上那一点圆肩有多宽，格：冰面平到边上，在这一窄条里落到海面 */
const LIP_U = 0.07

/** 画冰面用到的东西：只有数据，能整个发给画冰面的线程；贴图左上角在 (x0, y0) 像素，w × h 个贴图像素 */
export interface FloeCanvas {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly edge: Float32Array
  readonly snow: Float32Array
  readonly young: Float32Array
  readonly hcols: number
  readonly hrows: number
  readonly hcell: number
  readonly hx0: number
  readonly hy0: number
  /** 冰面高出海面多少，米 */
  readonly height: Float32Array
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
  readonly ppu: number
  readonly windAngle: number
  readonly seed: number
  readonly meterPerU: number
}

/** 雪棱：顺着风拉长的一道道棱，沿风向慢、横着风快，取山脊形；只在一片片风大的地方有 */
function sastrugi(xu: number, yu: number, c: number, s: number, seed: number): number {
  const along = xu * c + yu * s
  const across = -xu * s + yu * c
  const n = fbm(along * 0.4, across * 1.7, seed + 301, 2)
  const ridge = 1 - Math.abs(n * 2 - 1)
  return ridge * smooth(0.4, 0.75, fbm(xu * 0.3, yu * 0.3, seed + 303, 2))
}

/**
 * 冰面的高度图，米（海面为 0）：老冰的冰面加上雪，雪上有顺风的雪棱与小起伏，光冰有很浅的起伏，新冰缝低下去一截；
 * 冰缘一圈落成圆肩，冰外是海面
 */
export function floeHeights(f: FloeField, x0: number, y0: number, w: number, h: number): Pick<FloeCanvas, 'hcols' | 'hrows' | 'hcell' | 'hx0' | 'hy0' | 'height'> {
  const hcell = f.cell / HEIGHT_SPLIT
  const hx0 = x0 - hcell * 2
  const hy0 = y0 - hcell * 2
  const hcols = Math.ceil(w / hcell) + 4
  const hrows = Math.ceil(h / hcell) + 4
  const height = new Float32Array(hcols * hrows)
  const c = Math.cos(f.windAngle)
  const s = Math.sin(f.windAngle)
  for (let j = 0; j < hrows; j++) {
    const y = hy0 + (j + 0.5) * hcell
    for (let i = 0; i < hcols; i++) {
      const x = hx0 + (i + 0.5) * hcell
      const e = bilinear(f.edge, f.cols, f.rows, f.cell, 0, 0, x, y, -9)
      if (e <= 0) continue
      const xu = x / UNIT
      const yu = y / UNIT
      const snow = bilinear(f.snow, f.cols, f.rows, f.cell, 0, 0, x, y, 0)
      const young = bilinear(f.young, f.cols, f.rows, f.cell, 0, 0, x, y, 0)
      const cover = smooth(0.005, 0.05, snow)
      const along = xu * c + yu * s
      const across = -xu * s + yu * c
      const ripple = Math.sin((along / 0.22 + fbm(across * 0.9, along * 0.25, f.seed + 309, 2) * 6) * Math.PI * 2) * smooth(0.55, 0.8, fbm(xu * 0.4, yu * 0.4, f.seed + 313, 2))
      const drift = snow + cover * (0.02 * sastrugi(xu, yu, c, s, f.seed) + 0.008 * (fbm(xu * 1.7, yu * 1.7, f.seed + 307, 2) - 0.5) + 0.0009 * ripple * smooth(0.02, 0.08, snow))
      const bare = 0.006 * (fbm(xu * 0.6, yu * 0.6, f.seed + 311, 2) - 0.5)
      const old = f.freeboard + drift + bare
      const top = old + (f.youngFreeboard - old) * young
      height[j * hcols + i] = top * smooth(0, LIP_U, e)
    }
  }
  return { hcols, hrows, hcell, hx0, hy0, height }
}

/** 贴图在世界里的范围：轮廓的外接框再往外留半格，像素 */
export function floeFrame(f: FloeField, ppu: number): { x0: number; y0: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of f.outline) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 0.5 * UNIT
  const x0 = Math.floor((minX - pad) / UNIT) * UNIT
  const y0 = Math.floor((minY - pad) / UNIT) * UNIT
  return { x0, y0, w: Math.ceil(((maxX + pad - x0) / UNIT) * ppu), h: Math.ceil(((maxY + pad - y0) / UNIT) * ppu) }
}

/** 往太阳那边看这么远（格）找挡光的雪 */
const SHADOW_STEPS = [0.07, 0.15, 0.26, 0.4, 0.58, 0.8, 1.06, 1.36, 1.7] as const

type Rgb = [number, number, number]

/** 阳光、天光与雪、冰的颜色：线性的反照率与光，最后压一下高光 */
const SUN_COLOR: Rgb = [1.0, 0.92, 0.8]
const SKY_COLOR: Rgb = [0.6, 0.71, 0.88]
const SUN_I = 1.35
const SKY_I = 0.72
const SNOW: Rgb = [0.97, 0.975, 0.99]
const ICE_CLEAR: Rgb = [0.44, 0.6, 0.67]
const ICE_MILK: Rgb = [0.74, 0.81, 0.85]
const YOUNG: Rgb = [0.25, 0.32, 0.36]
const RIME: Rgb = [0.93, 0.96, 0.98]
/** 光从冰面钻进冰里、从陡的断口透出来的青蓝 */
const GLOW: Rgb = [0.42, 0.66, 0.78]
const GLOW_I = 0.3

/** 高光柔和地压到 1 以内 */
function tone(c: number): number {
  if (c <= 0.82) return c < 0 ? 0 : c
  return 0.82 + 0.18 * (1 - Math.exp(-(c - 0.82) / 0.18))
}

/**
 * 冰面：一块积雪的海冰，按高度图在低低的太阳下打光，雪堆与雪棱朝阳的一面暖白、背阴的一面泛蓝，挡住阳光的地方拖出长影。
 * 雪上有细碎的闪光；风吹掉雪的地方露出老冰——乳白与半透明的蓝相间，冻在里面的气泡、一张发白的裂纹网，顺风扫过的一缕缕雪粉；
 * 裂缝冻成的新冰发暗，上面开满霜花；冰缘一圈被浪花打湿，颜色发深，挂着白色的冻沫，陡的断口透出冰里的青蓝。只画 [r0, r1) 这几行，out 按这几行排
 */
export function paintFloe(c: FloeCanvas, out: Uint8ClampedArray, r0: number, r1: number): void {
  const { ppu, seed } = c
  const px2w = UNIT / ppu
  const wc = Math.cos(c.windAngle)
  const ws = Math.sin(c.windAngle)
  const m = c.meterPerU / UNIT
  const d = c.hcell
  const shade: Rgb = [0, 0, 0]
  const H = (x: number, y: number): number => bilinear(c.height, c.hcols, c.hrows, c.hcell, c.hx0, c.hy0, x, y, 0)
  for (let py = r0; py < r1; py++) {
    const wy = c.y0 + (py + 0.5) * px2w
    for (let px = 0; px < c.w; px++) {
      const o = ((py - r0) * c.w + px) * 4
      const wx = c.x0 + (px + 0.5) * px2w
      const e = bilinear(c.edge, c.cols, c.rows, c.cell, 0, 0, wx, wy, -9)
      if (e < -0.05) {
        out[o + 3] = 0
        continue
      }
      const h0 = H(wx, wy)
      const gx = (H(wx + d, wy) - H(wx - d, wy)) / (2 * d * m)
      const gy = (H(wx, wy + d) - H(wx, wy - d)) / (2 * d * m)
      const nl = 1 / Math.sqrt(gx * gx + gy * gy + 1)
      const nx = -gx * nl
      const ny = -gy * nl
      const nz = nl
      const direct = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z)
      let over = 0
      for (const t of SHADOW_STEPS) {
        const step = t * UNIT
        const rise = H(wx + TOWARD.x * step, wy + TOWARD.y * step) - h0 - t * c.meterPerU * SUN_TAN
        if (rise > over) over = rise
      }
      const lit = direct * (1 - smooth(0, 0.014, over))
      const sky = SKY_I * (0.62 + 0.38 * nz)
      const xu = wx / UNIT
      const yu = wy / UNIT
      const snow = bilinear(c.snow, c.cols, c.rows, c.cell, 0, 0, wx, wy, 0)
      const young = bilinear(c.young, c.cols, c.rows, c.cell, 0, 0, wx, wy, 0)
      const cover = smooth(0.006, 0.045, snow + (valueNoise(xu * 7, yu * 7, seed + 401) - 0.5) * 0.012)
      // 老冰：乳白与半透明的蓝灰相间，冻在里面的气泡，稀疏的白裂纹，风吹过留下的一片片薄雪粉
      const milk = smooth(0.3, 0.72, fbm(xu * 0.32, yu * 0.32, seed + 403, 3)) * (1 - 0.55 * smooth(0.6, 0.78, fbm(xu * 0.7, yu * 0.7, seed + 405, 2)))
      let ar = ICE_CLEAR[0] + (ICE_MILK[0] - ICE_CLEAR[0]) * milk
      let ag = ICE_CLEAR[1] + (ICE_MILK[1] - ICE_CLEAR[1]) * milk
      let ab = ICE_CLEAR[2] + (ICE_MILK[2] - ICE_CLEAR[2]) * milk
      const grain = valueNoise(xu * 9, yu * 9, seed + 409) - 0.5
      ar += grain * 0.03
      ag += grain * 0.03
      ab += grain * 0.025
      if (cover < 0.98) {
        const qx = xu + (fbm(xu * 0.5, yu * 0.5, seed + 411, 2) - 0.5) * 1.6
        const qy = yu + (fbm(xu * 0.5 + 9, yu * 0.5, seed + 412, 2) - 0.5) * 1.6
        const crack = smooth(0.016, 0.004, Math.abs(fbm(qx * 0.42, qy * 0.42, seed + 413, 2) - 0.5)) * smooth(0.42, 0.66, valueNoise(xu * 0.35, yu * 0.35, seed + 414)) * 0.6
        const fine = smooth(0.012, 0.003, Math.abs(fbm(qx * 1.3, qy * 1.3, seed + 415, 2) - 0.5)) * smooth(0.55, 0.8, valueNoise(xu * 0.8, yu * 0.8, seed + 417)) * 0.35
        const bub = cellNearest(xu * 5, yu * 5, seed + 419)
        const bubble = bub.h > 0.86 ? smooth(0.11, 0.03, Math.hypot(bub.dx, bub.dy)) * 0.55 : 0
        const along = (xu * wc + yu * ws) * 0.22
        const across = (-xu * ws + yu * wc) * 0.85
        const dust = smooth(0.52, 0.78, fbm(along, across, seed + 421, 3)) * (0.35 + 0.65 * valueNoise(along * 6, across * 2, seed + 423))
        const white = Math.max(crack, fine, bubble, dust * 0.5)
        ar += (0.9 - ar) * white
        ag += (0.93 - ag) * white
        ab += (0.95 - ab) * white
      }
      // 新冰：暗灰发湿，霜花一簇簇开在上面
      if (young > 0.001) {
        const q = cellNearest(xu * 3.4, yu * 3.4, seed + 431)
        const bloom = smooth(0.35, 0.7, fbm(xu * 0.7, yu * 0.7, seed + 435, 2))
        const r = (0.1 + 0.16 * q.h) * (0.6 + 0.6 * bloom)
        const petal = 0.72 + 0.28 * Math.cos(Math.atan2(q.dy, q.dx) * 5 + q.h * 20)
        const flower = q.h > 0.55 - 0.35 * bloom ? smooth(r * petal, r * petal * 0.3, Math.hypot(q.dx, q.dy)) : 0
        const haze = bloom * 0.12
        const sheen = smooth(0.4, 0.8, fbm(xu * 0.8, yu * 0.8, seed + 433, 2)) * 0.05
        const yr = YOUNG[0] + sheen + haze + (RIME[0] - YOUNG[0]) * flower * 0.7
        const yg = YOUNG[1] + sheen + haze + (RIME[1] - YOUNG[1]) * flower * 0.7
        const yb = YOUNG[2] + sheen + haze + (RIME[2] - YOUNG[2]) * flower * 0.7
        ar += (yr - ar) * young
        ag += (yg - ag) * young
        ab += (yb - ab) * young
      }
      // 雪：细碎的颗粒与闪光
      if (cover > 0.001) {
        const sg = (valueNoise(xu * 14, yu * 14, seed + 441) - 0.5) * 0.03
        ar += (SNOW[0] + sg - ar) * cover
        ag += (SNOW[1] + sg - ag) * cover
        ab += (SNOW[2] + sg - ab) * cover
      }
      // 冰缘一圈被浪花打湿、挂着冻沫
      const wet = smooth(0.6, 0.05, e) * (0.55 + 0.45 * valueNoise(xu * 2.5, yu * 2.5, seed + 451))
      if (wet > 0) {
        const k = 1 - 0.12 * wet
        ar *= k
        ag *= k * 1.01
        ab *= k * 1.03
        const rime = smooth(0.55, 0.85, valueNoise(xu * 11, yu * 11, seed + 453)) * smooth(0.45, 0.1, e)
        ar += (RIME[0] - ar) * rime * 0.8
        ag += (RIME[1] - ag) * rime * 0.8
        ab += (RIME[2] - ab) * rime * 0.8
      }
      const glossy = (1 - cover) * (0.04 + 0.06 * young)
      const glow = GLOW_I * (1 - nz)
      shade[0] = ar * (SUN_COLOR[0] * SUN_I * lit + SKY_COLOR[0] * sky) + SKY_COLOR[0] * glossy + GLOW[0] * glow
      shade[1] = ag * (SUN_COLOR[1] * SUN_I * lit + SKY_COLOR[1] * sky) + SKY_COLOR[1] * glossy + GLOW[1] * glow
      shade[2] = ab * (SUN_COLOR[2] * SUN_I * lit + SKY_COLOR[2] * sky) + SKY_COLOR[2] * glossy + GLOW[2] * glow
      if (cover > 0.5 && lit > 0.2) {
        const q = cellNearest(xu * 22, yu * 22, seed + 461)
        if (q.h > 0.965) {
          const spark = smooth(0.09, 0.0, Math.hypot(q.dx, q.dy)) * (q.h - 0.965) * 28 * lit
          shade[0] += spark
          shade[1] += spark
          shade[2] += spark * 0.96
        }
      }
      out[o] = tone(shade[0]) * 255
      out[o + 1] = tone(shade[1]) * 255
      out[o + 2] = tone(shade[2]) * 255
      out[o + 3] = smooth(-0.05, 0.04, e) * 255
    }
  }
}

/** 画冰面的线程收发的东西：先 setup 一次，再一段一段要 paint */
export type FloeJob = { readonly kind: 'setup'; readonly canvas: FloeCanvas } | { readonly kind: 'paint'; readonly index: number; readonly r0: number; readonly r1: number }

/** 画好的一段：r0 到 r1 行，像素逐行排 */
export interface FloePiece {
  readonly index: number
  readonly r0: number
  readonly r1: number
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}
