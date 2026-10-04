import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellNearest, fbm, valueNoise } from '../../util/noise'
import type { RiverConfig } from '../../types/maps'
import type { Terrain, Tree } from './layout'

/** 树冠贴图每格多少像素：树冠边是软的，用不着地面那么细 */
export const CANOPY_PPU = 16
/** 树按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2

const LX = SUN.x
const LY = SUN.y
const LZ = SUN.z
const LXY = Math.hypot(LX, LY)
/** 太阳每升高一米，影子在地上往外拖多少米 */
const SHADOW_PER_M = LXY / LZ
/** 往太阳方向看这么远（格）找挡光的地形：崖高三米多，影子能拖出七八格 */
const SHADOW_STEPS = [0.25, 0.6, 1.1, 1.8, 2.8, 4.2, 6, 8] as const
/** 树影最多拖出这么远（格） */
const TREE_SHADOW_U = 5
/** 树下的落花从树冠边往外铺这么远（格） */
const LITTER_U = 2.2

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const fract = (v: number): number => v - Math.floor(v)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 画地面、树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: RiverConfig
  readonly terrain: Terrain
  readonly trees: readonly Tree[]
  readonly seed: number
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type PaintLayer = 'ground' | 'canopy'

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly layer: PaintLayer; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly layer: PaintLayer
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

/** 装得下一块像素的缓冲：按 rect 逐行排 */
export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面与树冠贴图的大小，像素：铺满整片地形 */
export function textureSize(t: Terrain, layer: PaintLayer): { w: number; h: number } {
  const ppu = layer === 'ground' ? GROUND_PPU : CANOPY_PPU
  return { w: Math.round(t.cols * t.cell * ppu), h: Math.round(t.rows * t.cell * ppu) }
}

/** 画之前先算一次的东西：树影、树冠与树下落花的分桶，每个地形格被地形挡住多少太阳光 */
export interface Prepared {
  readonly shadows: TreeIndex
  readonly crowns: TreeIndex
  readonly litter: TreeIndex
  readonly shade: Float32Array
}

export function prepare(sc: PaintScene): Prepared {
  return { shadows: indexTrees(sc, 'shadow'), crowns: indexTrees(sc, 'crown'), litter: indexTrees(sc, 'litter'), shade: terrainShade(sc) }
}

/** 每个地形格往太阳方向找挡光的地形：挡得越高越暗，按格心算一次，画的时候插值 */
function terrainShade(sc: PaintScene): Float32Array {
  const t = sc.terrain
  const out = new Float32Array(t.cols * t.rows)
  const sx = LX / LXY
  const sy = LY / LXY
  const rise = (LZ / LXY) * sc.cfg.meterPerU
  for (let cy = 0; cy < t.rows; cy++) {
    for (let cx = 0; cx < t.cols; cx++) {
      const x = t.x0 + (cx + 0.5) * t.cell
      const y = t.y0 + (cy + 0.5) * t.cell
      const z = t.z[cy * t.cols + cx]!
      let over = 0
      for (const st of SHADOW_STEPS) over = Math.max(over, field(t, t.z, x + sx * st, y + sy * st) - z - st * rise)
      out[cy * t.cols + cx] = smooth(0.02, 0.3, over)
    }
  }
  return out
}

/** 树按位置分桶：键是桶的行列 */
interface TreeIndex {
  readonly cols: number
  readonly x0: number
  readonly y0: number
  readonly buckets: Map<number, number[]>
}

/** 把树按 (cx, cy) 分桶：树冠、树影或树下落花能伸到的每一桶都记上它 */
function indexTrees(sc: PaintScene, kind: 'crown' | 'shadow' | 'litter'): TreeIndex {
  const t = sc.terrain
  const cols = Math.ceil((t.cols * t.cell) / BUCKET_U) + 1
  const buckets = new Map<number, number[]>()
  sc.trees.forEach((tr, k) => {
    const c = kind === 'shadow' ? shadowOf(sc.cfg, tr) : { x: tr.x, y: tr.y, r: tr.r }
    const r = c.r + (kind === 'shadow' ? 1.2 : kind === 'litter' ? LITTER_U : 0.1)
    for (let by = Math.floor((c.y - r - t.y0) / BUCKET_U); by <= Math.floor((c.y + r - t.y0) / BUCKET_U); by++) {
      for (let bx = Math.floor((c.x - r - t.x0) / BUCKET_U); bx <= Math.floor((c.x + r - t.x0) / BUCKET_U); bx++) {
        const key = by * cols + bx
        let list = buckets.get(key)
        if (!list) buckets.set(key, (list = []))
        list.push(k)
      }
    }
  })
  return { cols, x0: t.x0, y0: t.y0, buckets }
}

function near(ix: TreeIndex, x: number, y: number): readonly number[] {
  return ix.buckets.get(Math.floor((y - ix.y0) / BUCKET_U) * ix.cols + Math.floor((x - ix.x0) / BUCKET_U)) ?? NONE
}
const NONE: readonly number[] = []

/** 这一点整个被树冠盖住了：离哪棵树的树干比树冠参差的边还近 */
function hidden(sc: PaintScene, crowns: TreeIndex, x: number, y: number): boolean {
  for (const k of near(crowns, x, y)) {
    const tr = sc.trees[k]!
    const r = tr.r * 0.7
    if ((x - tr.x) ** 2 + (y - tr.y) ** 2 < r * r) return true
  }
  return false
}

/** 一棵树投在地上的影子：树冠中心离地约树高的六成半，背着太阳拖出去，最多 TREE_SHADOW_U 格 */
function shadowOf(cfg: RiverConfig, tr: Tree): { x: number; y: number; r: number } {
  const off = Math.min(TREE_SHADOW_U, (tr.h * 0.65 * SHADOW_PER_M) / cfg.meterPerU)
  return { x: tr.x - (LX / LXY) * off, y: tr.y - (LY / LXY) * off, r: tr.r * 0.92 }
}

/** 格子 i 与右、下、右下三格之间按 (ax, ay) 双线性插值 */
function lerp2(a: Float32Array, i: number, cols: number, ax: number, ay: number): number {
  const p = a[i]!
  const q = a[i + 1]!
  const r = a[i + cols]!
  return p + (q - p) * ax + (r - p) * ay + (p - q - r + a[i + cols + 1]!) * ax * ay
}

/** 场里 (x, y) 格处按格心双线性取值 */
function field(t: Terrain, a: Float32Array, x: number, y: number): number {
  const u = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / t.cell - 0.5))
  const v = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / t.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * t.cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const r = a[i + t.cols]!
  const s = a[i + t.cols + 1]!
  return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy
}

/** 地上落花的几种颜色：近白、粉白、淡粉、粉 */
const PETALS = [
  [255, 243, 247],
  [252, 226, 236],
  [248, 208, 223],
  [242, 186, 208],
] as const

/** 一层落花：按格点撒、各朝各的方向的小椭圆，格点的哈希小于 cover 才有一片；返回这一点被花瓣盖住多少，花色记在 hue */
function petal(x: number, y: number, scale: number, seed: number, cover: number, hue: { k: number }): number {
  const q = cellNearest(x * scale, y * scale, seed)
  if (q.h >= cover) return 0
  const ang = q.h * 113.7
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const u = (q.dx * c + q.dy * s) / 0.55
  const v = (q.dy * c - q.dx * s) / 0.34
  hue.k = Math.floor(fract(q.h * 37.1) * PETALS.length)
  return smooth(1, 0.6, u * u + v * v)
}
const HUE = { k: 0 }
/** 落花分两层撒：格点的疏密与种子 */
const PETAL_LAYERS = [
  [6, 81],
  [9.5, 83],
] as const

/**
 * 地面：空地里是浅嫩的草地，近水更润，越靠近樱花树落花铺得越密，草地上另有几片落花铺成的花毯；近水是浅色的细沙岸，凸岸的边滩沙更白，
 * 水下的河床是细沙、缓处长着青苔；空地外的樱花林下铺满落花，间或露出青苔；进水口背后是台地与浅色的崖壁，出水口外是深谷，越往下粉紫的雾越重。
 * 按高度场打光，往太阳方向找挡光的地形投影，树冠背着太阳投下软影，影子偏紫；离空地越远越融进粉白的雾里。
 * 只画 rect 那一块，out 里按这块的范围逐行排
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ix = prep.shadows
  const crowns = prep.crowns
  const litter = prep.litter
  const t = sc.terrain
  const cfg = sc.cfg
  const mpu = cfg.meterPerU
  const seed = sc.seed
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const e = t.cell
  const shadows = sc.trees.map((tr) => shadowOf(cfg, tr))
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = t.x0 + (px + 0.5) / ppu
      const y = t.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      if (hidden(sc, crowns, x, y)) {
        out[o] = 226
        out[o + 1] = 186
        out[o + 2] = 200
        out[o + 3] = 255
        continue
      }
      const fu = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / t.cell - 0.5))
      const fv = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / t.cell - 0.5))
      const ci = Math.floor(fv) * t.cols + Math.floor(fu)
      const ax = fu - Math.floor(fu)
      const ay = fv - Math.floor(fv)
      const z = lerp2(t.z, ci, t.cols, ax, ay)
      const zx = (field(t, t.z, x + e, y) - field(t, t.z, x - e, y)) / (2 * e * mpu)
      const zy = (field(t, t.z, x, y + e) - field(t, t.z, x, y - e)) / (2 * e * mpu)
      const level = lerp2(t.level, ci, t.cols, ax, ay)
      const edge = lerp2(t.edge, ci, t.cols, ax, ay)
      const bar = lerp2(t.bar, ci, t.cols, ax, ay)
      const clear = lerp2(t.clear, ci, t.cols, ax, ay)
      const gorge = lerp2(t.gorge, ci, t.cols, ax, ay)
      const under = level - z
      const patch = fbm(x / 7, y / 7, seed + 3, 2)
      const mid = fbm(x / 2.2, y / 2.2, seed + 5, 2)
      const grain = valueNoise(x * 7, y * 7, seed + 9) * 0.5 + valueNoise(x * 17, y * 17, seed + 11) * 0.5
      const wob = (mid - 0.5) * 0.5
      const outside = smooth(0.15 + wob * 0.4, -0.35, clear)
      const bed = smooth(-0.01, 0.04, under) * smooth(-0.6, 0.2, -edge + 0.3)
      const slope = Math.sqrt(zx * zx + zy * zy)
      const cliff = smooth(0.9, 2.5, slope)
      let fall = 0
      for (const k of near(litter, x, y)) {
        const tr = sc.trees[k]!
        fall = Math.max(fall, smooth(LITTER_U, -0.2, Math.sqrt((x - tr.x) ** 2 + (y - tr.y) ** 2) - tr.r))
      }
      const drift = smooth(0.52, 0.78, fbm(x / 3.4 + 5.3, y / 3.4, seed + 25, 2)) * 0.45
      const carpet = clamp01(Math.max(fall * (0.75 + 0.25 * mid), drift))
      let r = 0
      let g = 0
      let b = 0

      // 草地：浅嫩的绿，大片的深浅按低频噪声，近水更润、高处更淡；草叶顺着风斜着长；落花多的地方底色透粉
      if (outside < 0.999 && bed < 0.999) {
        const lush = smooth(3.5, 0.6, edge)
        const dry = clamp01(smooth(0.4, 0.72, patch) * 0.85 - lush * 0.45 + smooth(0.5, 2, z - level) * 0.2)
        const green = clamp01(0.5 + (mid - 0.5) * 1.2 + lush * 0.3)
        r = 188 + (160 - 188) * green + (218 - 188) * dry
        g = 224 + (212 - 224) * green + (226 - 224) * dry
        b = 160 + (140 - 160) * green + (176 - 160) * dry
        const blade = valueNoise(x * 6 + y * 2, y * 22 - x * 2.5, seed + 13)
        const tuft = valueNoise(x * 3.3 + 7.1, y * 3.3, seed + 15)
        const k = (0.94 + 0.08 * blade) * (0.96 + 0.07 * grain) * (0.96 + 0.06 * tuft)
        const pink = carpet * 0.55
        r = (r + (247 - r) * pink) * k
        g = (g + (219 - g) * pink) * k
        b = (b + (229 - b) * pink) * k
      }

      // 河岸：浅色的细沙，离水边越近越湿越深；凸岸的边滩沙更白
      const shore = smooth(cfg.flow.bankU + 0.6 + wob, -0.15, edge)
      if (shore > 0) {
        const wet = smooth(0.7 + wob * 0.6, -0.05, edge)
        const sandy = clamp01(smooth(0.25, 0.7, bar + (patch - 0.5) * 0.6)) * (1 - 0.3 * wet)
        const tone = 0.95 + 0.08 * grain
        r += ((243 + (216 - 243) * wet + (250 - 243) * sandy) * tone - r) * shore
        g += ((229 + (196 - 229) * wet + (241 - 229) * sandy) * tone - g) * shore
        b += ((219 + (190 - 219) * wet + (234 - 219) * sandy) * tone - b) * shore
      }

      // 河床：细沙，缓处、深处蒙着一层青苔
      if (bed > 0) {
        const moss = clamp01(smooth(0.2, 0.7, under) * 0.6 + smooth(0.55, 0.75, patch) * 0.4)
        const sand = 0.92 + 0.12 * grain
        r += (232 * sand + (178 - 232 * sand) * moss - r) * bed
        g += (217 * sand + (200 - 217 * sand) * moss - g) * bed
        b += (205 * sand + (170 - 205 * sand) * moss - b) * bed
      }

      // 空地外：樱花林下铺满落花，间或露出青苔；崖面是浅色的岩，竖着水痕
      if (outside > 0) {
        const moss = smooth(0.58, 0.72, fbm(x / 2.6, y / 2.6, seed + 37, 2)) * 0.55
        let fr = (240 + (198 - 240) * moss) * (0.95 + 0.08 * grain)
        let fg = (210 + (212 - 210) * moss) * (0.95 + 0.08 * grain)
        let fb = (220 + (180 - 220) * moss) * (0.95 + 0.08 * grain)
        if (cliff > 0) {
          const across = (x * -zy + y * zx) / Math.max(slope, 1e-6)
          const down = (x * zx + y * zy) / Math.max(slope, 1e-6)
          const streak = valueNoise(across * 3.5, down * 0.6, seed + 39) * 0.6 + valueNoise(across * 9, down * 1.2, seed + 41) * 0.4
          const ledge = smooth(0.4, 0.6, valueNoise(across * 0.8, down * 2.4, seed + 43))
          const kk = (0.82 + 0.26 * streak) * (0.9 + 0.12 * ledge)
          fr += (228 * kk - fr) * cliff
          fg += (206 * kk - fg) * cliff
          fb += (208 * kk - fb) * cliff
        }
        r += (fr - r) * outside
        g += (fg - g) * outside
        b += (fb - b) * outside
      }

      // 落花：一片片小花瓣，树下与花毯里密、草地上稀；水里、崖面上没有
      const strew = (1 - bed) * (1 - cliff)
      if (strew > 0) {
        const cover = Math.max(carpet * 0.75 + 0.03, outside * 0.9)
        for (const [scale, sd] of PETAL_LAYERS) {
          const a = petal(x, y, scale, seed + sd, cover, HUE) * strew
          if (a <= 0) continue
          const c = PETALS[HUE.k]!
          const lit = 0.94 + 0.1 * grain
          r += (c[0] * lit - r) * a
          g += (c[1] * lit - g) * a
          b += (c[2] * lit - b) * a
        }
      }

      // 深谷：越往下粉紫的雾越重
      const below = Math.max(0, level - z)
      const inGorge = smooth(-0.8, 0.4, gorge)
      const haze = smooth(0.8, 6, below) * inGorge
      if (haze > 0) {
        const mist = 0.92 + 0.12 * fbm(x / 1.5, y / 1.5, seed + 57, 2)
        r += (226 * mist - r) * haze * 0.85
        g += (210 * mist - g) * haze * 0.85
        b += (230 * mist - b) * haze * 0.85
      }

      // 光：朝太阳的坡亮、背阴的坡暗；往太阳方向找挡光的地形；树影偏紫；深谷里暗一些；离空地越远越融进粉白的雾
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) / Math.sqrt(zx * zx + zy * zy + 1))
      let shade = lerp2(prep.shade, ci, t.cols, ax, ay) * 0.55
      for (const k2 of near(ix, x, y)) {
        const c = shadows[k2]!
        const tr = sc.trees[k2]!
        const soft = 0.45 + tr.h * 0.14
        const dd = Math.sqrt((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y))
        shade = Math.max(shade, smooth(c.r + soft, c.r - soft, dd) * 0.36)
      }
      const lit = (0.74 + 0.36 * lambert) * (1 - 0.25 * smooth(1, 7, below) * inGorge)
      const far = 0.6 * smooth(2, 9, -clear)
      out[o] = r * lit * (1 - shade * 0.32) + (250 - r * lit * (1 - shade * 0.32)) * far
      out[o + 1] = g * lit * (1 - shade * 0.46) + (232 - g * lit * (1 - shade * 0.46)) * far
      out[o + 2] = b * lit * (1 - shade * 0.2) + (240 - b * lit * (1 - shade * 0.2)) * far
      out[o + 3] = 255
    }
  }
}

/** 一棵树的树冠由几团叶簇叠成：中间一团最高，外圈几团低一些；按树的序号定，每次画都一样 */
function clumps(tr: Tree, k: number): { x: number; y: number; r: number; top: number }[] {
  const out = [{ x: tr.x, y: tr.y, r: tr.r * 0.62, top: tr.h }]
  const n = 7 + Math.floor(tr.r * 2.5)
  for (let i = 0; i < n; i++) {
    const h1 = fract(Math.sin(k * 12.9898 + i * 78.233) * 43758.5453)
    const h2 = fract(Math.sin(k * 39.346 + i * 11.135) * 24634.6345)
    const a = i * 2.39996 + h1 * 0.8
    const rr = tr.r * (0.34 + 0.16 * h2)
    const dist = (tr.r - rr) * (0.55 + 0.45 * Math.sqrt(h1))
    out.push({ x: tr.x + Math.cos(a) * dist, y: tr.y + Math.sin(a) * dist, r: rr, top: tr.h * (0.93 - 0.08 * (dist / tr.r)) })
  }
  return out
}

/** 樱花的颜色：粉白、淡粉、粉、近白；每七棵里有一棵是八重樱的深粉 */
const BLOSSOM = [
  [253, 226, 236],
  [250, 206, 224],
  [245, 186, 210],
  [255, 241, 246],
] as const
const DOUBLE: readonly [number, number, number] = [238, 160, 192]

/**
 * 樱花的树冠：每棵树由几团花簇叠成，看得见的是最高的那团；花簇按球面打光，光包着球面绕过来一点，背阴面偏紫，
 * 低处被上面的花簇遮着更暗；花簇里细碎的亮点是一朵朵花，缝里透出深一点的粉；边缘柔和。像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ix = prep.crowns
  const t = sc.terrain
  const seed = sc.seed
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const shapes = sc.trees.map((tr, k) => clumps(tr, k))
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = t.x0 + (px + 0.5) / ppu
      const y = t.y0 + (py + 0.5) / ppu
      let best = -Infinity
      let nx = 0
      let ny = 0
      let nz = 1
      let alpha = 0
      let tree = -1
      let top = 0
      const ragged = 0.84 + 0.2 * valueNoise(x * 5.5, y * 5.5, seed + 67)
      for (const k of near(ix, x, y)) {
        const tr = sc.trees[k]!
        if ((x - tr.x) ** 2 + (y - tr.y) ** 2 > (tr.r + 0.1) ** 2) continue
        for (const c of shapes[k]!) {
          const dx = x - c.x
          const dy = y - c.y
          const d2 = dx * dx + dy * dy
          const r = c.r * ragged
          if (d2 >= r * r) continue
          const cz = Math.sqrt(r * r - d2)
          const hgt = c.top - r + cz * 1.1
          alpha = Math.max(alpha, smooth(r, r - 0.08, Math.sqrt(d2)))
          if (hgt <= best) continue
          best = hgt
          nx = dx / r
          ny = dy / r
          nz = cz / r
          tree = k
          top = sc.trees[k]!.h
        }
      }
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      if (tree < 0 || alpha <= 0) {
        out[o + 3] = 0
        continue
      }
      const pal = tree % 7 === 6 ? DOUBLE : BLOSSOM[tree % BLOSSOM.length]!
      const leaf = valueNoise(x * 15, y * 15, seed + 61) * 0.55 + valueNoise(x * 34, y * 34, seed + 63) * 0.45
      const bx = valueNoise(x * 7 + 0.3, y * 7, seed + 69) - valueNoise(x * 7 - 0.3, y * 7, seed + 69)
      const by = valueNoise(x * 7, y * 7 + 0.3, seed + 69) - valueNoise(x * 7, y * 7 - 0.3, seed + 69)
      const mx = nx + bx * 0.9
      const my = ny + by * 0.9
      const ml = Math.sqrt(mx * mx + my * my + nz * nz)
      const lit = clamp01(((mx * LX + my * LY + nz * LZ) / ml + 0.3) / 1.3)
      const low = smooth(0, 1.4, top - best)
      const kk = (0.72 + 0.3 * lit) * (1 - 0.2 * low) * (0.93 + 0.1 * leaf)
      const dim = 1 - lit
      const flower = smooth(0.62, 0.86, valueNoise(x * 26, y * 26, seed + 71)) * (0.45 + 0.55 * lit)
      const gap = smooth(0.3, 0.12, valueNoise(x * 13, y * 13, seed + 73)) * 0.45
      let cr = pal[0] * kk - 10 * dim
      let cg = pal[1] * kk - 24 * dim
      let cb = pal[2] * kk + 4 * dim
      cr += (208 - cr) * gap
      cg += (142 - cg) * gap
      cb += (178 - cb) * gap
      cr += (255 - cr) * flower * 0.7
      cg += (249 - cg) * flower * 0.7
      cb += (252 - cb) * flower * 0.7
      out[o] = cr
      out[o + 1] = cg
      out[o + 2] = cb
      out[o + 3] = alpha * 255
    }
  }
}
