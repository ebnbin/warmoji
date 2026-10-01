import { UNIT } from '../../util/units'
import { SUN } from '../../data/light'
import { cellNearest, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import type { FloeField } from '../worlds/floe'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 南极夏天的太阳整天贴着地平线绕：方位与角色的光一致，只是低得多，雪堆拖出长长的蓝影 */
const SUN_ELEV = 24 * (Math.PI / 180)
const SUN_H = Math.hypot(SUN.x, SUN.y)
export const LIGHT = {
  x: (SUN.x / SUN_H) * Math.cos(SUN_ELEV),
  y: (SUN.y / SUN_H) * Math.cos(SUN_ELEV),
  z: Math.sin(SUN_ELEV),
} as const
/** 地面上一点朝太阳那一侧的水平单位方向，与太阳的仰角正切 */
const TOWARD = { x: SUN.x / SUN_H, y: SUN.y / SUN_H }
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

/** 双线性取值；格心在 (i + 0.5)·cell + (ox, oy)，越界取 outside */
function bilinear(a: Float32Array, cols: number, rows: number, cell: number, ox: number, oy: number, x: number, y: number, outside: number): number {
  const u = (x - ox) / cell - 0.5
  const v = (y - oy) / cell - 0.5
  if (u < 0 || v < 0 || u >= cols - 1 || v >= rows - 1) return outside
  const ix = u | 0
  const iy = v | 0
  const fx = u - ix
  const fy = v - iy
  const i = iy * cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const s = a[i + cols]!
  const t = a[i + cols + 1]!
  return p + (q - p) * fx + (s - p) * fy + (p - q - s + t) * fx * fy
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

/** 高光柔和地压到 1 以内 */
function tone(c: number): number {
  if (c <= 0.82) return c < 0 ? 0 : c
  return 0.82 + 0.18 * (1 - Math.exp(-(c - 0.82) / 0.18))
}

/**
 * 冰面：一块积雪的海冰，按高度图在低低的太阳下打光，雪堆与雪棱朝阳的一面暖白、背阴的一面泛蓝，挡住阳光的地方拖出长影。
 * 雪上有细碎的闪光；风吹掉雪的地方露出老冰——乳白与半透明的蓝相间，冻在里面的气泡、一张发白的裂纹网，顺风扫过的一缕缕雪粉；
 * 裂缝冻成的新冰发暗，上面开满霜花；冰缘一圈被浪花打湿，颜色发深，挂着白色的冻沫。只画 [r0, r1) 这几行，out 按这几行排
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
      shade[0] = ar * (SUN_COLOR[0] * SUN_I * lit + SKY_COLOR[0] * sky) + SKY_COLOR[0] * glossy
      shade[1] = ag * (SUN_COLOR[1] * SUN_I * lit + SKY_COLOR[1] * sky) + SKY_COLOR[1] * glossy
      shade[2] = ab * (SUN_COLOR[2] * SUN_I * lit + SKY_COLOR[2] * sky) + SKY_COLOR[2] * glossy
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

// ————————————————————————————— 海面 —————————————————————————————

/** 冰缘距离图存的范围：水里离冰缘 −4 到 12 格（冰上为负） */
const SHORE_MIN_U = -4
const SHORE_SPAN_U = 16

/** 给海面着色器的冰缘距离图：每个距离场的格子一个像素，水里离冰缘多远（格）拆成 16 位放进 R、G，线性插值后仍是线性的 */
export function drawShore(ctx: CanvasRenderingContext2D, f: FloeField): void {
  const img = ctx.createImageData(f.cols, f.rows)
  for (let i = 0; i < f.cols * f.rows; i++) {
    const v = Math.round(clamp01((-f.edge[i]! - SHORE_MIN_U) / SHORE_SPAN_U) * 65535)
    img.data[i * 4] = v >> 8
    img.data[i * 4 + 1] = v & 255
    img.data[i * 4 + 2] = 0
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export const WAVE_TILE = 256

/**
 * 一块能无缝平铺的风浪：二十多列整数波数的波叠在一起，波向集中在风去的方向两侧，长波高、短波矮，波峰收尖；
 * R、G 存两个方向的坡度，B 存浪高，A 是一层不相干的平铺噪声（给海烟、油脂冰、风团用）。按画布的 y 往下算
 */
export function drawFloeWaves(ctx: CanvasRenderingContext2D, windAngle: number, seed: number): void {
  const n = WAVE_TILE
  const r = new Rng(seed)
  const hgt = new Float32Array(n * n)
  const gx = new Float32Array(n * n)
  const gy = new Float32Array(n * n)
  for (let w = 0; w < 22; w++) {
    const ang = windAngle + (r.next() * 2 - 1) * (0.5 + 0.7 * r.next())
    const k = 2 + Math.floor(r.next() ** 1.4 * 10)
    const kx = Math.round(Math.cos(ang) * k)
    const ky = Math.round(Math.sin(ang) * k)
    if (kx === 0 && ky === 0) continue
    const kk = Math.hypot(kx, ky)
    const amp = 1 / kk ** 1.35
    const phase = r.next() * Math.PI * 2
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ph = ((kx * x + ky * y) / n) * Math.PI * 2 + phase
        const s = Math.sin(ph)
        const crest = (s + 0.35 * Math.sin(2 * ph - 1.2)) / 1.35
        const d = (Math.cos(ph) + 0.7 * Math.cos(2 * ph - 1.2)) / 1.35
        const i = y * n + x
        hgt[i] = hgt[i]! + amp * crest
        gx[i] = gx[i]! + amp * d * kx
        gy[i] = gy[i]! + amp * d * ky
      }
    }
  }
  const lattice = 16
  const cellv = Array.from({ length: lattice * lattice }, () => r.next())
  const tileNoise = (x: number, y: number): number => {
    const fx = (x / n) * lattice
    const fy = (y / n) * lattice
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (a: number, b: number): number => cellv[((b % lattice) + lattice) % lattice * lattice + (((a % lattice) + lattice) % lattice)]!
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
    return top + (bot - top) * sy
  }
  let lo = Infinity
  let hi = -Infinity
  let gmax = 0
  for (let i = 0; i < n * n; i++) {
    lo = Math.min(lo, hgt[i]!)
    hi = Math.max(hi, hgt[i]!)
    gmax = Math.max(gmax, Math.abs(gx[i]!), Math.abs(gy[i]!))
  }
  const img = ctx.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      const noise = tileNoise(x, y) * 0.6 + tileNoise(x * 2 + 37, y * 2 + 11) * 0.3 + tileNoise(x * 4 + 5, y * 4 + 71) * 0.1
      img.data[i * 4] = Math.round((0.5 + (0.5 * gx[i]!) / gmax) * 255)
      img.data[i * 4 + 1] = Math.round((0.5 + (0.5 * gy[i]!) / gmax) * 255)
      img.data[i * 4 + 2] = Math.round(((hgt[i]! - lo) / (hi - lo)) * 255)
      img.data[i * 4 + 3] = Math.round(noise * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * 南大洋的海面，四边形盖住整片海，坐标按地图像素、y 朝下；纹理坐标 y 朝上，画布纹理上传时也上下翻了，采样时取反。
 * 深青黑的冷水上，一列长涌浪缓缓推过，风浪随风速变强（阵风来时一团团风斑顺风扫过），浮冰背风的一侧水面平静；
 * 浪面映出低垂太阳那一侧发暖的天光，迎着太阳闪着碎金。冰缘外一圈是水下的冰脚，泛着青绿，水线上一道白沫随涌浪涨落；
 * 浮冰挡住低低的太阳，在背阳的一侧水面投下影子。碎冰随海流漂，顺风拉成一条条的油脂冰压平了风浪，水面上飘着海烟
 */
export const FLOE_SEA_FRAG = `
#pragma phaserTemplate(shaderName)
#pragma phaserTemplate(extensions)
#pragma phaserTemplate(features)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#pragma phaserTemplate(fragmentDefine)
varying vec2 outTexCoord;
#pragma phaserTemplate(outVariables)
#pragma phaserTemplate(fragmentHeader)
uniform sampler2D uWave;
uniform sampler2D uShore;
uniform float uTime;
uniform vec4 uRect;
uniform vec3 uGrid;
uniform vec3 uSun;
uniform vec4 uWind;
uniform vec4 uGust;
uniform vec4 uSwell;
uniform vec4 uFlow;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p), hash(p + 17.31));
}

float shore(vec2 world) {
  vec2 uv = world / uGrid.xy;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 12.0;
  vec4 e = texture2D(uShore, vec2(uv.x, 1.0 - uv.y));
  return (e.r * 65280.0 + e.g * 255.0) / 65535.0 * ${SHORE_SPAN_U.toFixed(1)} + ${SHORE_MIN_U.toFixed(1)};
}

vec4 wave(vec2 q) {
  return texture2D(uWave, vec2(q.x, -q.y));
}

float gustAt(float t) {
  float a = t - uGust.x;
  if (a <= 0.0) return 0.0;
  if (a < uGust.y) return smoothstep(0.0, uGust.y, a);
  if (a < uGust.y + uGust.z) return 1.0;
  return 1.0 - smoothstep(uGust.y + uGust.z, uGust.y + uGust.z + uGust.w, a);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  float d = shore(world);
  if (d < -0.2) {
    gl_FragColor = vec4(0.04, 0.07, 0.08, 1.0);
    return;
  }
  float unit = uGrid.z;
  vec2 p = world / unit;
  vec2 wdir = uWind.xy;
  vec2 across = vec2(-wdir.y, wdir.x);
  float level = gustAt(uTime);
  float speed = mix(uWind.z, uWind.w, level);
  vec2 sunH = normalize(uSun.xy);

  // 背风处水面平静：往上风找一找是不是被浮冰挡着
  float lee = max(max(smoothstep(0.3, -0.3, shore(world - wdir * unit * 1.3)), 0.8 * smoothstep(0.3, -0.3, shore(world - wdir * unit * 3.0))), 0.55 * smoothstep(0.3, -0.3, shore(world - wdir * unit * 5.5)));
  vec2 drift = p - uFlow.xy * uTime;
  float grease = smoothstep(0.6, 0.82, wave(vec2(dot(drift, wdir) * 0.006, dot(drift, across) * 0.05) + 0.31).a);
  float paws = smoothstep(0.5, 0.78, wave((p - wdir * uTime * speed * 0.9) * 0.025 + 0.6).a) * (0.25 + 0.75 * level);
  float rough = (0.2 + 0.6 * clamp((speed - 3.0) / 12.0, 0.0, 1.0) + 0.3 * paws) * (1.0 - 0.85 * lee) * (1.0 - 0.7 * grease);

  // 风浪两层顺风漂，一列长涌浪按深水的色散推过来
  vec2 q1 = p - wdir * uTime * 0.9;
  vec2 q2 = mat2(0.8, 0.6, -0.6, 0.8) * (p - wdir * uTime * 0.55);
  vec4 w1 = wave(q1 / 9.0);
  vec4 w2 = wave(q2 / 3.7 + vec2(0.27, 0.61));
  vec2 slope = ((w1.rg - 0.5) * 0.7 + (w2.rg - 0.5) * 0.4) * rough;
  vec2 sw2 = vec2(uSwell.y, -uSwell.x) * 0.6 + uSwell.xy * 0.8;
  float ph = dot(p, uSwell.xy) * uSwell.z - uSwell.w * uTime;
  float ph2 = dot(p, sw2) * uSwell.z * 1.7 - uSwell.w * 1.3 * uTime + 1.7;
  slope += uSwell.xy * 0.08 * cos(ph) + sw2 * 0.04 * cos(ph2);
  float swell = sin(ph) * 0.7 + sin(ph2) * 0.3;

  // 浮冰挡住低低的太阳，在背阳的一侧水面投下影子
  float shadeLen = uFlow.w;
  float shadow = max(max(smoothstep(0.15, -0.25, shore(world + sunH * unit * shadeLen * 0.35)), smoothstep(0.15, -0.25, shore(world + sunH * unit * shadeLen * 0.7))), smoothstep(0.15, -0.25, shore(world + sunH * unit * shadeLen)));

  // 低低的太阳把浪的起伏照得分明，浪面映着天：头顶的天偏蓝，太阳那一侧的天边发暖
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 nl = normalize(vec3(-slope * 1.8, 1.0));
  float relief = clamp((dot(nl, uSun) - uSun.z) * 4.5, -1.0, 1.0) * (1.0 - 0.6 * shadow);
  vec3 col = mix(vec3(0.034, 0.112, 0.142), vec3(0.11, 0.28, 0.32), clamp(0.4 + relief * 0.55 + (w1.b - 0.5) * 0.35 * rough + swell * 0.1, 0.0, 1.0));
  vec3 r = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
  float toSun = max(dot(normalize(r.xy + 0.0001), sunH), 0.0);
  float low = clamp(1.0 - r.z, 0.0, 1.0);
  vec3 skyC = mix(vec3(0.3, 0.43, 0.55), vec3(0.76, 0.81, 0.86), low) + vec3(0.7, 0.45, 0.25) * pow(toSun, 6.0) * low * 1.3;
  float fres = clamp(0.1 + 3.5 * (1.0 - n.z), 0.0, 0.6);
  col = mix(col, skyC, fres * (1.0 - 0.4 * grease) * (1.0 - 0.5 * shadow));
  col = mix(col, vec3(0.11, 0.17, 0.19), grease * 0.4);
  float glint = pow(max(dot(r, uSun), 0.0), 220.0) * 3.0 * (1.0 - grease);
  col += vec3(1.0, 0.86, 0.64) * glint * (1.0 - shadow);
  col *= 1.0 - 0.14 * paws * (1.0 - lee);
  // 风大了浪头就碎成白浪
  float cap = smoothstep(0.7, 0.9, w1.b + (w2.b - 0.5) * 0.35) * clamp((speed - 8.0) / 6.0, 0.0, 1.0) * (1.0 - lee) * (1.0 - grease) * (0.55 + 0.45 * paws);
  col = mix(col, vec3(0.86, 0.91, 0.93) * (1.0 - 0.3 * shadow), cap * 0.75);

  // 水下的冰脚：冰缘外一圈泛着青绿，越往外越深越暗，随浪面晃
  float dd = d + (slope.x + slope.y) * 0.25;
  float ram = 0.55 + 0.45 * wave(p / 23.0 + 0.37).b;
  float under = exp(-max(dd, 0.0) / (0.4 + 0.55 * ram)) * smoothstep(-0.05, 0.04, d);
  col = mix(col, vec3(0.12, 0.47, 0.5) * (0.8 + 0.2 * relief), under * 0.8);
  col *= 1.0 - 0.4 * shadow;

  // 碎冰：大大小小有棱有角的冰块随海流漂，冰缘边上挤得最密、越往外越稀；冰块九成在水下，四周透出一圈青绿
  vec2 bp = drift / 0.7;
  vec2 ip = floor(bp);
  vec2 fp = fract(bp);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 c1 = vec2(0.0);
  float h1 = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = g + hash2(ip + g) * 0.85 + 0.075 - fp;
      float e2 = dot(o, o);
      if (e2 < d1) {
        d2 = d1;
        d1 = e2;
        c1 = o;
        h1 = hash(ip + g + 7.3);
      } else if (e2 < d2) {
        d2 = e2;
      }
    }
  }
  float clump = smoothstep(0.3, 0.7, wave(drift / 31.0 + 0.13).a);
  float density = (0.62 * exp(-max(d, 0.0) / 1.4) + 0.06 * clump) * smoothstep(0.1, 0.45, d);
  if (h1 < density) {
    float inside = sqrt(d2) - sqrt(d1);
    float gap = 0.1 + 0.34 * fract(h1 * 17.3);
    float plate = smoothstep(gap, gap + 0.025, inside);
    float halo = smoothstep(gap - 0.16, gap, inside) * (1.0 - plate);
    float rim = smoothstep(gap + 0.14, gap + 0.02, inside);
    float face = dot(normalize(-c1 + 0.0001), sunH);
    float lit = 0.86 + 0.22 * rim * face + 0.05 * (fract(h1 * 41.0) - 0.5);
    vec3 ice = mix(vec3(0.8, 0.9, 0.94), vec3(0.93, 0.95, 0.96), fract(h1 * 29.0)) * lit * (1.0 - 0.32 * shadow);
    col = mix(col, vec3(0.12, 0.44, 0.48), halo * 0.55);
    col = mix(col, ice, plate);
  }

  // 水线：一道白沫随涌浪涨落，冰缘边漂开一缕缕泡沫
  float lap = 0.09 + 0.08 * (0.5 + 0.5 * swell);
  float froth = wave(drift / 4.0 + 0.71).a;
  float foam = (1.0 - smoothstep(lap * 0.5, lap + 0.06, d)) * (0.7 + 0.3 * froth) * smoothstep(-0.12, -0.02, d);
  foam = max(foam, smoothstep(0.68, 0.88, froth) * exp(-max(d, 0.0) / 0.8) * 0.45 * smoothstep(0.1, 0.4, d));
  col = mix(col, vec3(0.9, 0.95, 0.96) * (1.0 - 0.3 * shadow), clamp(foam, 0.0, 1.0));

  // 海烟：冷风吹过稍暖的海水，贴着水面飘起一缕缕白雾
  float mist = smoothstep(0.55, 0.85, wave((p - wdir * uTime * speed * 0.6) / 46.0 + 0.5).a) * smoothstep(0.5, 3.0, d);
  col = mix(col, vec3(0.74, 0.82, 0.87), mist * 0.14);
  gl_FragColor = vec4(col, 1.0);
}
`
