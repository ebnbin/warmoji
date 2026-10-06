import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { FRAME_U, UNIT } from '../../util/units'
import { bankAt, inSweep, insideBy } from './layout'
import { makeBasin, roomAt } from '../basin'
import type { Basin } from '../basin'
import type { CanyonPlan, Mesa } from './layout'
import type { CanyonConfig } from '../../types/maps'

/** 谷底的影子：台面往下推一个崖高后，再顺着太阳的方位往外铺这么多格 */
export const SHADOW_U = 4.6
/** 影子按这么多个样本算软边 */
const SHADOW_STEPS = 9
/** 崖壁上的岩层：一层多厚（格）、往哪边微微倾 */
const STRATA_U = 0.21
/** 台沿往里这么宽（格）是风化的边 */
const LIP_U = 0.32

type Rgb = [number, number, number]

/** 砂岩台面的几种颜色：奶油、鲑红、锈红、深锈、赭黄 */
const SAND_CREAM: Rgb = [238, 200, 158]
const SAND_SALMON: Rgb = [224, 146, 104]
const SAND_RUST: Rgb = [196, 104, 68]
const SAND_DEEP: Rgb = [160, 74, 52]
const SAND_OCHRE: Rgb = [218, 164, 98]
/** 背光的崖壁：被对面晒热的岩壁映着的暖色 */
const WALL_BANDS: readonly Rgb[] = [
  [176, 88, 62],
  [194, 112, 74],
  [150, 68, 52],
  [210, 140, 94],
  [168, 80, 58],
  [128, 58, 50],
  [186, 100, 70],
]
/** 谷里的雾色：越深越往这个蓝紫里沉 */
const HAZE: Rgb = [62, 52, 98]
/** 谷底：晒着的砂砾、背阴的砂砾、河心、浅滩的河水、河边的卵石滩 */
const FLOOR_SUN: Rgb = [176, 130, 98]
const FLOOR_SHADE: Rgb = [52, 44, 92]
const RIVER_DEEP: Rgb = [22, 98, 104]
const RIVER_SHALLOW: Rgb = [62, 156, 146]
const SHOAL: Rgb = [176, 160, 138]
/** 斜阳的颜色：晒着的台面乘上它 */
const SUNLIGHT: Rgb = [1.06, 0.98, 0.88]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function mixTo(c: Rgb, d: Rgb, t: number): void {
  if (t <= 0) return
  const k = t > 1 ? 1 : t
  c[0] += (d[0] - c[0]) * k
  c[1] += (d[1] - c[1]) * k
  c[2] += (d[2] - c[2]) * k
}
function set(c: Rgb, d: Rgb): void {
  c[0] = d[0]
  c[1] = d[1]
  c[2] = d[2]
}
function scale(c: Rgb, k: number): void {
  c[0] *= k
  c[1] *= k
  c[2] *= k
}

/** 太阳的方向在地面上的分量（单位向量）与仰角的正弦 */
const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const SUN_N = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: CanyonConfig
  readonly plan: CanyonPlan
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly rect: PixelRect }

export interface PaintPiece {
  readonly index: number
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面贴图铺满方框 */
export function textureSize(): { w: number; h: number } {
  return { w: FRAME_U * GROUND_PPU, h: FRAME_U * GROUND_PPU }
}

/** 一座台按像素列记下的台面：每列最多两段 [起, 止)，没有为 −1 */
interface Columns {
  readonly x0: number
  readonly n: number
  readonly spans: Int32Array
}

/** 画之前一次算好的：每座台每列的台面 */
export interface Prepared {
  readonly cols: readonly Columns[]
  /** 谷底离崖脚（石台露出来的那片与两岸的崖壁）多远，像素：只按崖，不按能走的范围 */
  readonly ao: Basin
}

/** 谷底离崖脚的距离场：格子 AO_CELL_U 格 */
const AO_CELL_U = 0.25

function occlusion(plan: CanyonPlan): Basin {
  const open = (x: number, y: number): boolean => {
    const u = x / UNIT
    const v = y / UNIT
    const b = bankAt(plan.banks, u)
    if (v < b.north + plan.depth || v > b.south) return false
    return !plan.mesas.some((m) => inSweep(m, plan.depth, u, v))
  }
  const n = Math.round(FRAME_U / AO_CELL_U)
  const keep: { x: number; y: number }[] = []
  for (let j = 1; j < FRAME_U; j += 2) for (let i = 1; i < FRAME_U; i += 2) if (open(i * UNIT, j * UNIT)) keep.push({ x: i * UNIT, y: j * UNIT })
  return makeBasin(open, -UNIT, 0, n + 8, n, AO_CELL_U * UNIT, keep, 0)
}

export function prepare(sc: PaintScene): Prepared {
  const ppu = GROUND_PPU
  return {
    ao: occlusion(sc.plan),
    cols: sc.plan.mesas.map((m) => {
      const x0 = Math.floor(m.box[0] * ppu) - 1
      const x1 = Math.ceil(m.box[2] * ppu) + 1
      const y0 = Math.floor(m.box[1] * ppu) - 1
      const y1 = Math.ceil(m.box[3] * ppu) + 1
      const n = x1 - x0
      const spans = new Int32Array(n * 4).fill(-1)
      for (let c = 0; c < n; c++) {
        const x = (x0 + c + 0.5) / ppu
        let k = 0
        let was = false
        for (let py = y0; py <= y1; py++) {
          const now = insideBy(m, x, (py + 0.5) / ppu) > 0
          if (now && !was && k < 2) spans[c * 4 + k * 2] = py
          if (!now && was && k < 2) {
            spans[c * 4 + k * 2 + 1] = py
            k++
          }
          was = now
        }
        if (was && k < 2) spans[c * 4 + k * 2 + 1] = y1 + 1
      }
      return { x0, n, spans }
    }),
  }
}

/** 第 m 座台在像素列 px 上：py 在台面里返回 0；在它下面的崖壁上返回离台沿多少像素（正）；都不是返回 −1 */
function columnHit(c: Columns, px: number, py: number, wall: number): number {
  const i = px - c.x0
  if (i < 0 || i >= c.n) return -1
  let best = -1
  for (let k = 0; k < 2; k++) {
    const a = c.spans[i * 4 + k * 2]!
    const b = c.spans[i * 4 + k * 2 + 1]!
    if (a < 0) break
    if (py >= a && py < b) return 0
    const s = py - b + 1
    if (s > 0 && s <= wall && (best < 0 || s < best)) best = s
  }
  return best
}

/** 台沿在像素列 px 上那一段的下沿（像素）：崖壁法线按它的斜率算 */
function rimBottom(c: Columns, px: number, py: number): number {
  const i = Math.min(c.n - 1, Math.max(0, px - c.x0))
  let best = -1
  for (let k = 0; k < 2; k++) {
    const b = c.spans[i * 4 + k * 2 + 1]!
    if (b < 0) break
    if (b <= py + 1 && b > best) best = b
  }
  return best
}

/** 晒着的地方乘上斜阳的颜色 */
function sunlit(c: Rgb, k: number): void {
  c[0] *= 1 + (SUNLIGHT[0] - 1) * k
  c[1] *= 1 + (SUNLIGHT[1] - 1) * k
  c[2] *= 1 + (SUNLIGHT[2] - 1) * k
}

/** 台面的起伏，格：几道低矮的岩包 */
function relief(x: number, y: number, seed: number): number {
  return (fbm(x * 0.32, y * 0.32, seed + 61, 3) - 0.5) * 0.9 + (valueNoise(x * 1.1, y * 1.1, seed + 63) - 0.5) * 0.08
}

/**
 * 砂岩台面：交错层理的一道道彩带按噪声扭着走，大片的色调起伏，节理的细缝、零星的小坑和碎石；
 * 台沿往里一窄条风化得粗糙发暗，朝着太阳的边沿亮一线；台心稍稍拱起
 */
function paintTop(out: Rgb, x: number, y: number, depth: number, nx: number, ny: number, seed: number, bank: boolean): void {
  const wx = x + (fbm(x * 0.18, y * 0.18, seed + 3, 3) - 0.5) * 5
  const wy = y + (fbm(x * 0.18 + 9, y * 0.18 + 4, seed + 5, 3) - 0.5) * 5
  const dir = (seed % 628) / 100
  const along = wx * Math.cos(dir) + wy * Math.sin(dir)
  const band = Math.sin(along * 1.9 + fbm(wx * 0.4, wy * 0.4, seed + 7, 3) * 7)
  const fine = Math.sin(along * 7.3 + valueNoise(wx * 1.3, wy * 1.3, seed + 9) * 3)
  set(out, SAND_SALMON)
  mixTo(out, SAND_CREAM, smooth(0.25, 0.85, band) * 0.85)
  mixTo(out, SAND_RUST, smooth(-0.3, -0.9, band) * 0.8)
  mixTo(out, SAND_DEEP, smooth(0.6, 1, -fine) * 0.25)
  mixTo(out, SAND_OCHRE, smooth(0.55, 0.85, fbm(x * 0.07, y * 0.07, seed + 11, 3)) * 0.5)
  if (bank) {
    mixTo(out, SAND_RUST, 0.25)
    scale(out, 0.92)
  }
  // 细密的纹层：顺着彩带一道道发丝样的暗线
  const lam = Math.abs(Math.sin(along * 9.5 + fbm(wx * 0.55, wy * 0.55, seed + 12, 3) * 9))
  if (lam < 0.12) scale(out, 0.9 + lam * 0.8)
  // 被风磨圆的岩包：按起伏朝着太阳打光
  const hx = (relief(x + 0.08, y, seed) - relief(x - 0.08, y, seed)) / 0.16
  const hy = (relief(x, y + 0.08, seed) - relief(x, y - 0.08, seed)) / 0.16
  const nl = Math.hypot(hx, hy, 1)
  const lit = (-hx * SUN_N.x - hy * SUN_N.y + SUN_N.z) / nl
  scale(out, 0.72 + (lit - SUN_N.z) * 0.9 + 0.28)
  const swell = fbm(x * 0.12, y * 0.12, seed + 13, 4)
  scale(out, 0.94 + swell * 0.12)
  // 节理：一道道细缝
  const joint = cellEdge(x * 0.34 + 0.4 * fbm(x * 0.8, y * 0.8, seed + 15, 2), y * 0.34, seed + 17)
  if (joint < 0.035 && fbm(x * 0.5, y * 0.5, seed + 16, 2) > 0.48) scale(out, 0.84 + joint * 4.5)
  // 风蚀的小坑：坑壁背着太阳的一侧暗、朝着的一侧亮
  const pit = cellNearest(x * 0.32, y * 0.32, seed + 19)
  if (pit.h < 0.07) {
    const r = Math.hypot(pit.dx, pit.dy)
    const rr = 0.12 + pit.h * 0.6
    if (r < rr) {
      const lit = -(pit.dx * SUN_N.x + pit.dy * SUN_N.y) / (r || 1)
      scale(out, 0.88 + 0.12 * lit * (r / rr))
      if (r < rr * 0.5) mixTo(out, [150, 92, 70], 0.25)
    }
  }
  // 碎石与沙粒
  const grain = valueNoise(x * 22, y * 22, seed + 21)
  scale(out, 0.95 + grain * 0.1)
  const peb = cellNearest(x * 2.6, y * 2.6, seed + 23)
  if (peb.h < 0.12 && Math.hypot(peb.dx, peb.dy) < 0.16) {
    const lit = peb.dx * SUN_N.x + peb.dy * SUN_N.y
    mixTo(out, lit > 0 ? [246, 214, 176] : [118, 62, 46], 0.55)
  }
  // 岸上稀稀拉拉的矮灌木：灰绿的一小团，影子背着太阳
  if (bank) {
    const bush = cellNearest(x * 0.9, y * 0.9, seed + 25)
    const br = Math.hypot(bush.dx, bush.dy)
    if (bush.h < 0.22) {
      const sx = bush.dx - AWAY.x * 0.12
      const sy = bush.dy - AWAY.y * 0.12
      if (Math.hypot(sx, sy) < 0.2) scale(out, 0.68)
      if (br < 0.17) {
        set(out, [104, 108, 82])
        mixTo(out, [146, 146, 108], clamp01(-(bush.dx * SUN_N.x + bush.dy * SUN_N.y) * 4) * 0.6)
        scale(out, 0.85 + valueNoise(x * 30, y * 30, seed) * 0.3)
      }
    }
  }
  // 台沿：风化的一窄条，粗糙、暗一些；朝太阳的边亮一线
  if (depth < LIP_U) {
    const t = 1 - depth / LIP_U
    const rough = valueNoise(x * 9, y * 9, seed + 27)
    scale(out, 1 - t * (0.18 + rough * 0.18))
    const face = -(nx * SUN_N.x + ny * SUN_N.y)
    if (depth < 0.07) {
      if (face < 0) mixTo(out, [250, 220, 182], 0.55 * Math.min(1, -face * 2))
      else scale(out, 0.75)
    }
  }
  sunlit(out, 1)
}

/**
 * 背光的崖壁：一层层水平的岩层按噪声起伏，岩漆从台沿往下流成一道道深色的竖纹；朝西的那段迎着斜阳亮起来，背光的映着对面晒热的岩壁仍是暖色；
 * 越往下越沉进谷里的蓝紫，崖脚堆着一圈碎石
 */
function paintWall(out: Rgb, x: number, s: number, depth: number, nx: number, seed: number): void {
  const f = s / depth
  const layer = (s + (fbm(x * 0.15, 3.1, seed + 31, 3) - 0.5) * 0.5 + x * 0.015) / STRATA_U
  const li = Math.floor(layer)
  const lf = layer - li
  const a = WALL_BANDS[((li % WALL_BANDS.length) + WALL_BANDS.length) % WALL_BANDS.length]!
  set(out, a)
  // 岩层之间的缝：一道暗线
  if (lf < 0.08) scale(out, 0.78)
  // 岩漆：从台沿往下流的深色竖纹
  const streak = fbm(x * 3.2, s * 0.25, seed + 33, 3)
  scale(out, 1 - smooth(0.55, 0.8, streak) * 0.32)
  // 岩面的起伏与颗粒
  scale(out, 0.92 + valueNoise(x * 7, s * 4, seed + 35) * 0.14)
  // 迎着斜阳的那段（朝西）亮起来
  const face = -(nx * SUN_N.x)
  if (face > 0) {
    mixTo(out, [236, 150, 96], face * 0.55 * (1 - f))
    sunlit(out, face)
  }
  // 台沿那一线被光勾亮
  if (s < 0.05) mixTo(out, [240, 178, 128], 0.5)
  // 崖脚的碎石坡
  if (f > 0.78) {
    const peb = cellNearest(x * 3, s * 3, seed + 37)
    const t = smooth(0.78, 1, f)
    if (peb.h < 0.5 * t && Math.hypot(peb.dx, peb.dy) < 0.3) mixTo(out, peb.dx * SUN_N.x + peb.dy * SUN_N.y > 0 ? [170, 116, 92] : [84, 56, 66], 0.6)
  }
  mixTo(out, HAZE, Math.pow(f, 1.25) * 0.78)
}

/** 谷底在不在影子里（0 到 1）：台面与北岸往下推一个崖高、再顺着太阳的方位铺出去盖住的就是影子 */
function shadowAt(sc: PaintScene, x: number, y: number): number {
  const { plan } = sc
  const d = plan.depth
  let hit = 0
  for (let k = 0; k < SHADOW_STEPS; k++) {
    const t = (k + 0.5) / SHADOW_STEPS
    const px = x - AWAY.x * SHADOW_U * t
    const py = y - d - AWAY.y * SHADOW_U * t
    let shade = py < bankAt(plan.banks, px).north
    if (!shade) {
      for (const m of plan.mesas) {
        if (px < m.box[0] || px > m.box[2] || py < m.box[1] || py > m.box[3]) continue
        if (insideBy(m, px, py) > 0) {
          shade = true
          break
        }
      }
    }
    if (shade) hit++
  }
  return hit / SHADOW_STEPS
}

/** (x, y) 格离谷底的河多远（格，减去那一点的半宽：河里为负） */
function riverDist(plan: CanyonPlan, x: number, y: number): number {
  const { pts, half } = plan.river
  let best = Infinity
  const i0 = Math.max(0, Math.floor((x + 1) / 0.25) - 12)
  const i1 = Math.min(half.length - 2, i0 + 24)
  for (let i = i0; i <= i1; i++) {
    const ax = pts[i * 2]!
    const ay = pts[i * 2 + 1]!
    const bx = pts[i * 2 + 2]!
    const by = pts[i * 2 + 3]!
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / l2) : 0
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t) - (half[i]! + (half[i + 1]! - half[i]!) * t)
    if (d < best) best = d
  }
  return best
}

/**
 * 谷底：晒着的地方是暖灰的砂砾，影子里沉成蓝紫；河在中间弯着，河心深青、两边浅，河边一圈卵石滩；散着几块大石头；
 * 整个谷底蒙着一层雾色
 */
function paintFloor(out: Rgb, sc: PaintScene, ao: Basin, x: number, y: number, seed: number): void {
  const sh = shadowAt(sc, x, y)
  set(out, FLOOR_SUN)
  mixTo(out, [164, 128, 110], fbm(x * 0.3, y * 0.3, seed + 41, 3))
  // 水冲出来的一道道浅沟与沙洲
  const wash = fbm(x * 0.6 + fbm(x * 0.2, y * 0.2, seed + 39, 2) * 3, y * 1.4, seed + 40, 3)
  mixTo(out, [212, 176, 134], smooth(0.58, 0.75, wash) * 0.45)
  scale(out, 0.9 + valueNoise(x * 14, y * 14, seed + 43) * 0.2)
  const rd = riverDist(sc.plan, x, y)
  if (rd < 0.45) {
    // 卵石滩：河边一圈浅色的卵石
    const peb = cellNearest(x * 4, y * 4, seed + 45)
    set(out, SHOAL)
    if (Math.hypot(peb.dx, peb.dy) < 0.32) scale(out, 0.85 + (peb.dx * SUN_N.x + peb.dy * SUN_N.y) * 0.3)
    else scale(out, 0.8)
  }
  if (rd < 0) {
    const depth = clamp01(-rd / 0.5)
    set(out, RIVER_SHALLOW)
    mixTo(out, RIVER_DEEP, depth)
  }
  // 大小不一的石头：圆滚滚的，朝太阳的一面亮，背着太阳拖一小截影子
  const big = fbm(x * 0.15, y * 0.15, seed + 46, 2) > 0.55
  const rock = cellNearest(x * (big ? 0.5 : 1.3), y * (big ? 0.5 : 1.3), seed + (big ? 47 : 48))
  const rr = (big ? 0.2 : 0.09) + rock.h * (big ? 0.25 : 0.1)
  const r = Math.hypot(rock.dx, rock.dy)
  if (rock.h < (big ? 0.1 : 0.14) && rd > 0.2) {
    const sx = rock.dx - AWAY.x * rr * 0.6
    const sy = rock.dy - AWAY.y * rr * 0.6
    if (Math.hypot(sx, sy) < rr) scale(out, 0.7)
    if (r < rr) {
      const nz = Math.sqrt(Math.max(0, 1 - (r / rr) ** 2))
      const lit = clamp01((rock.dx / rr) * SUN_N.x + (rock.dy / rr) * SUN_N.y + nz * SUN_N.z)
      set(out, mix3([150, 104, 84], [126, 108, 104], rock.h * 5))
      scale(out, 0.55 + lit * 0.6)
    }
  }
  // 崖脚背着天光，越贴着崖脚越暗
  const room = roomAt(ao, x * UNIT, y * UNIT) / UNIT
  scale(out, 0.62 + 0.38 * smooth(0, 2.2, room))
  // 影子里沉成蓝紫，晒着的地方也蒙着雾
  const sun = 1 - sh
  const shadeCol: Rgb = [out[0] * 0.42 + FLOOR_SHADE[0] * 0.58, out[1] * 0.42 + FLOOR_SHADE[1] * 0.58, out[2] * 0.42 + FLOOR_SHADE[2] * 0.58]
  mixTo(out, shadeCol, 1 - sun)
  if (sun > 0) sunlit(out, sun * 0.8)
  mixTo(out, HAZE, 0.26 + 0.14 * (1 - sun))
}

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** 画一块：每个像素先看是不是台面（石台或两岸），再看是不是露出来的崖壁，都不是就是谷底 */
export function paintGround(sc: PaintScene, prep: Prepared, px: Uint8ClampedArray, rect: PixelRect): void {
  const ppu = GROUND_PPU
  const { plan } = sc
  const wall = Math.round(plan.depth * ppu)
  const seed = plan.seed & 0xffff
  const c: Rgb = [0, 0, 0]
  const w = rect.x1 - rect.x0
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let ix = rect.x0; ix < rect.x1; ix++) {
      const x = (ix + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const bank = bankAt(plan.banks, x)
      let done = false
      if (y < bank.north || y > bank.south) {
        const depth = y < bank.north ? bank.north - y : y - bank.south
        const slope = (bankAt(plan.banks, x + 0.1).north - bankAt(plan.banks, x - 0.1).north) / 0.2
        const ny = y < bank.north ? 1 : -1
        paintTop(c, x, y, depth, y < bank.north ? -slope / Math.hypot(slope, 1) : 0, ny / Math.hypot(slope, 1), seed + 101, true)
        done = true
      }
      let wallS = -1
      let wallMesa = -1
      if (!done) {
        for (let m = 0; m < plan.mesas.length; m++) {
          const hit = columnHit(prep.cols[m]!, ix, py, wall)
          if (hit === 0) {
            const ms = plan.mesas[m]!
            const g = rimNormal(ms, x, y)
            paintTop(c, x, y, insideBy(ms, x, y), g.x, g.y, ms.seed & 0xffff, false)
            done = true
            break
          }
          if (hit > 0 && (wallS < 0 || hit < wallS)) {
            wallS = hit
            wallMesa = m
          }
        }
      }
      if (!done) {
        const ns = py - Math.round(bank.north * ppu)
        if (ns >= 0 && ns < wall && (wallS < 0 || ns < wallS)) {
          const slope = (bankAt(plan.banks, x + 0.1).north - bankAt(plan.banks, x - 0.1).north) / 0.2
          paintWall(c, x, ns / ppu, plan.depth, -slope / Math.hypot(slope, 1), seed + 103)
          done = true
        } else if (wallS > 0) {
          const cols = prep.cols[wallMesa]!
          const e0 = rimBottom(cols, ix - 2, py)
          const e1 = rimBottom(cols, ix + 2, py)
          const slope = e0 >= 0 && e1 >= 0 ? (e1 - e0) / 4 : 0
          paintWall(c, x, wallS / ppu, plan.depth, -slope / Math.hypot(slope, 1), plan.mesas[wallMesa]!.seed & 0xffff)
          done = true
        }
      }
      if (!done) paintFloor(c, sc, prep.ao, x, y, seed)
      const o = ((py - rect.y0) * w + (ix - rect.x0)) * 4
      px[o] = c[0]
      px[o + 1] = c[1]
      px[o + 2] = c[2]
      px[o + 3] = 255
    }
  }
}

/** 台沿朝外的法线：按台面深度的梯度 */
function rimNormal(m: Mesa, x: number, y: number): { x: number; y: number } {
  const h = 0.05
  const gx = insideBy(m, x - h, y) - insideBy(m, x + h, y)
  const gy = insideBy(m, x, y - h) - insideBy(m, x, y + h)
  const l = Math.hypot(gx, gy) || 1
  return { x: gx / l, y: gy / l }
}

/**
 * 给谷底着色器的数据图：每格 cell 格，红是谷底露出来的程度（崖壁越往下越大，台面为零），绿是河（软边），蓝是晒着的程度
 */
export function gorgeData(sc: PaintScene, cell: number): { cols: number; rows: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const { plan } = sc
  const cols = Math.round(FRAME_U / cell)
  const rows = cols
  const data = new Uint8ClampedArray(cols * rows * 4)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cell
      const y = (j + 0.5) * cell
      const bank = bankAt(plan.banks, x)
      let open = 1
      if (y < bank.north || y > bank.south) open = 0
      else if (y < bank.north + plan.depth) open = (y - bank.north) / plan.depth
      for (const m of plan.mesas) {
        if (x < m.box[0] - 0.2 || x > m.box[2] + 0.2 || y < m.box[1] - 0.2 || y > m.box[3] + plan.depth) continue
        if (insideBy(m, x, y) > -0.05) {
          open = 0
          break
        }
        for (let s = 0.1; s <= plan.depth; s += 0.1) {
          if (insideBy(m, x, y - s) > 0) {
            open = Math.min(open, s / plan.depth)
            break
          }
        }
      }
      const o = (j * cols + i) * 4
      data[o] = Math.round(Math.pow(open, 1.4) * 255)
      data[o + 1] = Math.round(smooth(0.15, -0.25, riverDist(plan, x, y)) * smooth(0.9, 1, open) * 255)
      data[o + 2] = Math.round((1 - shadowAt(sc, x, y)) * 255)
      data[o + 3] = 255
    }
  }
  return { cols, rows, data }
}
