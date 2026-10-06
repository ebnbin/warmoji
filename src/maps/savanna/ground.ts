import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { FRAME_U, UNIT } from '../../util/units'
import { roomAt } from '../basin'
import { lumpGap, pondGap } from './layout'
import { crownAt, crownColor, platesOf, snagTwigs, spiresOf } from './flora'
import type { Plate, Twig } from './flora'
import type { Acacia, Lump, SavannaPlan } from './layout'
import type { SavannaConfig } from '../../types/maps'

/** 树冠、草梢与枯枝那一层贴图每格多少像素 */
export const CANOPY_PPU = 24
/** 高度与边上的影子先按这么细的格子算好，画的时候插值，格 */
const FIELD_U = 0.25
/** 影子从挡光的东西往外最多拖这么远，格 */
const SHADOW_REACH_U = 6
/** 按这么大（格）的格子分桶，画一个像素只看附近一桶 */
const BUCKET_U = 2
/** 深草丛与刺灌丛多高，米：草地边上投下的影子按它 */
const SCRUB_M = 1.5
/** 水坑往下凹多深，米 */
const POND_DEPTH_M = 0.7

/** 太阳：画面上的方向与仰角；黄昏的光是暖的，天光带着天上的紫 */
const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const
const SUN_RGB = [1.02, 0.86, 0.66] as const
const SKY_RGB = [0.54, 0.5, 0.72] as const
const DIRECT = 1.12
const AMBIENT = 0.62

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const mixc = (a: readonly number[], b: readonly number[], t: number, out: number[]): void => {
  out[0] = a[0]! + (b[0]! - a[0]!) * t
  out[1] = a[1]! + (b[1]! - a[1]!) * t
  out[2] = a[2]! + (b[2]! - a[2]!) * t
}

/** 画地面与树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: SavannaConfig
  readonly plan: SavannaPlan
}

/** 地图上以格计的一块 */
export interface Area {
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
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

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面与草梢铺满方框 */
export const GROUND_AREA: Area = { x0: 0, y0: 0, w: FRAME_U, h: FRAME_U }

const PPU: Record<PaintLayer, number> = { ground: GROUND_PPU, canopy: CANOPY_PPU }

export function textureSize(layer: PaintLayer): { w: number; h: number } {
  return { w: Math.round(GROUND_AREA.w * PPU[layer]), h: Math.round(GROUND_AREA.h * PPU[layer]) }
}

/** 按位置分的桶：每桶记着罩到它的条目 */
interface Buckets {
  readonly cols: number
  readonly lists: number[][]
}

const NONE: readonly number[] = []

function buckets(): Buckets {
  const cols = Math.ceil(FRAME_U / BUCKET_U)
  return { cols, lists: Array.from({ length: cols * cols }, () => []) }
}

function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  const c0 = Math.max(0, Math.floor(x0 / BUCKET_U))
  const c1 = Math.min(bk.cols - 1, Math.floor(x1 / BUCKET_U))
  const r0 = Math.max(0, Math.floor(y0 / BUCKET_U))
  const r1 = Math.min(bk.cols - 1, Math.floor(y1 / BUCKET_U))
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bk.lists[r * bk.cols + c]!.push(k)
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  const c = Math.floor(x / BUCKET_U)
  const r = Math.floor(y / BUCKET_U)
  if (c < 0 || r < 0 || c >= bk.cols || r >= bk.cols) return NONE
  return bk.lists[r * bk.cols + c]!
}

/** 投影的长度：每米高拖多少格 */
function shadowOf(sc: PaintScene, hM: number): number {
  return hM * sc.cfg.shadowUPerM
}

/** 画之前一次算好的：高度与边上的影子的场，石头、蚁丘、树与兽道按位置分的桶，枯树的枝 */
export interface Prepared {
  readonly cols: number
  readonly height: Float32Array
  readonly shade: Float32Array
  readonly rocks: readonly Lump[]
  readonly rockBk: Buckets
  readonly spires: readonly Lump[]
  readonly spireBk: Buckets
  readonly plates: readonly (readonly Plate[])[]
  readonly treeBk: Buckets
  readonly twigs: readonly Twig[]
  readonly twigBk: Buckets
  readonly trail: readonly { ax: number; ay: number; bx: number; by: number }[]
  readonly trailBk: Buckets
}

/** 草地的边以内多远（格），外面为负 */
function inField(plan: SavannaPlan, x: number, y: number): number {
  return roomAt(plan.field, x * UNIT, y * UNIT) / UNIT
}

export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const cols = Math.round(FRAME_U / FIELD_U) + 1
  const height = new Float32Array(cols * cols)
  const occ = new Float32Array(cols * cols)
  const seed = plan.seed
  const rocks = [...plan.kopje.back, ...plan.kopje.front]
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * FIELD_U
      const y = j * FIELD_U
      const k = j * cols + i
      const f = inField(plan, x, y)
      const pg = pondGap(plan.pond, x, y)
      let h = (fbm(x / 7, y / 7, seed + 41, 3) - 0.5) * 0.4 - POND_DEPTH_M * smooth(1.2, -1.6, pg)
      // 山丘那边出了草地往外是一路堆高的石头坡
      const hill = smooth(2.5, -0.5, lumpGap(rocks, x, y)) * smooth(0, -2, f)
      h += hill * 1.2
      height[k] = h
      // 挡光的高：草地外的深草丛，石头按圆顶
      let top = h
      if (f < 0) top = Math.max(top, h + SCRUB_M * smooth(0, -0.6, f) * (1 - hill))
      for (const r of rocks) {
        const d = Math.hypot(x - r.x, y - r.y)
        if (d < r.r) top = Math.max(top, h + r.h * Math.sqrt(1 - (d / r.r) ** 2))
      }
      occ[k] = top
    }
  }
  // 往太阳那边一步步看过去：有东西高过太阳的光线就落在影子里，按高出多少软一点
  const shade = new Float32Array(cols * cols)
  const mPerU = 1 / sc.cfg.shadowUPerM
  const ux = -AWAY.x
  const uy = -AWAY.y
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      const h0 = occ[k]! - 0.02
      let s = 0
      for (let t = FIELD_U; t <= SHADOW_REACH_U; t += FIELD_U) {
        const si = Math.round(i + (ux * t) / FIELD_U)
        const sj = Math.round(j + (uy * t) / FIELD_U)
        if (si < 0 || sj < 0 || si >= cols || sj >= cols) break
        const over = occ[sj * cols + si]! - h0 - t * mPerU
        if (over > 0) s = Math.max(s, smooth(0, 0.25, over))
        if (s >= 1) break
      }
      shade[k] = s
    }
  }
  const rockBk = buckets()
  rocks.forEach((r, k) => file(rockBk, k, r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r))
  const spires = spiresOf(plan)
  const spireBk = buckets()
  spires.forEach((m, k) => {
    const len = shadowOf(sc, m.h)
    const ex = m.x + AWAY.x * len
    const ey = m.y + AWAY.y * len
    file(spireBk, k, Math.min(m.x, ex) - m.r - 1, Math.min(m.y, ey) - m.r - 1, Math.max(m.x, ex) + m.r + 1, Math.max(m.y, ey) + m.r + 1)
  })
  const plates = plan.acacias.map((a, k) => platesOf(a, crownSeed(plan, k)))
  const treeBk = buckets()
  plan.acacias.forEach((a, k) => {
    const len = shadowOf(sc, a.h)
    const ex = a.x + a.ox + AWAY.x * len
    const ey = a.y + a.oy + AWAY.y * len
    const R = a.crown * 1.5
    file(treeBk, k, Math.min(a.x, ex) - R, Math.min(a.y, ey) - R, Math.max(a.x, ex) + R, Math.max(a.y, ey) + R)
  })
  const twigs = snagTwigs(plan)
  const twigBk = buckets()
  twigs.forEach((t, k) => {
    const ka = shadowOf(sc, t.az)
    const kb = shadowOf(sc, t.bz)
    const xs = [t.ax, t.bx, t.ax + AWAY.x * ka, t.bx + AWAY.x * kb]
    const ys = [t.ay, t.by, t.ay + AWAY.y * ka, t.by + AWAY.y * kb]
    file(twigBk, k, Math.min(...xs) - 0.3, Math.min(...ys) - 0.3, Math.max(...xs) + 0.3, Math.max(...ys) + 0.3)
  })
  const trail: { ax: number; ay: number; bx: number; by: number }[] = []
  for (const t of plan.trails) for (let i = 1; i < t.length; i++) trail.push({ ax: t[i - 1]!.x, ay: t[i - 1]!.y, bx: t[i]!.x, by: t[i]!.y })
  const trailBk = buckets()
  trail.forEach((s, k) => file(trailBk, k, Math.min(s.ax, s.bx) - 1, Math.min(s.ay, s.by) - 1, Math.max(s.ax, s.bx) + 1, Math.max(s.ay, s.by) + 1))
  return { cols, height, shade, rocks, rockBk, spires, spireBk, plates, treeBk, twigs, twigBk, trail, trailBk }
}

/** 场里 (x, y) 格处按格点双线性取值 */
function sample(prep: Prepared, a: Float32Array, x: number, y: number): number {
  const n = prep.cols
  const u = Math.min(n - 1.001, Math.max(0, x / FIELD_U))
  const v = Math.min(n - 1.001, Math.max(0, y / FIELD_U))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fx = u - i
  const fy = v - j
  const k = j * n + i
  const a0 = a[k]!
  const a1 = a[k + 1]!
  const a2 = a[k + n]!
  const a3 = a[k + n + 1]!
  return a0 + (a1 - a0) * fx + (a2 - a0) * fy + (a0 - a1 - a2 + a3) * fx * fy
}

function segDist(ax: number, ay: number, bx: number, by: number, x: number, y: number): { d: number; t: number } {
  const ex = bx - ax
  const ey = by - ay
  const l2 = ex * ex + ey * ey || 1e-12
  const t = clamp01(((x - ax) * ex + (y - ay) * ey) / l2)
  return { d: Math.hypot(x - ax - ex * t, y - ay - ey * t), t }
}

/** 第 k 棵金合欢树冠的种子 */
export function crownSeed(plan: SavannaPlan, k: number): number {
  return plan.seed + k * 31
}

/** 刺灌丛在 (x, y) 格处：盖住多少（0 到 1），写下离那一丛圆心的偏移（相对半径）到 BUSH；出了草地的边成片地长，越往外越密 */
const BUSH = { u: 0, v: 0 }
function bushAt(seed: number, x: number, y: number, f: number): number {
  const zone = smooth(0.25, -0.7, f)
  if (zone <= 0) return 0
  const clump = smooth(0.42, 0.62, fbm(x / 4, y / 4, seed + 141, 2) + 0.25 * smooth(-1.5, -5, f))
  const q = cellNearest(x * 0.7, y * 0.7, seed + 43)
  if (q.h >= clump * 0.9) return 0
  const rr = 0.32 + 0.22 * ((q.h * 7.31) % 1)
  BUSH.u = q.dx / rr
  BUSH.v = q.dy / rr
  const d = Math.hypot(BUSH.u, BUSH.v) + (valueNoise(x * 7, y * 7, seed + 149) - 0.5) * 0.3
  return smooth(1, 0.8, d) * zone
}

/** 一点落在多少影子里（0 到 1）：石头与蚁丘的投影，金合欢树冠的影子（漏着光斑）连着树干的影子，枯枝细细的影子，边上与地形的影子 */
function shadowAt(sc: PaintScene, prep: Prepared, x: number, y: number): number {
  const plan = sc.plan
  let s = sample(prep, prep.shade, x, y)
  for (const k of near(prep.spireBk, x, y)) {
    const m = prep.spires[k]!
    if (Math.hypot(x - m.x, y - m.y) < m.r) continue
    const len = shadowOf(sc, m.h)
    const t = clamp01(((x - m.x) * AWAY.x + (y - m.y) * AWAY.y) / len)
    const px = m.x + AWAY.x * len * t
    const py = m.y + AWAY.y * len * t
    const rr = m.r * (1 - t) * 0.9 + 0.05
    s = Math.max(s, smooth(rr + 0.06, rr - 0.06, Math.hypot(x - px, y - py)) * smooth(-0.2, 0.1, (x - m.x) * AWAY.x + (y - m.y) * AWAY.y + m.r * 0.6))
  }
  for (const k of near(prep.treeBk, x, y)) {
    const a = plan.acacias[k]!
    const len = shadowOf(sc, a.h)
    const ex = a.x + a.ox + AWAY.x * len
    const ey = a.y + a.oy + AWAY.y * len
    // 低低的太阳把树冠的影子拉长：顺着影子的方向抻开
    const dx = x - ex
    const dy = y - ey
    const along = dx * AWAY.x + dy * AWAY.y
    const across = -dx * AWAY.y + dy * AWAY.x
    const stretch = 1.35
    const cover = crownAt(prep.plates[k]!, crownSeed(plan, k), a.x + a.ox + across * -AWAY.y + (along / stretch) * AWAY.x, a.y + a.oy + across * AWAY.x + (along / stretch) * AWAY.y)
    s = Math.max(s, smooth(0.15, 0.55, cover) * 0.78)
    const tr = segDist(a.x, a.y, ex, ey, x, y)
    s = Math.max(s, smooth(a.r * 0.9 * (1 - tr.t * 0.4) + 0.04, a.r * 0.9 * (1 - tr.t * 0.4) - 0.04, tr.d) * 0.9)
  }
  for (const k of near(prep.twigBk, x, y)) {
    const t = prep.twigs[k]!
    const ka = shadowOf(sc, t.az)
    const kb = shadowOf(sc, t.bz)
    const r = segDist(t.ax + AWAY.x * ka, t.ay + AWAY.y * ka, t.bx + AWAY.x * kb, t.by + AWAY.y * kb, x, y)
    const w = t.w * 0.9
    s = Math.max(s, smooth(w + 0.03, w - 0.03, r.d) * 0.75)
  }
  return s
}

const RGB = [0, 0, 0]
const TMP = [0, 0, 0]
/** 枯草的几种颜色：浅的发白、本色的麦秆黄、深的赭黄；裸露的红土；踩实的兽道 */
const STRAW_PALE = [0.88, 0.81, 0.64] as const
const STRAW = [0.8, 0.7, 0.5] as const
const STRAW_DEEP = [0.66, 0.54, 0.38] as const
const SOIL = [0.7, 0.52, 0.4] as const
const PATH = [0.74, 0.6, 0.47] as const
const DRY_MUD = [0.7, 0.6, 0.5] as const
const CRACK = [0.3, 0.24, 0.21] as const
const WET_MUD = [0.3, 0.24, 0.21] as const
const GRANITE = [0.8, 0.71, 0.63] as const
const LICHEN = [0.82, 0.62, 0.28] as const
const LATERITE = [0.8, 0.5, 0.34] as const
const THORN = [0.33, 0.36, 0.25] as const
const GRAVEL = [0.42, 0.36, 0.34] as const

/** 一丛草墩：在 (x, y) 格处盖住多少，写下离墩心的偏移（相对半径）到 TUFT；dens 是草墩有多密（0 到 1） */
const TUFT = { u: 0, v: 0, shade: 0, cover: 0 }
function tussock(seed: number, x: number, y: number, dens: number): number {
  const q = cellNearest(x * 1.6, y * 1.6, seed + 151)
  if (q.h > dens) return 0
  const rr = (0.12 + 0.16 * ((q.h * 13.1) % 1)) * 1.6
  const u = q.dx / rr
  const v = q.dy / rr
  const blades = (valueNoise(x * 14, y * 14, seed + 153) - 0.5) * 0.35
  TUFT.u = u
  TUFT.v = v
  return smooth(1, 0.45, Math.hypot(u, v) + blades)
}

/**
 * 枯草地一点的颜色（albedo），写进 RGB：大片深浅按低频噪声，草叶顺着风斜着长，夹着一片片浅浅的裸土；
 * 一丛丛草墩迎光的一边草尖发亮，背着光的一边投下小小的影子（写进 TUFT）；tall 是草长高的程度
 */
function grass(sc: PaintScene, x: number, y: number, tall: number): void {
  const seed = sc.plan.seed
  const w = sc.plan.wind
  const patch = fbm(x / 6.5, y / 6.5, seed + 3, 3)
  const mid = fbm(x / 2.1, y / 2.1, seed + 5, 2)
  const along = x * w.x + y * w.y
  const across = y * w.x - x * w.y
  const blade = valueNoise(along * 3.2 + across * 0.6, across * 15 - along * 1.5, seed + 13)
  const blade2 = valueNoise(along * 5 - across * 0.9, across * 26, seed + 17)
  mixc(STRAW, STRAW_PALE, smooth(0.45, 0.72, patch) * 0.8 + (mid - 0.5) * 0.3, RGB)
  mixc(RGB, STRAW_DEEP, clamp01(smooth(0.5, 0.25, patch) * 0.6 + tall * 0.4), RGB)
  // 裸土：一小片一小片，浅浅的尘土色，越往草深的地方越少
  const bare = smooth(0.68, 0.76, fbm(x / 1.8 + 9, y / 1.8, seed + 23, 3)) * (1 - tall)
  mixc(RGB, SOIL, bare * 0.55, RGB)
  const tex = 0.84 + 0.2 * blade + 0.1 * blade2 * (1 + tall)
  RGB[0] = RGB[0]! * tex
  RGB[1] = RGB[1]! * tex
  RGB[2] = RGB[2]! * tex
  // 草墩：墩上的草尖迎光发白，背光的一边暗；墩子背着太阳的地上落一小块影子
  const dens = (0.4 + 0.45 * tall) * (1 - bare)
  const here = tussock(seed, x, y, dens)
  TUFT.cover = here
  if (here > 0) {
    const lit = clamp01(0.55 + (TUFT.u * L.x + TUFT.v * L.y) * 0.8)
    const tip = 0.78 + 0.3 * lit + 0.12 * blade2
    mixc(RGB, [STRAW[0] * tip * 1.06, STRAW[1] * tip, STRAW[2] * tip * 0.86], here * 0.35, RGB)
    TMP[0] = TUFT.u
    TMP[1] = TUFT.v
  }
  const under = tussock(seed, x - AWAY.x * 0.2, y - AWAY.y * 0.2, dens)
  TUFT.shade = under * (1 - here) * 0.45
}

/** 水面底下：黄昏的天映在水里，中间是丁香紫，往暗处是深紫，靠岸的浅水透着泥 */
function water(sc: PaintScene, x: number, y: number, pg: number): void {
  const p = sc.plan.pond
  const depth = smooth(0, -2.2, pg)
  const u = (x - p.x) / (p.r * 2) - (y - p.y) / (p.r * 2)
  const sky = [0.86 + 0.08 * u, 0.6 + 0.04 * u, 0.7 - 0.06 * u]
  const deep = [0.34, 0.24, 0.38]
  const mud = [0.36, 0.3, 0.26]
  mixc(deep, sky, 0.35 + 0.45 * smooth(0.2, 1, depth) + 0.12 * (fbm(x * 0.5, y * 0.5, sc.plan.seed + 61, 2) - 0.5), RGB)
  mixc(RGB, mud, smooth(-0.55, 0, pg) * 0.7, RGB)
}

/** 圆顶的东西（石头）在 (dx, dy)（相对半径）处的法线，写进 TMP */
function domeNormal(dx: number, dy: number, flat: number): void {
  const r2 = Math.min(0.999, dx * dx + dy * dy)
  const nz = Math.sqrt(1 - r2) * flat + (1 - flat) * 0.6
  const l = Math.hypot(dx, dy, nz)
  TMP[0] = dx / l
  TMP[1] = dy / l
  TMP[2] = nz / l
}

/**
 * 地面：草地是一片片深浅不一的枯草，草叶顺着风斜着长，一丛丛草墩，夹着成片裸露的红土；从水边往外踩出的兽道是压实的红土，印着蹄印。
 * 水坑往下凹，水面映着黄昏的天；水边一圈湿泥泛着光，再往外是龟裂的干泥，满是蹄印。草地的边上草越长越高，出了边是深草丛与刺灌丛；
 * 山丘是一块块圆顶的花岗岩，长着橙黄的地衣，石头缝里是碎石。蚁丘是红土垒的尖塔，身上一道道竖棱。
 * 太阳低低地从左上照过来：迎光的暖、背光与影子里透着天上的紫；石头、蚁丘、树冠与枯枝都拖着长长的影子。只画 rect 那一块
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const pc = sc.cfg.pond
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const seed = plan.seed
  const e = FIELD_U
  const grassU = sc.cfg.edge.grassU
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / ppu
      const y = GROUND_AREA.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const f = inField(plan, x, y)
      const pg = pondGap(plan.pond, x, y)
      // 地形的法线：高度场的梯度，每米对应几格
      const zx = (sample(prep, prep.height, x + e, y) - sample(prep, prep.height, x - e, y)) / (2 * e * sc.cfg.meterPerU)
      const zy = (sample(prep, prep.height, x, y + e) - sample(prep, prep.height, x, y - e)) / (2 * e * sc.cfg.meterPerU)
      let nx = -zx
      let ny = -zy
      let nz = 1
      let gloss = 0
      let ao = 1
      let isWater = false
      let tuftShade = 0
      const edgeNoise = (fbm(x * 1.3, y * 1.3, seed + 31, 2) - 0.5) * 0.9
      if (pg < 0) {
        water(sc, x, y, pg)
        isWater = true
      } else {
        const shore = pc.shoreU + edgeNoise * 0.4
        const flat = pc.shoreU + pc.flatU + edgeNoise * 1.2
        // 草地或草地外的灌丛
        if (f > -0.15) {
          const tall = smooth(grassU, 0, f + edgeNoise * 0.5)
          grass(sc, x, y, tall)
          tuftShade = TUFT.shade
          if (TUFT.cover > 0) {
            const k = TUFT.cover * 0.6
            nx += TUFT.u * k
            ny += TUFT.v * k
          }
        } else {
          // 深草丛：草更高更密更深；刺灌丛的冠子画在上面那层，这里只垫一圈压暗的根
          grass(sc, x, y, 1)
          mixc(RGB, [0.5, 0.44, 0.38], 0.35, RGB)
          RGB[0] = RGB[0]! * 0.7
          RGB[1] = RGB[1]! * 0.69
          RGB[2] = RGB[2]! * 0.7
          const under = bushAt(seed, x - AWAY.x * 0.15, y - AWAY.y * 0.15, f)
          ao *= 1 - 0.55 * smooth(0, 0.6, under)
          ao *= 1 - 0.25 * smooth(-0.2, -3, f)
        }
        // 兽道：踩实的红土，按离道中多远淡出去
        let tr = Infinity
        for (const k of near(prep.trailBk, x, y)) {
          const s = prep.trail[k]!
          tr = Math.min(tr, segDist(s.ax, s.ay, s.bx, s.by, x, y).d)
        }
        const trail = smooth(0.3, 0.12, tr + (valueNoise(x * 2.5, y * 2.5, seed + 51) - 0.5) * 0.2) * smooth(-0.2, 0.4, f)
        if (trail > 0) {
          const grit = 0.9 + 0.15 * valueNoise(x * 14, y * 14, seed + 53)
          mixc(RGB, [PATH[0] * grit, PATH[1] * grit, PATH[2] * grit], trail * 0.6, RGB)
        }
        // 水边：干泥龟裂成一块块，块边翘起来发亮；越近水越湿越暗、泛着天光
        const dryMud = smooth(flat + 0.35, flat - 0.35, pg)
        if (dryMud > 0) {
          const ce = cellEdge(x * 1.5, y * 1.5, seed + 57)
          const crack = smooth(0.07, 0.025, ce)
          const lip = smooth(0.12, 0.07, ce) * (1 - crack)
          const tone = 0.92 + 0.12 * valueNoise(x * 5, y * 5, seed + 59)
          mixc(DRY_MUD, CRACK, crack, TMP)
          TMP[0] = TMP[0]! * tone + lip * 0.08
          TMP[1] = TMP[1]! * tone + lip * 0.07
          TMP[2] = TMP[2]! * tone + lip * 0.06
          mixc(RGB, TMP, dryMud, RGB)
        }
        const wet = smooth(shore + 0.25, shore - 0.35, pg)
        if (wet > 0) {
          const ripple = valueNoise(x * 6, y * 6, seed + 63)
          mixc(RGB, [WET_MUD[0] * (0.9 + 0.2 * ripple), WET_MUD[1] * (0.9 + 0.2 * ripple), WET_MUD[2] * (0.92 + 0.2 * ripple)], wet, RGB)
          gloss = wet * (0.35 + 0.65 * smooth(shore, 0, pg))
        }
        // 蹄印：水边越近越密，一对对的小坑，湿泥里的积着水
        const prints = smooth(flat + 1.5, shore * 0.5, pg) * (0.25 + 0.75 * trail) + trail * 0.35
        if (prints > 0.05) {
          const q = cellNearest(x * 3.2, y * 3.2, seed + 67)
          if (q.h < prints * 0.8) {
            const ang = q.h * 37
            const c = Math.cos(ang)
            const s = Math.sin(ang)
            const u = q.dx * c + q.dy * s
            const v = -q.dx * s + q.dy * c
            const hoof = Math.min(Math.hypot(u - 0.07, v * 1.3) , Math.hypot(u + 0.07, v * 1.3))
            const k = smooth(0.09, 0.05, hoof)
            if (k > 0) {
              const dark = 0.62
              RGB[0] = RGB[0]! * (1 - k * (1 - dark))
              RGB[1] = RGB[1]! * (1 - k * (1 - dark))
              RGB[2] = RGB[2]! * (1 - k * (1 - dark * 1.05))
              gloss = Math.max(gloss, k * wet)
            }
          }
        }
        // 山丘的石头：一块块扁圆、顶上平缓的花岗岩，表面风化出几道裂缝，长着橙黄的地衣；挤在一起时看得见最高的那块
        let onRock = false
        let rockTop = 0
        for (const k of near(prep.rockBk, x, y)) {
          const r = prep.rocks[k]!
          const ang = ((k * 0.618034) % 1) * Math.PI
          const c = Math.cos(ang)
          const sn = Math.sin(ang)
          const squash = 0.74 + 0.18 * ((k * 0.3819) % 1)
          const lu = ((x - r.x) * c + (y - r.y) * sn) / r.r
          const lv = (-(x - r.x) * sn + (y - r.y) * c) / (r.r * squash)
          const d2 = lu * lu + lv * lv
          if (d2 >= 1) continue
          const top = r.h * Math.sqrt(1 - d2)
          if (top <= rockTop) continue
          rockTop = top
          onRock = true
          const lich = smooth(0.62, 0.7, fbm(x * 1.6, y * 1.6, seed + 71 + k, 3))
          const grain = 0.9 + 0.12 * valueNoise(x * 11, y * 11, seed + 73) + 0.06 * fbm(x * 3, y * 3, seed + 79, 2)
          mixc(GRANITE, LICHEN, lich * 0.75, RGB)
          const crack = smooth(0.03, 0.01, cellEdge(x * 0.45 + k, y * 0.45, seed + 77)) * smooth(1, 0.5, d2) * (k % 3 === 0 ? 0 : 1)
          RGB[0] = RGB[0]! * grain * (1 - 0.55 * crack)
          RGB[1] = RGB[1]! * grain * (1 - 0.58 * crack)
          RGB[2] = RGB[2]! * grain * (1 - 0.5 * crack)
          domeNormal(lu, lv / squash, 0.62)
          nx = TMP[0]! * c - TMP[1]! * sn
          ny = TMP[0]! * sn + TMP[1]! * c
          nz = TMP[2]!
          ao = 1 - 0.4 * smooth(0.7, 1, Math.sqrt(d2))
        }
        if (!onRock && f < 0 && lumpGap(prep.rocks, x, y) < 2) {
          const gr = 0.85 + 0.25 * valueNoise(x * 7, y * 7, seed + 83)
          mixc(RGB, [GRAVEL[0] * gr, GRAVEL[1] * gr, GRAVEL[2] * gr], smooth(2, 0.4, lumpGap(prep.rocks, x, y)), RGB)
          ao *= 0.75 + 0.25 * smooth(0, 0.8, lumpGap(prep.rocks, x, y))
        }
        // 蚁丘：红土垒的几座尖塔挤在一起，最高的那座在中间；身上一道道竖棱，顶上几个通气的洞，脚下一圈刨出来的浮土
        for (const m of plan.mounds) {
          const d = Math.hypot(x - m.x, y - m.y) / m.r
          if (d >= 1.7 || d < 1) continue
          const apron = smooth(1.7, 1.05, d)
          mixc(RGB, SOIL, apron * 0.55, RGB)
          ao *= 1 - 0.3 * apron
        }
        let spireH = 0
        let best = -1
        for (const k of near(prep.spireBk, x, y)) {
          const m = prep.spires[k]!
          const d = Math.hypot(x - m.x, y - m.y) / m.r
          if (d >= 1) continue
          const hgt = m.h * Math.pow(1 - d, 0.8)
          if (hgt > spireH) {
            spireH = hgt
            best = k
          }
        }
        if (best >= 0) {
          const m = prep.spires[best]!
          const dx = (x - m.x) / m.r
          const dy = (y - m.y) / m.r
          const d = Math.hypot(dx, dy) || 1e-6
          const ang = Math.atan2(dy, dx)
          const flute = Math.sin(ang * 11 + fbm(x * 2.5, y * 2.5, seed + 89, 2) * 5)
          // 圆锥的侧面：顶上陡、脚下缓；竖棱让法线左右偏一点
          const slope = 0.45 + 0.9 * (1 - d)
          nx = (dx / d) * slope - (dy / d) * flute * 0.22
          ny = (dy / d) * slope + (dx / d) * flute * 0.22
          nz = 1
          const tone = 0.88 + 0.16 * valueNoise(x * 10, y * 10, seed + 97) + 0.06 * flute
          mixc(LATERITE, SOIL, smooth(0.2, 0.95, d) * 0.45, RGB)
          RGB[0] = RGB[0]! * tone
          RGB[1] = RGB[1]! * tone
          RGB[2] = RGB[2]! * tone
          const vent = cellNearest(x * 5, y * 5, seed + 101)
          if (d < 0.5 && vent.h < 0.35 && Math.hypot(vent.dx, vent.dy) < 0.13) {
            RGB[0] = RGB[0]! * 0.3
            RGB[1] = RGB[1]! * 0.25
            RGB[2] = RGB[2]! * 0.25
          }
          ao *= 0.85 + 0.15 * d
        }
        // 树干与枯树脚下：一圈压着的暗
        for (const a of plan.acacias) ao *= 1 - 0.3 * smooth(0.8, 0.2, Math.hypot(x - a.x, y - a.y))
        for (const s of plan.snags) ao *= 1 - 0.3 * smooth(0.8, 0.2, Math.hypot(x - s.x, y - s.y))
        // 草地边上的草根处更暗
        ao *= 1 - 0.08 * smooth(0.6, -0.2, f) * (f > -0.15 ? 1 : 0)
      }
      // 光：天光（带着紫）照着一切，阳光按朝太阳多正，被挡住的落在影子里
      const nl = Math.hypot(nx, ny, nz) || 1
      const lam = Math.max(0, (nx * L.x + ny * L.y + nz * L.z) / nl)
      const shadow = isWater ? 0 : Math.max(tuftShade, shadowAt(sc, prep, x, y))
      const sun = DIRECT * lam * (1 - shadow * 0.9)
      let r = RGB[0]! * (SKY_RGB[0] * AMBIENT * ao + SUN_RGB[0] * sun)
      let g = RGB[1]! * (SKY_RGB[1] * AMBIENT * ao + SUN_RGB[1] * sun)
      let b = RGB[2]! * (SKY_RGB[2] * AMBIENT * ao + SUN_RGB[2] * sun)
      if (isWater) {
        r = RGB[0]!
        g = RGB[1]!
        b = RGB[2]!
      }
      if (gloss > 0) {
        // 湿泥映着天：粉紫的一层亮
        const sheen = gloss * (0.28 + 0.25 * fbm(x * 0.7, y * 0.7, seed + 107, 2)) * (1 - shadow * 0.5)
        r += (0.95 - r) * sheen
        g += (0.7 - g) * sheen
        b += (0.78 - b) * sheen
      }
      out[o] = Math.min(255, r * 255)
      out[o + 1] = Math.min(255, g * 255)
      out[o + 2] = Math.min(255, b * 255)
      out[o + 3] = 255
    }
  }
}

/**
 * 草梢与枯枝那一层（盖在身体之上）：草地边上深草丛的草梢与刺灌丛的冠子探进来，走到边上的身体半掩在草里；
 * 枯树灰白的枝杈。金合欢的树冠另画，好让有身体在底下时变淡
 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const seed = plan.seed
  const wind = plan.wind
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / ppu
      const y = GROUND_AREA.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const f = inField(plan, x, y)
      const rocky = lumpGap(prep.rocks, x, y) < 1.2
      // 草梢：边以外密，往里探进来一点就稀了；一根根顺着风斜着
      if (f < 0.55 && !rocky) {
        const along = x * wind.x + y * wind.y
        const across = y * wind.x - x * wind.y
        const blade = valueNoise(along * 2.2, across * 11, seed + 211)
        const dens = smooth(0.55, -0.6, f + (fbm(x * 1.2, y * 1.2, seed + 213, 2) - 0.5) * 0.8)
        const k = clamp01(smooth(0.62 - dens * 0.45, 0.8 - dens * 0.45, blade) * dens)
        if (k > 0) {
          const lit = 0.85 + 0.35 * valueNoise(along * 6, across * 20, seed + 217)
          const tone = fbm(x * 0.6, y * 0.6, seed + 219, 2)
          mixc(STRAW_PALE, STRAW_DEEP, tone * 0.7, TMP)
          r = TMP[0]! * lit * 0.96
          g = TMP[1]! * lit * 0.86
          b = TMP[2]! * lit * 0.8
          a = k * 0.95
        }
        // 刺灌丛的冠子：出了边一丛丛、一片片地长，探进草地一点；圆顶按团打光，叶间露出灰白的刺
        const bush = bushAt(seed, x, y, f)
        if (bush > 0) {
          const leaf = valueNoise(x * 11, y * 11, seed + 223)
          const lit = clamp01(0.55 + (BUSH.u * L.x + BUSH.v * L.y) * 0.9) * (0.7 + 0.5 * leaf)
          const thorny = smooth(0.82, 0.9, valueNoise(x * 23, y * 23, seed + 229))
          const br = THORN[0] * (0.5 + 0.75 * lit) + 0.25 * thorny
          const bg = THORN[1] * (0.5 + 0.68 * lit) + 0.2 * thorny
          const bb = THORN[2] * (0.6 + 0.6 * lit) + 0.18 * thorny
          r = r * (1 - bush) + br * bush
          g = g * (1 - bush) + bg * bush
          b = b * (1 - bush) + bb * bush
          a = Math.max(a, bush)
        }
      }
      // 枯枝：灰白的老木头，迎光的一面泛着暖
      for (const k of near(prep.twigBk, x, y)) {
        const t = prep.twigs[k]!
        const s = segDist(t.ax, t.ay, t.bx, t.by, x, y)
        const ww = t.w
        const cov = smooth(ww + 0.025, ww - 0.025, s.d)
        if (cov <= 0) continue
        const side = clamp01(0.55 + 0.45 * (1 - s.d / Math.max(ww, 1e-3)))
        const tone = 0.62 + 0.3 * side + 0.08 * valueNoise(x * 20, y * 20, seed + 227)
        r = r * (1 - cov) + 0.66 * tone * cov
        g = g * (1 - cov) + 0.6 * tone * cov
        b = b * (1 - cov) + 0.52 * tone * cov
        a = Math.max(a, cov)
      }
      const lightR = SKY_RGB[0] * AMBIENT + SUN_RGB[0] * DIRECT * L.z
      const lightG = SKY_RGB[1] * AMBIENT + SUN_RGB[1] * DIRECT * L.z
      const lightB = SKY_RGB[2] * AMBIENT + SUN_RGB[2] * DIRECT * L.z
      out[o] = Math.min(255, r * lightR * 255)
      out[o + 1] = Math.min(255, g * lightG * 255)
      out[o + 2] = Math.min(255, b * lightB * 255)
      out[o + 3] = Math.round(a * 255)
    }
  }
}

/** 一棵金合欢的树冠贴图（每格 ppu 像素）：几层平顶的叶片摞成的伞，迎光的边暖亮，被上层挡着的暗下去透着紫，叶面细碎 */
export function paintCrown(a: Acacia, seed: number, ppu: number): { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number; x0: number; y0: number } {
  const plates = platesOf(a, seed)
  const R = a.crown * 1.3
  const x0 = a.x + a.ox - R
  const y0 = a.y + a.oy - R
  const n = Math.ceil(R * 2 * ppu)
  const data = new Uint8ClampedArray(n * n * 4)
  const col = [0, 0, 0]
  const lr = SKY_RGB[0] * AMBIENT + SUN_RGB[0] * DIRECT * L.z
  const lg = SKY_RGB[1] * AMBIENT + SUN_RGB[1] * DIRECT * L.z
  const lb = SKY_RGB[2] * AMBIENT + SUN_RGB[2] * DIRECT * L.z
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const x = x0 + (px + 0.5) / ppu
      const y = y0 + (py + 0.5) / ppu
      const cov = crownColor(plates, seed, x, y, col)
      if (cov <= 0) continue
      const o = (py * n + px) * 4
      data[o] = Math.min(255, col[0]! * lr * 255)
      data[o + 1] = Math.min(255, col[1]! * lg * 255)
      data[o + 2] = Math.min(255, col[2]! * lb * 255)
      data[o + 3] = Math.round(smooth(0, 0.5, cov) * 255)
    }
  }
  return { data, w: n, h: n, x0, y0 }
}
