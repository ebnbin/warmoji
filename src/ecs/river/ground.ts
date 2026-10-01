import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import type { RiverConfig } from '../../types/maps'
import { ROCK_M, stoneAt } from './layout'
import type { Boulder, Stone, Terrain, Tree } from './layout'

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

/** 画之前先算一次的东西：树影与树冠的分桶，每个地形格被地形挡住多少太阳光 */
export interface Prepared {
  readonly shadows: TreeIndex
  readonly crowns: TreeIndex
  readonly shade: Float32Array
}

export function prepare(sc: PaintScene): Prepared {
  return { shadows: indexTrees(sc, true), crowns: indexTrees(sc, false), shade: terrainShade(sc) }
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
export interface TreeIndex {
  readonly cols: number
  readonly x0: number
  readonly y0: number
  readonly buckets: Map<number, number[]>
}

/** 把树按 (cx, cy) 分桶：树冠或树影能伸到的每一桶都记上它 */
function indexTrees(sc: PaintScene, shadow: boolean): TreeIndex {
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

/** 一处的卵石：大小两层，取高的那颗；返回它朝太阳的亮度、它是哪颗（哈希）、石面的覆盖（石缝里为零）与它的高 */
interface Cobble {
  lit: number
  h: number
  inside: number
  top: number
}

function oneCobble(x: number, y: number, scale: number, seed: number, lift: number, out: Cobble): void {
  const q = cellNearest(x * scale, y * scale, seed)
  const rad = 0.3 + 0.24 * q.h
  const d = Math.sqrt(q.dx * q.dx + q.dy * q.dy) / rad
  if (d >= 1) return
  const nz = Math.sqrt(1 - d * d) * 0.7
  if (nz * lift <= out.top) return
  const nl = 1 / Math.sqrt((q.dx / rad) ** 2 + (q.dy / rad) ** 2 + nz * nz)
  out.lit = Math.max(0, ((q.dx / rad) * LX + (q.dy / rad) * LY + nz * LZ) * nl)
  out.h = q.h
  out.inside = smooth(1, 0.82, d)
  out.top = nz * lift
}

function cobble(x: number, y: number, scale: number, seed: number, out: Cobble): Cobble {
  out.lit = 0
  out.h = 0
  out.inside = 0
  out.top = 0
  oneCobble(x, y, scale * 2.3, seed + 3, 0.5, out)
  oneCobble(x, y, scale, seed, 1, out)
  return out
}

const COBBLE: Cobble = { lit: 0, h: 0, inside: 0, top: 0 }

const STONE: Stone = { h: 0, gx: 0, gy: 0, id: 0, big: false }

/** 几种石色：暖灰、冷灰、带铁锈的褐灰 */
const STONES = [
  [124, 120, 110],
  [104, 108, 108],
  [118, 106, 92],
] as const

/** 几种野花的颜色：白、黄、淡紫 */
const FLOWERS = [
  [236, 232, 222],
  [228, 200, 74],
  [184, 160, 214],
] as const

/**
 * 地面：空地里是草地，一片片深浅不一，近水更绿，零星开着成簇的野花；近水是湿的泥岸，凸岸堆着卵石滩，水下的河床铺着卵石、缓处长着青苔；
 * 空地外按林子的浓度是林下的落叶地或堆着圆石的岩坡，石头上长着地衣、石缝里长着苔藓；进水口背后是台地与崖壁，出水口外是深谷，越往下雾越重；
 * 空地里的大石顶出地面。按高度场打光，小石头另按石面的弧度打光，往太阳方向找挡光的地形投影，树冠背着太阳投下软影；离空地越远越暗。
 * 只画 rect 那一块，out 里按这块的范围逐行排
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ix = prep.shadows
  const crowns = prep.crowns
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
        out[o] = 34
        out[o + 1] = 32
        out[o + 2] = 24
        out[o + 3] = 255
        continue
      }
      const fu = Math.min(t.cols - 1.001, Math.max(0, (x - t.x0) / t.cell - 0.5))
      const fv = Math.min(t.rows - 1.001, Math.max(0, (y - t.y0) / t.cell - 0.5))
      const ci = Math.floor(fv) * t.cols + Math.floor(fu)
      const ax = fu - Math.floor(fu)
      const ay = fv - Math.floor(fv)
      const z = lerp2(t.z, ci, t.cols, ax, ay)
      let zx = (field(t, t.z, x + e, y) - field(t, t.z, x - e, y)) / (2 * e * mpu)
      let zy = (field(t, t.z, x, y + e) - field(t, t.z, x, y - e)) / (2 * e * mpu)
      const level = lerp2(t.level, ci, t.cols, ax, ay)
      const edge = lerp2(t.edge, ci, t.cols, ax, ay)
      const bar = lerp2(t.bar, ci, t.cols, ax, ay)
      const clear = lerp2(t.clear, ci, t.cols, ax, ay)
      const forest = lerp2(t.forest, ci, t.cols, ax, ay)
      const gorge = lerp2(t.gorge, ci, t.cols, ax, ay)
      const under = level - z
      const patch = fbm(x / 7, y / 7, seed + 3, 2)
      const mid = fbm(x / 2.2, y / 2.2, seed + 5, 2)
      const grain = valueNoise(x * 7, y * 7, seed + 9) * 0.5 + valueNoise(x * 17, y * 17, seed + 11) * 0.5
      const wob = (mid - 0.5) * 0.5
      const outside = smooth(0.15 + wob * 0.4, -0.35, clear)
      const bed = smooth(-0.01, 0.04, under) * smooth(-0.6, 0.2, -edge + 0.3)
      let r = 0
      let g = 0
      let b = 0

      // 草地：大片的深浅按低频噪声，近水更绿、高处更干；草叶顺着风斜着长；野花成簇地开
      if (outside < 0.999 && bed < 0.999) {
        const lush = smooth(3.5, 0.6, edge)
        const dry = clamp01(smooth(0.4, 0.72, patch) * 0.85 - lush * 0.45 + smooth(0.5, 2, z - level) * 0.2)
        const green = clamp01(0.5 + (mid - 0.5) * 1.2 + lush * 0.3)
        r = 92 + (66 - 92) * green + (148 - 92) * dry
        g = 124 + (106 - 124) * green + (138 - 124) * dry
        b = 50 + (42 - 50) * green + (76 - 50) * dry
        const blade = valueNoise(x * 6 + y * 2, y * 22 - x * 2.5, seed + 13)
        const tuft = valueNoise(x * 3.3 + 7.1, y * 3.3, seed + 15)
        const k = (0.9 + 0.14 * blade) * (0.94 + 0.12 * grain) * (0.93 + 0.12 * tuft)
        r *= k
        g *= k
        b *= k
        const bloom = smooth(0.64, 0.7, fbm(x / 2.8, y / 2.8, seed + 19, 2))
        if (bloom > 0) {
          const dot = cellNearest(x * 5.5, y * 5.5, seed + 17)
          const d = Math.sqrt(dot.dx * dot.dx + dot.dy * dot.dy)
          if (d < 0.2 && dot.h < bloom * 0.85) {
            const c = FLOWERS[Math.floor(fbm(x / 9, y / 9, seed + 21, 1) * 2.999)]!
            const a = smooth(0.2, 0.1, d)
            r += (c[0] - r) * a
            g += (c[1] - g) * a
            b += (c[2] - b) * a
          }
        }
      }

      // 河岸：离水边越近越湿越暗；凸岸的边滩与浅处是卵石
      const shore = smooth(cfg.flow.bankU + 0.6 + wob, -0.15, edge)
      if (shore > 0) {
        const wet = smooth(0.7 + wob * 0.6, -0.05, edge)
        const sr = 92 + (60 - 92) * wet
        const sg = 76 + (51 - 76) * wet
        const sb = 54 + (40 - 54) * wet
        const pb = cobble(x, y, 3.4, seed + 21, COBBLE)
        const stony = clamp01(smooth(0.25, 0.7, bar + (patch - 0.5) * 0.6) + smooth(0.62, 0.8, mid) * 0.5)
        const pr = (132 + 34 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const pg = (124 + 28 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const pbb = (108 + 24 * pb.h) * (0.55 + 0.55 * pb.lit) * (1 - 0.3 * wet)
        const st = stony * pb.inside
        r += (sr + (pr - sr) * st - r) * shore
        g += (sg + (pg - sg) * st - g) * shore
        b += (sb + (pbb - sb) * st - b) * shore
      }

      // 河床：卵石更大更圆，缓处、深处蒙着一层青苔
      if (bed > 0) {
        const pb = cobble(x + 13.7, y + 5.1, 2.4, seed + 23, COBBLE)
        const moss = clamp01(smooth(0.2, 0.7, under) * 0.6 + smooth(0.55, 0.75, patch) * 0.4)
        const lit = 0.5 + 0.55 * pb.lit
        let br = (112 + 30 * pb.h) * lit
        let bg = (104 + 24 * pb.h) * lit
        let bb = (88 + 22 * pb.h) * lit
        br += (66 * lit - br) * moss
        bg += (80 * lit - bg) * moss
        bb += (48 * lit - bb) * moss
        const gap = 1 - pb.inside
        const sand = 0.8 + 0.3 * grain
        br += (104 * sand - br) * gap
        bg += (94 * sand - bg) * gap
        bb += (74 * sand - bb) * gap
        r += (br - r) * bed
        g += (bg - g) * bed
        b += (bb - b) * bed
      }

      // 空地外：林下是落叶与腐殖土；岩坡上堆着圆石，石面有细碎的斑点、顶上长地衣，石缝里是苔藓与泥；崖面上是竖着的水痕
      if (outside > 0) {
        const leaf = cellNearest(x * 4.5, y * 4.5, seed + 41)
        const ld = Math.sqrt(leaf.dx * leaf.dx + leaf.dy * leaf.dy)
        let fr = 50 + grain * 14
        let fg = 44 + grain * 12
        let fb = 31 + grain * 8
        if (ld < 0.32) {
          const tone = leaf.h
          const fade = 0.75 + 0.25 * grain
          fr = (tone < 0.35 ? 104 : tone < 0.7 ? 80 : 62) * fade
          fg = (tone < 0.35 ? 66 : tone < 0.7 ? 60 : 70) * fade
          fb = 35 * fade
        }
        const st = stoneAt(seed + 9, x, y, STONE)
        const c = STONES[Math.floor(st.id * 2.999)]!
        const speck = 1 + (valueNoise(x * 24, y * 24, seed + 31) - 0.5) * 0.16 + (valueNoise(x * 5, y * 5, seed + 33) - 0.5) * 0.12
        let rr = c[0] * speck
        let rg = c[1] * speck
        let rb = c[2] * speck
        const top = st.big ? st.h / 1.0 : st.h / 0.42
        const lichen = smooth(0.5, 0.85, top) * smooth(0.45, 0.62, fbm(x * 1.3, y * 1.3, seed + 35, 2)) * 0.5
        rr += (172 - rr) * lichen
        rg += (168 - rg) * lichen
        rb += (128 - rb) * lichen
        const crevice = smooth(0.18, 0, st.h)
        const moss = smooth(0.4, 0.7, fbm(x / 2.6, y / 2.6, seed + 37, 2))
        rr += (52 + 8 * moss - rr) * crevice
        rg += (50 + 22 * moss - rg) * crevice
        rb += (36 + 4 * moss - rb) * crevice
        const slope = Math.sqrt(zx * zx + zy * zy)
        const cliff = smooth(0.9, 2.5, slope)
        if (cliff > 0) {
          const across = (x * -zy + y * zx) / Math.max(slope, 1e-6)
          const down = (x * zx + y * zy) / Math.max(slope, 1e-6)
          const streak = valueNoise(across * 3.5, down * 0.6, seed + 39) * 0.6 + valueNoise(across * 9, down * 1.2, seed + 41) * 0.4
          const ledge = smooth(0.4, 0.6, valueNoise(across * 0.8, down * 2.4, seed + 43))
          const kk = (0.7 + 0.5 * streak) * (0.85 + 0.2 * ledge)
          rr += (96 * kk - rr) * cliff
          rg += (90 * kk - rg) * cliff
          rb += (82 * kk - rb) * cliff
        }
        const fo = clamp01(forest * (1 - cliff))
        const micro = (1 - fo) * outside * (st.big ? 0.6 : 1)
        if (micro > 0) {
          zx -= (st.gx * micro * ROCK_M) / mpu
          zy -= (st.gy * micro * ROCK_M) / mpu
        }
        const contact = 0.72 + 0.28 * smooth(0, 0.2, st.h)
        rr *= contact
        rg *= contact
        rb *= contact
        r += (fr + (rr - fr) * (1 - fo) - r) * outside
        g += (fg + (rg - fg) * (1 - fo) - g) * outside
        b += (fb + (rb - fb) * (1 - fo) - b) * outside
      }

      // 空地里的大石：圆顶，石面上有细裂纹与地衣，贴地的一圈沾着泥
      for (const bo of sc.boulders) {
        const dd = Math.sqrt((x - bo.x) ** 2 + (y - bo.y) ** 2) / bo.r
        if (dd >= 1.05) continue
        const rock = smooth(1.05, 0.9, dd)
        const crack = smooth(0.05, 0.012, cellEdge(x * 2.4, y * 2.4, seed + 53)) * 0.3
        const lichen = smooth(0.6, 0.75, fbm(x * 1.4, y * 1.4, seed + 55, 2)) * 0.45
        let rr = (126 + grain * 18) * (1 - crack)
        let rg = (121 + grain * 16) * (1 - crack)
        let rb = (110 + grain * 14) * (1 - crack)
        rr += (170 - rr) * lichen
        rg += (164 - rg) * lichen
        rb += (128 - rb) * lichen
        const foot = smooth(0.7, 1, dd) * 0.4
        r += (rr * (1 - foot) - r) * rock
        g += (rg * (1 - foot) - g) * rock
        b += (rb * (1 - foot) - b) * rock
      }

      // 深谷：越往下雾越重，谷底发灰发蓝；瀑布砸下去的地方翻着白水
      const below = Math.max(0, level - z)
      const inGorge = smooth(-0.8, 0.4, gorge)
      const haze = smooth(0.8, 6, below) * inGorge
      if (haze > 0) {
        const mist = 0.8 + 0.3 * fbm(x / 1.5, y / 1.5, seed + 57, 2)
        r += (84 * mist - r) * haze * 0.85
        g += (98 * mist - g) * haze * 0.85
        b += (106 * mist - b) * haze * 0.85
      }

      // 光：朝太阳的坡亮、背阴的坡暗；往太阳方向找挡光的地形；树影；深谷里暗下去；离空地越远越暗
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) / Math.sqrt(zx * zx + zy * zy + 1))
      let shade = lerp2(prep.shade, ci, t.cols, ax, ay) * 0.55
      for (const k2 of near(ix, x, y)) {
        const c = shadows[k2]!
        const tr = sc.trees[k2]!
        const soft = 0.45 + tr.h * 0.14
        const dd = Math.sqrt((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y))
        shade = Math.max(shade, smooth(c.r + soft, c.r - soft, dd) * 0.36)
      }
      const dark = 1 - 0.3 * smooth(1, 7, below) * inGorge
      const far = 1 - 0.32 * smooth(2, 9, -clear)
      const light = (0.44 + 0.84 * lambert) * (1 - shade) * dark * far
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
  [56, 92, 40],
  [70, 100, 42],
  [48, 86, 48],
  [82, 104, 42],
  [62, 88, 34],
] as const

/**
 * 树冠：每棵树由几团叶簇叠成，看得见的是最高的那团；叶簇按球面打光，光包着球面绕过来一点，向阳面偏暖偏黄、背阴面偏冷偏蓝，
 * 低处被上面的叶簇遮着更暗，叶面有细碎的明暗与亮斑；边缘柔和。像素带透明度，只画 rect 那一块
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
      const pal = LEAF[tree % LEAF.length]!
      const leaf = valueNoise(x * 15, y * 15, seed + 61) * 0.55 + valueNoise(x * 34, y * 34, seed + 63) * 0.45
      const bx = valueNoise(x * 7 + 0.3, y * 7, seed + 69) - valueNoise(x * 7 - 0.3, y * 7, seed + 69)
      const by = valueNoise(x * 7, y * 7 + 0.3, seed + 69) - valueNoise(x * 7, y * 7 - 0.3, seed + 69)
      const mx = nx + bx * 0.9
      const my = ny + by * 0.9
      const ml = Math.sqrt(mx * mx + my * my + nz * nz)
      const lit = clamp01(((mx * LX + my * LY + nz * LZ) / ml + 0.3) / 1.3)
      const low = smooth(0, 1.4, top - best)
      const kk = (0.34 + 0.66 * lit) * (1 - 0.32 * low) * (0.84 + 0.24 * leaf)
      const warm = lit * lit
      const sparkle = smooth(0.78, 0.92, leaf) * lit * 0.25
      out[o] = (pal[0] * (0.82 + 0.3 * warm) + 40 * sparkle) * kk
      out[o + 1] = (pal[1] * (0.9 + 0.18 * warm) + 36 * sparkle) * kk
      out[o + 2] = (pal[2] * (1.12 - 0.3 * warm) + 10 * sparkle) * kk
      out[o + 3] = alpha * 255
    }
  }
}
