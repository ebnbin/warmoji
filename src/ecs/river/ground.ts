import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import type { RiverConfig } from '../../types/maps'
import type { Boulder, Terrain, Tree } from './layout'

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

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 画地面、树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: RiverConfig
  readonly terrain: Terrain
  readonly trees: readonly Tree[]
  readonly boulders: readonly Boulder[]
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

/** 树按位置分桶：键是桶的行列 */
export interface TreeIndex {
  readonly cols: number
  readonly x0: number
  readonly y0: number
  readonly buckets: Map<number, number[]>
}

/** 把树按 (cx, cy) 分桶：树冠或树影能伸到的每一桶都记上它 */
export function indexTrees(sc: PaintScene, shadow: boolean): TreeIndex {
  const t = sc.terrain
  const cols = Math.ceil((t.cols * t.cell) / BUCKET_U) + 1
  const buckets = new Map<number, number[]>()
  sc.trees.forEach((tr, k) => {
    const c = shadow ? shadowOf(sc.cfg, tr) : { x: tr.x, y: tr.y, r: tr.r }
    const r = c.r + (shadow ? 1.2 : 0.1)
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

/** 一棵树投在地上的影子：树冠中心离地约树高的六成半，背着太阳拖出去，最多 TREE_SHADOW_U 格 */
function shadowOf(cfg: RiverConfig, tr: Tree): { x: number; y: number; r: number } {
  const off = Math.min(TREE_SHADOW_U, (tr.h * 0.65 * SHADOW_PER_M) / cfg.meterPerU)
  return { x: tr.x - (LX / LXY) * off, y: tr.y - (LY / LXY) * off, r: tr.r * 0.92 }
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

/** 一颗卵石：细胞噪声的特征点当石心，半径按哈希起伏，按太阳打光；石缝里是暗的泥沙。返回亮度倍率，石缝为负 */
function pebble(x: number, y: number, scale: number, seed: number): { lit: number; h: number; inside: number } {
  const q = cellNearest(x * scale, y * scale, seed)
  const rad = 0.4 + 0.14 * q.h
  const d = Math.sqrt(q.dx * q.dx + q.dy * q.dy) / rad
  if (d >= 1) return { lit: 0, h: q.h, inside: 0 }
  const nz = Math.sqrt(1 - d * d)
  const lit = Math.max(0, ((q.dx / rad) * LX + (q.dy / rad) * LY + nz * LZ * 0.9) / 1)
  return { lit, h: q.h, inside: smooth(1, 0.8, d) }
}

/**
 * 地面：空地里是草地，近水是湿的泥岸，凸岸堆着卵石滩，水下的河床铺着卵石、缓处长着青苔；空地外按林子的浓度是林下的落叶地或岩石，
 * 进水口背后是台地与崖壁，出水口外是越往下越暗的深谷；石头顶出地面。按高度场打光，往太阳方向找挡光的地形投影，树冠背着太阳投下软影；
 * 离空地越远越暗。只画 rect 那一块，out 里按这块的范围逐行排
 */
export function paintGround(sc: PaintScene, ix: TreeIndex, out: Uint8ClampedArray, rect: PixelRect): void {
  const t = sc.terrain
  const cfg = sc.cfg
  const mpu = cfg.meterPerU
  const seed = sc.seed
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const e = t.cell
  const sx = LX / LXY
  const sy = LY / LXY
  const rise = (LZ / LXY) * mpu
  const shadows = sc.trees.map((tr) => shadowOf(cfg, tr))
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = t.x0 + (px + 0.5) / ppu
      const y = t.y0 + (py + 0.5) / ppu
      const z = field(t, t.z, x, y)
      const zx = (field(t, t.z, x + e, y) - field(t, t.z, x - e, y)) / (2 * e * mpu)
      const zy = (field(t, t.z, x, y + e) - field(t, t.z, x, y - e)) / (2 * e * mpu)
      const slope = Math.sqrt(zx * zx + zy * zy)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) / Math.sqrt(slope * slope + 1))
      const level = field(t, t.level, x, y)
      const edge = field(t, t.edge, x, y)
      const bar = field(t, t.bar, x, y)
      const clear = field(t, t.clear, x, y)
      const forest = field(t, t.forest, x, y)
      const gorge = field(t, t.gorge, x, y)
      const under = level - z
      const big = fbm(x / 5, y / 5, seed + 3, 2)
      const mid = fbm(x / 1.6, y / 1.6, seed + 5, 2)
      const grain = valueNoise(x * 7, y * 7, seed + 9) * 0.5 + valueNoise(x * 17, y * 17, seed + 11) * 0.5
      const wob = (mid - 0.5) * 0.5

      // 草地：近水更绿，高处更干；草叶顺着风斜着长，一丛一丛的，偶尔开几朵小花
      const dry = clamp01(smooth(0.3, 0.75, big) * 0.7 + smooth(0.6, 2.5, z - level) * 0.4 - smooth(3, 0.5, edge) * 0.3)
      let r = 66 + (122 - 66) * dry
      let g = 98 + (118 - 98) * dry
      let b = 40 + (64 - 40) * dry
      const blade = valueNoise(x * 7 + y * 2.2, y * 26 - x * 3, seed + 13)
      const clump = cellNearest(x * 2.6, y * 2.6, seed + 15)
      const k = (0.86 + 0.26 * blade) * (1 - 0.14 * smooth(0.25, 0.6, Math.sqrt(clump.dx * clump.dx + clump.dy * clump.dy))) * (0.92 + 0.16 * grain)
      r *= k
      g *= k
      b *= k
      if (mid > 0.6 && valueNoise(x * 38, y * 38, seed + 17) > 0.93) {
        const yellow = clump.h > 0.5
        r = yellow ? 222 : 236
        g = yellow ? 196 : 232
        b = yellow ? 70 : 220
      }

      // 河岸：离水边越近越湿越暗；凸岸的边滩与浅处是卵石
      const shore = smooth(cfg.flow.bankU + 0.6 + wob, -0.15, edge)
      if (shore > 0) {
        const wet = smooth(0.7 + wob * 0.6, -0.05, edge)
        const sr = 92 + (60 - 92) * wet
        const sg = 76 + (51 - 76) * wet
        const sb = 54 + (40 - 54) * wet
        const pb = pebble(x, y, 4.2, seed + 21)
        const stony = clamp01(smooth(0.25, 0.7, bar + (big - 0.5) * 0.6) + smooth(0.62, 0.8, mid) * 0.5)
        const pr = (132 + 34 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const pg = (124 + 28 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const pbb = (108 + 24 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const st = stony * pb.inside
        const mr = sr + (pr - sr) * st
        const mg = sg + (pg - sg) * st
        const mb = sb + (pbb - sb) * st
        r += (mr - r) * shore
        g += (mg - g) * shore
        b += (mb - b) * shore
      }

      // 河床：卵石更大更圆，缓处、深处蒙着一层青苔
      const bed = smooth(-0.01, 0.04, under) * smooth(-0.6, 0.2, -edge + 0.3)
      if (bed > 0) {
        const pb = pebble(x + 13.7, y + 5.1, 3.1, seed + 23)
        const moss = clamp01(smooth(0.2, 0.7, under) * 0.6 + smooth(0.55, 0.75, big) * 0.4)
        const lit = 0.5 + 0.55 * pb.lit
        let br = (112 + 30 * pb.h) * lit
        let bg = (104 + 24 * pb.h) * lit
        let bb = (88 + 22 * pb.h) * lit
        br += (66 * lit - br) * moss
        bg += (80 * lit - bg) * moss
        bb += (48 * lit - bb) * moss
        const gap = 1 - pb.inside
        br += (58 - br) * gap
        bg += (54 - bg) * gap
        bb += (44 - bb) * gap
        r += (br - r) * bed
        g += (bg - g) * bed
        b += (bb - b) * bed
      }

      // 空地外：林下是落叶与腐殖土，岩石区是一块块的灰岩、裂缝与地衣；陡的崖面上是竖着的水痕
      const outside = smooth(0.15 + wob * 0.4, -0.35, clear)
      if (outside > 0) {
        const leaf = cellNearest(x * 4.5, y * 4.5, seed + 41)
        const ld = Math.sqrt(leaf.dx * leaf.dx + leaf.dy * leaf.dy)
        let fr = 50 + grain * 14
        let fg = 44 + grain * 12
        let fb = 31 + grain * 8
        if (ld < 0.32) {
          const tone = leaf.h
          fr = tone < 0.35 ? 104 : tone < 0.7 ? 80 : 62
          fg = tone < 0.35 ? 66 : tone < 0.7 ? 60 : 70
          fb = tone < 0.35 ? 34 : tone < 0.7 ? 36 : 36
          const fade = 0.75 + 0.25 * grain
          fr *= fade
          fg *= fade
          fb *= fade
        }
        const facet = cellNearest(x * 1.3, y * 1.3, seed + 31)
        const crack = smooth(0.06, 0.015, cellEdge(x * 1.3, y * 1.3, seed + 31)) * 0.55 + smooth(0.035, 0.008, cellEdge(x * 3.4, y * 3.4, seed + 33)) * 0.3
        const tilt = (facet.h - 0.5) * 0.35
        let rr = (108 + 26 * facet.h + grain * 14) * (1 + tilt) * (1 - crack)
        let rg = (106 + 22 * facet.h + grain * 12) * (1 + tilt) * (1 - crack)
        let rb = (100 + 18 * facet.h + grain * 12) * (1 + tilt) * (1 - crack)
        const lichen = smooth(0.62, 0.74, fbm(x / 1.9, y / 1.9, seed + 35, 2)) * 0.6
        rr += (158 - rr) * lichen
        rg += (152 - rg) * lichen
        rb += (116 - rb) * lichen
        const moss = smooth(0.5, 0.72, fbm(x / 2.6, y / 2.6, seed + 37, 2)) * 0.55
        rr += (62 - rr) * moss
        rg += (80 - rg) * moss
        rb += (44 - rb) * moss
        const cliff = smooth(0.9, 2.5, slope)
        if (cliff > 0) {
          const streak = valueNoise((x * -zy + y * zx) / Math.max(slope, 1e-6) * 3.5, (x * zx + y * zy) / Math.max(slope, 1e-6) * 0.6, seed + 39)
          const kk = 1 + (streak - 0.5) * 0.7 * cliff
          rr *= kk
          rg *= kk
          rb *= kk
        }
        const fo = clamp01(forest * (1 - cliff))
        const or = fr + (rr - fr) * (1 - fo)
        const og = fg + (rg - fg) * (1 - fo)
        const ob = fb + (rb - fb) * (1 - fo)
        r += (or - r) * outside
        g += (og - g) * outside
        b += (ob - b) * outside
      }

      // 石头：圆顶的大石，石面上有细裂纹与地衣，贴地的一圈沾着泥
      for (const bo of sc.boulders) {
        const dd = Math.sqrt((x - bo.x) ** 2 + (y - bo.y) ** 2) / bo.r
        if (dd >= 1.05) continue
        const rock = smooth(1.05, 0.9, dd)
        const crack = smooth(0.05, 0.012, cellEdge(x * 2.4, y * 2.4, seed + 53)) * 0.35
        const lichen = smooth(0.6, 0.75, fbm(x * 1.4, y * 1.4, seed + 55, 2)) * 0.5
        let rr = (122 + grain * 18) * (1 - crack)
        let rg = (119 + grain * 16) * (1 - crack)
        let rb = (110 + grain * 14) * (1 - crack)
        rr += (166 - rr) * lichen
        rg += (160 - rg) * lichen
        rb += (126 - rb) * lichen
        const foot = smooth(0.7, 1, dd) * 0.4
        r += (rr * (1 - foot) - r) * rock
        g += (rg * (1 - foot) - g) * rock
        b += (rb * (1 - foot) - b) * rock
      }

      // 光：朝太阳的坡亮、背阴的坡暗；往太阳方向找挡光的地形；树影；深谷里越深越暗；离空地越远越暗
      let over = 0
      for (const s of SHADOW_STEPS) over = Math.max(over, field(t, t.z, x + sx * s, y + sy * s) - z - s * rise)
      let shade = smooth(0.02, 0.3, over) * 0.62
      for (const k2 of near(ix, x, y)) {
        const c = shadows[k2]!
        const tr = sc.trees[k2]!
        const soft = 0.35 + tr.h * 0.12
        const dd = Math.sqrt((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y))
        shade = Math.max(shade, smooth(c.r + soft, c.r - soft, dd) * 0.5)
      }
      const deep = smooth(0.8, 5, level - z) * smooth(-0.8, 0.4, gorge)
      const far = 1 - 0.35 * smooth(2, 9, -clear)
      const light = (0.42 + 0.86 * lambert) * (1 - shade) * (1 - 0.8 * deep) * far
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      out[o] = r * light
      out[o + 1] = g * light
      out[o + 2] = b * light
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
const fract = (v: number): number => v - Math.floor(v)

/** 一棵树冠的颜色：几种绿 */
const LEAF = [
  [46, 82, 36],
  [60, 92, 38],
  [38, 70, 42],
  [74, 98, 44],
  [52, 78, 30],
] as const

/**
 * 树冠：每棵树由几团叶簇叠成，看得见的是最高的那团；叶簇按球面朝太阳打光，低处的叶簇被上面的挡着更暗，叶面有细碎的明暗与透光的缝；
 * 边缘柔和。像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, ix: TreeIndex, out: Uint8ClampedArray, rect: PixelRect): void {
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
      for (const k of near(ix, x, y)) {
        const tr = sc.trees[k]!
        if ((x - tr.x) ** 2 + (y - tr.y) ** 2 > (tr.r + 0.1) ** 2) continue
        for (const c of shapes[k]!) {
          const dx = x - c.x
          const dy = y - c.y
          const d2 = dx * dx + dy * dy
          if (d2 >= c.r * c.r) continue
          const cz = Math.sqrt(c.r * c.r - d2)
          const hgt = c.top - c.r + cz * 1.1
          const edge = smooth(c.r, c.r - 0.08, Math.sqrt(d2))
          alpha = Math.max(alpha, edge)
          if (hgt <= best) continue
          best = hgt
          nx = dx / c.r
          ny = dy / c.r
          nz = cz / c.r
          tree = k
          top = tr.h
        }
      }
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      if (tree < 0 || alpha <= 0) {
        out[o + 3] = 0
        continue
      }
      const pal = LEAF[tree % LEAF.length]!
      const leaf = valueNoise(x * 13, y * 13, seed + 61) * 0.6 + valueNoise(x * 29, y * 29, seed + 63) * 0.4
      const tuft = cellNearest(x * 5.5, y * 5.5, seed + 65)
      const tuftLit = Math.max(0, tuft.dx * LX * 1.6 + tuft.dy * LY * 1.6 + 0.5)
      const lit = Math.max(0, nx * LX + ny * LY + nz * LZ)
      const low = smooth(0, 1.2, top - best)
      const gap = smooth(0.12, 0.02, leaf - 0.25) * 0.5
      const kk = (0.42 + 0.8 * lit) * (1 - 0.45 * low) * (0.82 + 0.3 * leaf) * (0.85 + 0.3 * tuftLit) * (1 - gap)
      out[o] = pal[0] * kk
      out[o + 1] = pal[1] * kk
      out[o + 2] = pal[2] * kk
      out[o + 3] = alpha * 255
    }
  }
}
