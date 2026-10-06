import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { rimAt, segDist } from './layout'
import type { Disc, OutpostPlan, Panel } from './layout'
import type { OutpostConfig } from '../../types/maps'

/** 立着的东西按假想的斜俯视画：每高一米，顶在画面上往上挪这么多格 */
export const FACE_U_PER_M = 0.2
/** 高度与影子的格子：每格多少格地图 */
const HF_U = 0.125
/** 岩脊在台地边外每往外一格高多少米、最高多高（米） */
const RIDGE_RISE = 1.6
const RIDGE_MAX_M = 5.5
/** 影子最长追多远，格 */
const SHADOW_REACH_U = 8
/** 背光处还剩多少光（天光与行星的反光），影子的边软多宽（格） */
const AMBIENT = 0.5
const PENUMBRA_U = 0.09
/** 站心那块金属甲板的半径比空场小多少（格） */
const DECK_INSET_U = 0.6
/** 一格米数：一格就是一米 */
const M_PER_U = 1

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function mixInto(c: Rgb, r: number, g: number, b: number, t: number): void {
  if (t <= 0) return
  const k = t > 1 ? 1 : t
  c[0] += (r - c[0]) * k
  c[1] += (g - c[1]) * k
  c[2] += (b - c[2]) * k
}
function scale(c: Rgb, k: number): void {
  c[0] *= k
  c[1] *= k
  c[2] *= k
}

const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const
const LXY = Math.hypot(SUN.x, SUN.y)
/** 画面上朝着太阳的水平方向 */
const TO_SUN = { x: SUN.x / LXY, y: SUN.y / LXY } as const
/** 影子的光线每往太阳那边走一格升高多少米 */
const RISE = SUN.z / LXY / M_PER_U

/** 照在一个朝向为 n 的面上的光：迎光的满，背光的只剩环境光 */
function lambert(nx: number, ny: number, nz: number): number {
  return Math.max(0, nx * L.x + ny * L.y + nz * L.z) / L.z
}

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: OutpostConfig
  readonly plan: OutpostPlan
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

/** 地面贴图的大小：铺满方框 */
export function textureSize(): { w: number; h: number } {
  return { w: Math.round(FRAME_U * GROUND_PPU), h: Math.round(FRAME_U * GROUND_PPU) }
}

/** 按格子分的桶：每桶记着罩到它的东西的序号 */
interface Buckets {
  readonly n: number
  readonly lists: number[][]
}
const BUCKET_U = 2
const NONE: readonly number[] = []

function bucketsOf(items: readonly { x: number; y: number; r: number }[]): Buckets {
  const n = Math.ceil(FRAME_U / BUCKET_U)
  const lists: number[][] = Array.from({ length: n * n }, () => [])
  items.forEach((it, k) => {
    const c0 = Math.max(0, Math.floor((it.x - it.r) / BUCKET_U))
    const c1 = Math.min(n - 1, Math.floor((it.x + it.r) / BUCKET_U))
    const r0 = Math.max(0, Math.floor((it.y - it.r) / BUCKET_U))
    const r1 = Math.min(n - 1, Math.floor((it.y + it.r) / BUCKET_U))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) lists[r * n + c]!.push(k)
  })
  return { n, lists }
}
function near(b: Buckets, x: number, y: number): readonly number[] {
  const c = Math.floor(x / BUCKET_U)
  const r = Math.floor(y / BUCKET_U)
  if (c < 0 || r < 0 || c >= b.n || r >= b.n) return NONE
  return b.lists[r * b.n + c]!
}

/** 一段折线：车辙与小路，格 */
interface Track {
  readonly pts: readonly { x: number; y: number }[]
  readonly w: number
}

/**
 * 画之前一次算好的：各处离地多高（米）与照不照得到太阳的格子，岩脊的高，小路与车辙，按格子分桶的植物、晶簇、裂缝与小路；
 * 每个线程按同一个种子各算一遍，算出来一样
 */
export interface Prepared {
  readonly cols: number
  readonly height: Float32Array
  readonly lit: Float32Array
  readonly plants: Buckets
  readonly crystals: Buckets
  readonly rifts: Buckets
  readonly tracks: readonly Track[]
  readonly trackBk: Buckets
  readonly ringPoly: readonly { x: number; y: number }[]
}

/** 台地边外多远（格），台地里为负 */
function beyond(plan: OutpostPlan, x: number, y: number): number {
  const dx = x - plan.cx
  const dy = y - plan.cy
  return Math.hypot(dx, dy) - rimAt(plan, Math.atan2(dy, dx))
}

/** 岩脊在 (x, y) 处多高，米：从台地边往外一路抬起，顶上参差 */
function ridgeM(plan: OutpostPlan, x: number, y: number): number {
  const d = beyond(plan, x, y)
  if (d <= -0.05) return 0
  const jag = fbm(x * 0.55, y * 0.55, 31, 4)
  const crag = 1 - Math.abs(valueNoise(x * 1.4, y * 1.4, 37) * 2 - 1)
  const base = Math.min(RIDGE_MAX_M, Math.max(0, d + 0.05) * RIDGE_RISE * (0.7 + 0.6 * jag))
  return base * (0.75 + 0.25 * crag) + smooth(0, 1.2, d) * (jag - 0.5) * 1.4
}

/** 圆顶舱在 (x, y) 处的高（米）：半球按 h 拉成扁的 */
function domeM(d: Disc, h: number, x: number, y: number): number {
  const q = Math.hypot(x - d.x, y - d.y) / d.r
  return q >= 1 ? 0 : h * Math.sqrt(1 - q * q)
}

function inPanel(p: Panel, x: number, y: number, pad: number): { u: number; v: number } | null {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  const dx = x - p.x
  const dy = y - p.y
  const u = dx * c + dy * s
  const v = -dx * s + dy * c
  return Math.abs(u) <= p.len / 2 + pad && Math.abs(v) <= p.wid / 2 + pad ? { u, v } : null
}

/** 地上立着的东西在 (x, y) 处多高，米（不算岩脊） */
function gearM(sc: PaintScene, x: number, y: number): number {
  const { plan, cfg } = sc
  let h = 0
  for (const d of plan.domes) h = Math.max(h, domeM(d, cfg.gear.domeM, x, y))
  for (const t of plan.tubes) {
    const q = segDist(t.ax, t.ay, t.bx, t.by, x, y) / (t.w / 2)
    if (q < 1) h = Math.max(h, 2 * Math.sqrt(1 - q * q))
  }
  for (const p of plan.pylons) if (Math.hypot(x - p.x, y - p.y) < 0.12) h = Math.max(h, cfg.fence.pylonM)
  const m = plan.mast
  if (m && Math.hypot(x - m.x, y - m.y) < 0.14) h = Math.max(h, cfg.gear.mastM)
  for (const p of plan.panels) if (inPanel(p, x, y, 0)) h = Math.max(h, cfg.gear.panelM)
  for (const c of plan.crystals) {
    if (Math.hypot(x - c.x, y - c.y) > c.r + 0.3) continue
    const top = c.tall ? cfg.crystals.tallM : cfg.crystals.lowM
    for (const p of c.prisms) {
      const ex = c.x + p.dx + Math.cos(p.a) * p.len
      const ey = c.y + p.dy + Math.sin(p.a) * p.len
      const d = segDist(c.x + p.dx, c.y + p.dy, ex, ey, x, y)
      if (d < p.w) h = Math.max(h, top * (0.55 + 0.45 * (p.len / (c.r * 1.15))))
    }
  }
  for (const c of plan.consoles) if (Math.hypot(x - c.x, y - c.y) < c.r + 0.12) h = Math.max(h, 0.3)
  if (plan.pad && Math.hypot(x - plan.pad.x, y - plan.pad.y) < plan.pad.r) h = Math.max(h, 0.2)
  return h
}

export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const cols = Math.round(FRAME_U / HF_U)
  const height = new Float32Array(cols * cols)
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * HF_U
      const y = (j + 0.5) * HF_U
      height[j * cols + i] = Math.max(ridgeM(plan, x, y), gearM(sc, x, y))
    }
  }
  const lit = new Float32Array(cols * cols)
  const steps = Math.ceil(SHADOW_REACH_U / HF_U)
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const h0 = height[j * cols + i]!
      let shade = 0
      for (let k = 1; k <= steps; k++) {
        const ii = Math.round(i + TO_SUN.x * k)
        const jj = Math.round(j + TO_SUN.y * k)
        if (ii < 0 || jj < 0 || ii >= cols || jj >= cols) break
        const over = height[jj * cols + ii]! - h0 - k * HF_U * RISE
        if (over > 0) {
          shade = 1
          break
        }
      }
      lit[j * cols + i] = 1 - shade
    }
  }
  const rng = mulberry(plan.seed ^ 0x7ac5)
  const tracks: Track[] = []
  const hub = { x: plan.cx, y: plan.cy }
  const towards = (to: { x: number; y: number }, w: number, wobble: number): void => {
    const pts: { x: number; y: number }[] = []
    const n = 16
    const bend = (rng() - 0.5) * wobble
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const s = Math.sin(t * Math.PI) * bend
      const dx = to.x - hub.x
      const dy = to.y - hub.y
      const len = Math.hypot(dx, dy) || 1
      pts.push({ x: hub.x + dx * t - (dy / len) * s, y: hub.y + dy * t + (dx / len) * s })
    }
    tracks.push({ pts, w })
  }
  for (const c of plan.consoles) towards(c, 0.7, 1.4)
  if (plan.pad) towards(plan.pad, 1.1, 2)
  for (const d of plan.domes) towards(d, 0.8, 1.8)
  const trackItems = tracks.map((t) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of t.pts) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2 + t.w }
  })
  return {
    cols,
    height,
    lit,
    plants: bucketsOf(plan.plants.map((p) => ({ x: p.x, y: p.y, r: p.r + 0.4 }))),
    crystals: bucketsOf(plan.crystals.map((c) => ({ x: c.x, y: c.y, r: c.r + 0.5 }))),
    rifts: bucketsOf(plan.rifts.map((r) => ({ x: r.x, y: r.y, r: 2.6 }))),
    tracks,
    trackBk: bucketsOf(trackItems),
    ringPoly: plan.ring,
  }
}

/** 线程之间一样的小随机数 */
function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample(prep: Prepared, a: Float32Array, x: number, y: number): number {
  const u = x / HF_U - 0.5
  const v = y / HF_U - 0.5
  const n = prep.cols
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)))
  const j = Math.min(n - 2, Math.max(0, Math.floor(v)))
  const fx = clamp01(u - i)
  const fy = clamp01(v - j)
  const k = j * n + i
  const p = a[k]!
  const q = a[k + 1]!
  const s = a[k + n]!
  const t = a[k + n + 1]!
  return p + (q - p) * fx + (s - p) * fy + (p - q - s + t) * fx * fy
}

/** 照到多少太阳：影子图按半影的宽取几处平均 */
function sunAt(prep: Prepared, x: number, y: number): number {
  const p = PENUMBRA_U
  return (sample(prep, prep.lit, x, y) * 2 + sample(prep, prep.lit, x + p, y + p) + sample(prep, prep.lit, x - p, y - p) + sample(prep, prep.lit, x + p, y - p) + sample(prep, prep.lit, x - p, y + p)) / 6
}

/** 天空：看向方向 (dx, dy, dz)（z 朝上）的颜色。暮紫的天，背着太阳那边挂着一颗带环的气态巨行星，两颗小月亮 */
const GIANT = dirOf(Math.atan2(-SUN.y, -SUN.x) + 0.35, 52)
const MOON_A = dirOf(Math.atan2(-SUN.y, -SUN.x) - 0.9, 34)
const MOON_B = dirOf(Math.atan2(SUN.y, SUN.x) + 1.4, 61)
function dirOf(az: number, elevDeg: number): { x: number; y: number; z: number } {
  const e = (elevDeg * Math.PI) / 180
  return { x: Math.cos(az) * Math.cos(e), y: Math.sin(az) * Math.cos(e), z: Math.sin(e) }
}
export function skyColor(dx: number, dy: number, dz: number, out: Rgb): void {
  const up = clamp01(dz)
  out[0] = 70 + (38 - 70) * up
  out[1] = 62 + (40 - 62) * up
  out[2] = 104 + (86 - 104) * up
  const sunDot = dx * L.x + dy * L.y + dz * L.z
  const glow = Math.pow(clamp01(sunDot), 24)
  mixInto(out, 255, 228, 196, glow * 0.85)
  const g = dx * GIANT.x + dy * GIANT.y + dz * GIANT.z
  const ang = Math.acos(Math.min(1, g))
  const R = 0.36
  if (ang < R * 1.9) {
    const ux = -GIANT.y
    const uy = GIANT.x
    const lat = (dx * ux + dy * uy) / Math.max(1e-6, Math.sin(ang) || 1)
    const band = Math.sin(((dz - GIANT.z) / R) * 9 + lat * 2) * 0.5 + 0.5
    if (ang < R) {
      const rim = smooth(R, R * 0.6, ang)
      const t = band
      out[0] = (214 + (168 - 214) * t) * (0.55 + 0.45 * rim)
      out[1] = (176 + (118 - 176) * t) * (0.55 + 0.45 * rim)
      out[2] = (146 + (104 - 146) * t) * (0.55 + 0.45 * rim)
    }
    const ring = Math.abs(ang - R * 1.45)
    if (ring < R * 0.16 && (ang > R || lat > 0)) mixInto(out, 232, 214, 196, (1 - ring / (R * 0.16)) * 0.7)
  }
  for (const m of [MOON_A, MOON_B]) {
    const a = Math.acos(Math.min(1, dx * m.x + dy * m.y + dz * m.z))
    if (a < 0.07) mixInto(out, 236, 232, 240, smooth(0.07, 0.05, a))
  }
}

/**
 * 地面：异星的紫灰土，玄武岩板、赭色的浮尘与白色的盐壳一片片铺着，细碎的砾石；台地边外是参差的岩脊，按高度场打光。
 * 外圈围栏里的地面被压平、浅一些，站心铺一块金属甲板，小路与车辙从甲板通到各台控制台、着陆平台与圆顶舱；
 * 地表的裂缝里透出暗红的光；荒野里长着异星的植物、立着晶簇；院子里是圆顶舱（舱顶的玻璃映着天上的气态巨行星）、走廊、天线、太阳能板与着陆平台。
 * 围栏只画地上的导轨与立柱，光墙由画面每帧画。一切立着的东西按同一个太阳投下影子
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const { plan, cfg } = sc
  const ppu = GROUND_PPU
  const aa = 0.7 / ppu
  const w = rect.x1 - rect.x0
  const col: Rgb = [0, 0, 0]
  const tmp: Rgb = [0, 0, 0]
  const hubDeck = cfg.frame.hubU - DECK_INSET_U
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      regolith(plan, x, y, col)
      const out1 = beyond(plan, x, y)
      let raised = false
      if (out1 > -0.6) raised = ridge(prep, plan, x, y, out1, col)
      if (!raised) {
        compound(prep, x, y, col)
        const dc = Math.hypot(x - plan.cx, y - plan.cy)
        if (dc < hubDeck + aa * 2) deck(plan, x, y, dc, hubDeck, aa, col)
        tracksAt(prep, x, y, col)
        riftsAt(plan, prep, x, y, aa, col)
        rails(sc, x, y, aa, col)
        padAt(plan, x, y, aa, col)
        consolesAt(plan, x, y, aa, col)
        lichen(plan, prep, x, y, col)
        const sun = sunAt(prep, x, y)
        scale(col, AMBIENT + (1 - AMBIENT) * sun)
        tint(col, 1 - sun)
      }
      const glow = riftGlow(plan, prep, x, y)
      if (glow > 0) {
        col[0] += 255 * glow
        col[1] += 88 * glow
        col[2] += 52 * glow
      }
      raisedAt(sc, prep, x, y, aa, col, tmp)
      out[o] = col[0]
      out[o + 1] = col[1]
      out[o + 2] = col[2]
      out[o + 3] = 255
    }
  }
}

/** 背光处被头顶那颗行星的反光染得偏青 */
function tint(c: Rgb, shade: number): void {
  if (shade <= 0) return
  c[0] *= 1 - 0.1 * shade
  c[1] *= 1 + 0.02 * shade
  c[2] *= 1 + 0.12 * shade
}

/** 紫灰的异星土：玄武岩板、赭色浮尘、盐壳与细砾 */
function regolith(plan: OutpostPlan, x: number, y: number, c: Rgb): void {
  const big = fbm(x * 0.09, y * 0.09, 3, 4)
  const mid = fbm(x * 0.45, y * 0.45, 5, 3)
  c[0] = 128 + (big - 0.5) * 38 + (mid - 0.5) * 18
  c[1] = 115 + (big - 0.5) * 30 + (mid - 0.5) * 14
  c[2] = 136 + (big - 0.5) * 34 + (mid - 0.5) * 16
  const plate = cellNearest(x * 0.6, y * 0.6, 11 + (plan.seed & 7))
  const basalt = smooth(0.58, 0.66, fbm(x * 0.16 + 9, y * 0.16, 17, 3))
  if (basalt > 0) {
    const crack = smooth(0.0, 0.07, cellEdge(x * 0.6, y * 0.6, 11 + (plan.seed & 7)))
    const shade = 0.82 + plate.h * 0.22
    mixInto(c, 76 * shade, 68 * shade, 92 * shade, basalt * 0.85)
    mixInto(c, 46, 40, 56, basalt * (1 - crack) * 0.8)
  }
  const drift = smooth(0.55, 0.72, fbm(x * 0.22 + y * 0.05, y * 0.11 - x * 0.04, 23, 4))
  mixInto(c, 170, 128, 98, drift * 0.42)
  const salt = smooth(0.66, 0.74, fbm(x * 0.3, y * 0.3, 29, 3))
  if (salt > 0) mixInto(c, 214, 204, 212, salt * (0.55 + 0.45 * smooth(0.4, 0.7, valueNoise(x * 3.1, y * 3.1, 41))))
  const grit = valueNoise(x * 9.3, y * 9.3, 43)
  if (grit > 0.8) {
    const k = (grit - 0.8) / 0.2
    mixInto(c, 66, 58, 74, k * 0.55)
  } else if (grit < 0.07) mixInto(c, 196, 186, 196, (0.07 - grit) * 6)
  const pebble = cellNearest(x * 2.4, y * 2.4, 47)
  const pr = 0.12 + pebble.h * 0.16
  const pd = Math.hypot(pebble.dx, pebble.dy)
  if (pebble.h > 0.55 && pd < pr) {
    const lit = clamp01(0.5 - (pebble.dx * TO_SUN.x + pebble.dy * TO_SUN.y) / pr) * 0.5 + 0.6
    mixInto(c, 92 * lit, 82 * lit, 104 * lit, smooth(pr, pr * 0.7, pd) * 0.9)
  } else if (pebble.h > 0.55 && pd < pr * 1.6) {
    const sx = pebble.dx + TO_SUN.x * pr * 0.6
    const sy = pebble.dy + TO_SUN.y * pr * 0.6
    if (Math.hypot(sx, sy) < pr * 1.1) scale(c, 0.86)
  }
}

/** 岩脊：按高度场的坡打光，背着太阳的坡暗，峭壁上一道道竖纹，顶上零星的晶脉；返回这里是不是岩脊 */
function ridge(prep: Prepared, plan: OutpostPlan, x: number, y: number, d: number, c: Rgb): boolean {
  const h = ridgeM(plan, x, y)
  if (h <= 0.02 && d < 0) return false
  const e = HF_U
  const gx = (sample(prep, prep.height, x + e, y) - sample(prep, prep.height, x - e, y)) / (2 * e) + (fbm(x * 2.2, y * 2.2, 57, 2) - 0.5) * 1.2
  const gy = (sample(prep, prep.height, x, y + e) - sample(prep, prep.height, x, y - e)) / (2 * e) + (fbm(x * 2.2 + 5, y * 2.2, 57, 2) - 0.5) * 1.2
  const nl = Math.hypot(gx, gy, 1)
  const lam = lambert(-gx / nl, -gy / nl, 1 / nl)
  const strata = 0.85 + 0.15 * Math.sin((h * 3.2 + fbm(x * 0.8, y * 0.8, 53, 2) * 3) * Math.PI)
  const fall = 1 - 0.55 * smooth(0, 6, d)
  const base = fbm(x * 0.7, y * 0.7, 59, 3)
  const r = (84 + base * 26) * strata
  const g = (72 + base * 22) * strata
  const b = (100 + base * 26) * strata
  const sun = sunAt(prep, x, y)
  const light = (0.42 + 0.68 * lam * (0.35 + 0.65 * sun)) * fall
  const t = smooth(-0.05, 0.25, h)
  mixInto(c, r * light, g * light, b * light, t)
  tint(c, 1 - lam)
  const vein = smooth(0.03, 0, Math.abs(fbm(x * 0.35, y * 0.35, 61, 3) - 0.5)) * smooth(0.6, 2, d) * smooth(0.5, 0.75, valueNoise(x * 0.5, y * 0.5, 67))
  if (vein > 0) mixInto(c, 210, 196, 232, vein * 0.7)
  return t >= 0.999
}

/** 外圈围栏里被压平的地：颜色浅一点、砾石少，靠近外圈的地方过渡回荒野 */
function compound(prep: Prepared, x: number, y: number, c: Rgb): void {
  if (!inPoly(prep.ringPoly, x, y)) return
  const graded = 0.32 + 0.12 * fbm(x * 0.6, y * 0.6, 71, 2)
  const k = graded * edgeIn(prep.ringPoly, x, y)
  mixInto(c, 150, 138, 150, k)
}

/** 离多边形的边多远，在里面 1.2 格以内渐变 */
function edgeIn(poly: readonly { x: number; y: number }[], x: number, y: number): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    d = Math.min(d, segDist(a.x, a.y, b.x, b.y, x, y))
  }
  return smooth(0.2, 1.4, d)
}

function inPoly(poly: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 站心的金属甲板：一圈圈拼起来的钢板、铆钉与防滑纹，正中漆着前哨的标记，外沿一圈黄黑的警示边 */
function deck(plan: OutpostPlan, x: number, y: number, d: number, R: number, aa: number, c: Rgb): void {
  const k = 1 - smooth(R - aa, R + aa, d)
  if (k <= 0) return
  const a = Math.atan2(y - plan.cy, x - plan.cx)
  const ring = Math.floor(d / 1.15)
  const seg = Math.max(6, ring * 6)
  const fa = ((a / (Math.PI * 2)) * seg + ring * 0.37) % 1
  const seamR = Math.abs(d / 1.15 - Math.round(d / 1.15)) * 1.15
  const seamA = Math.min(fa < 0 ? fa + 1 : fa, 1 - (fa < 0 ? fa + 1 : fa)) * ((Math.PI * 2 * d) / seg)
  const plateTone = 0.9 + 0.1 * valueNoise(ring * 3.7 + Math.floor((a / (Math.PI * 2)) * seg), 1, 73)
  const t: Rgb = [150 * plateTone, 152 * plateTone, 162 * plateTone]
  const tread = Math.abs(Math.sin((x + y) * 18)) * Math.abs(Math.sin((x - y) * 18))
  scale(t, 0.95 + 0.05 * tread)
  const seam = Math.min(seamR, seamA)
  if (seam < 0.035) scale(t, 0.6 + 0.4 * (seam / 0.035))
  const bolt = Math.min(seamR, 0.2) < 0.07 && Math.abs(seamA - 0.12) < 0.05 ? 1 : 0
  if (bolt) mixInto(t, 205, 206, 214, 0.7)
  const edge = R - d
  if (edge < 0.32) {
    const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 72) % 2 === 0
    if (stripe) {
      t[0] = 232
      t[1] = 186
      t[2] = 64
    } else {
      t[0] = 46
      t[1] = 44
      t[2] = 52
    }
    if (edge < 0.05) scale(t, 0.7)
  }
  if (d < 1.25) {
    const ringLine = Math.abs(d - 1.05)
    if (ringLine < 0.06) mixInto(t, 232, 228, 236, 0.85)
    const bar = Math.abs(y - plan.cy) < 0.07 && Math.abs(x - plan.cx) < 0.75
    const dot = d < 0.38
    if (bar || dot) mixInto(t, 232, 228, 236, 0.85)
  }
  const grime = fbm(x * 1.4, y * 1.4, 79, 3)
  scale(t, 0.86 + 0.18 * grime)
  mixInto(c, t[0], t[1], t[2], k)
}

/** 小路与车辙：踩实的浅色土路，路上两道带花纹的轮胎印 */
function tracksAt(prep: Prepared, x: number, y: number, c: Rgb): void {
  for (const k of near(prep.trackBk, x, y)) {
    const t = prep.tracks[k]!
    let best = Infinity
    let side = 0
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1]!
      const b = t.pts[i]!
      const d = segDist(a.x, a.y, b.x, b.y, x, y)
      if (d < best) {
        best = d
        side = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0 ? 1 : -1
      }
    }
    if (best > t.w) continue
    const path = smooth(t.w, t.w * 0.45, best) * (0.55 + 0.25 * fbm(x * 1.2, y * 1.2, 83, 2))
    mixInto(c, 162, 150, 158, path * 0.55)
    const lane = Math.abs(best - t.w * 0.32)
    if (lane < 0.07 && side !== 0) {
      const tread = Math.sin((x * 0.7 + y * 0.7) * 40) > 0.2 ? 0.8 : 0.9
      scale(c, tread)
    }
  }
}

/** 地表的裂缝：参差的暗缝，缝口一圈翻起的碎土，缝底透出暗红的光 */
function riftsAt(plan: OutpostPlan, prep: Prepared, x: number, y: number, aa: number, c: Rgb): void {
  for (const k of near(prep.rifts, x, y)) {
    const r = plan.rifts[k]!
    const { d, t } = polyDist(r.pts, x, y)
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6
    const wid = r.w * taper * (0.75 + 0.5 * valueNoise(x * 4, y * 4, 89))
    if (d > wid + 0.5) continue
    const lip = smooth(wid + 0.45, wid, d)
    mixInto(c, 92, 78, 96, lip * 0.5)
    const inside = smooth(wid + aa, wid - aa, d)
    if (inside > 0) {
      const depth = 1 - d / Math.max(1e-3, wid)
      const r0 = 46 + 120 * depth * depth
      mixInto(c, r0, 22 + 20 * depth, 30, inside)
    }
  }
}

/** 裂缝透出来的光照在旁边的地上 */
function riftGlow(plan: OutpostPlan, prep: Prepared, x: number, y: number): number {
  let g = 0
  for (const k of near(prep.rifts, x, y)) {
    const r = plan.rifts[k]!
    const { d } = polyDist(r.pts, x, y)
    g += 0.12 * Math.exp(-d / 0.35)
  }
  return g
}

function polyDist(pts: readonly { x: number; y: number }[], x: number, y: number): { d: number; t: number } {
  let best = Infinity
  let at = 0
  let acc = 0
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const u = l2 > 0 ? clamp01(((x - a.x) * dx + (y - a.y) * dy) / l2) : 0
    const d = Math.hypot(x - a.x - dx * u, y - a.y - dy * u)
    const len = Math.sqrt(l2)
    if (d < best) {
      best = d
      at = (acc + u * len) / (total || 1)
    }
    acc += len
  }
  return { d: best, t: at }
}

/** 围栏地上的导轨：两根立柱之间一道嵌在地里的暗色金属槽，每隔一段一颗螺栓 */
function rails(sc: PaintScene, x: number, y: number, aa: number, c: Rgb): void {
  for (const s of sc.plan.segments) {
    const d = segDist(s.ax, s.ay, s.bx, s.by, x, y)
    if (d > 0.3) continue
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay)
    const u = ((x - s.ax) * (s.bx - s.ax) + (y - s.ay) * (s.by - s.ay)) / (len || 1)
    const groove = 1 - smooth(0.07 - aa, 0.07 + aa, d)
    const bed = 1 - smooth(0.17 - aa, 0.17 + aa, d)
    mixInto(c, 112, 108, 120, bed * 0.75)
    mixInto(c, 40, 38, 48, groove)
    const bolt = Math.abs(((u % 0.5) + 0.5) % 0.5 - 0.25)
    if (bed > 0 && groove < 0.5 && bolt < 0.05 && d > 0.09) mixInto(c, 184, 184, 196, 0.8)
  }
}

/** 着陆平台：一块圆形的耐热板，外圈一道道六边形的防滑块，中心被尾焰烧黑，漆着橙白的着陆标记 */
function padAt(plan: OutpostPlan, x: number, y: number, aa: number, c: Rgb): void {
  const p = plan.pad
  if (!p) return
  const d = Math.hypot(x - p.x, y - p.y)
  if (d > p.r + 0.15) return
  const k = 1 - smooth(p.r - aa, p.r + aa, d)
  const t: Rgb = [112, 110, 120]
  const hex = cellEdge(x * 2.2, y * 2.2, 97)
  if (d > p.r * 0.72) scale(t, hex < 0.06 ? 0.72 : 0.96)
  else scale(t, 0.92 + 0.08 * fbm(x * 3, y * 3, 101, 2))
  const scorch = Math.exp(-((d / (p.r * 0.45)) ** 2)) * (0.6 + 0.4 * fbm(x * 1.5, y * 1.5, 103, 3))
  scale(t, 1 - 0.55 * scorch)
  const a = Math.atan2(y - p.y, x - p.x)
  const band = Math.abs(d - p.r * 0.62)
  if (band < 0.07) mixInto(t, 236, 232, 226, 0.9)
  const chev = Math.abs(d - p.r * 0.86) < 0.09 && Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0
  if (chev) mixInto(t, 240, 132, 58, 0.9)
  const lx = Math.abs(x - p.x)
  const ly = Math.abs(y - p.y)
  const arm = (lx < 0.09 && ly < p.r * 0.36) || (ly < 0.09 && lx < p.r * 0.2 && false)
  const bar = Math.abs(lx - p.r * 0.2) < 0.09 && ly < p.r * 0.36
  const mid = ly < 0.08 && lx < p.r * 0.2
  if (arm || bar || mid) mixInto(t, 236, 232, 226, 0.85)
  const rim = Math.abs(d - p.r) < 0.06 ? 0.65 : 1
  scale(t, rim)
  for (let i = 0; i < 8; i++) {
    const la = (i / 8) * Math.PI * 2 + 0.2
    const lxp = p.x + Math.cos(la) * (p.r - 0.18)
    const lyp = p.y + Math.sin(la) * (p.r - 0.18)
    const ld = Math.hypot(x - lxp, y - lyp)
    if (ld < 0.09) mixInto(t, 52, 50, 58, 1)
  }
  mixInto(c, t[0], t[1], t[2], k)
}

/** 控制台的底座：一圈深色金属的台基，中间嵌着一块圆形的感应台面（台面的颜色与灯由画面画） */
function consolesAt(plan: OutpostPlan, x: number, y: number, aa: number, c: Rgb): void {
  for (const k of plan.consoles) {
    const d = Math.hypot(x - k.x, y - k.y)
    const R = k.r + 0.18
    if (d > R + 0.1) continue
    const base = 1 - smooth(R - aa, R + aa, d)
    mixInto(c, 62, 62, 74, base)
    const bevel = clamp01(1 - Math.abs(d - (R - 0.08)) / 0.06)
    const a = Math.atan2(y - k.y, x - k.x)
    const facing = Math.cos(a) * TO_SUN.x + Math.sin(a) * TO_SUN.y
    mixInto(c, 150, 150, 164, bevel * (0.3 + 0.4 * facing))
    const plate = 1 - smooth(k.r - aa, k.r + aa, d)
    mixInto(c, 36, 36, 46, plate)
    if (plate > 0) {
      const grid = Math.abs(Math.sin(x * 24)) < 0.12 || Math.abs(Math.sin(y * 24)) < 0.12
      if (grid) mixInto(c, 58, 58, 72, plate * 0.8)
    }
  }
}

/** 地衣：贴着地长的一片片橄榄金的地衣，边缘像花边 */
function lichen(plan: OutpostPlan, prep: Prepared, x: number, y: number, c: Rgb): void {
  for (const k of near(prep.plants, x, y)) {
    const p = plan.plants[k]!
    if (p.kind !== 2) continue
    const d = Math.hypot(x - p.x, y - p.y)
    const R = p.r * 1.6 * (0.75 + 0.5 * fbm(x * 2, y * 2, p.seed & 1023, 3))
    if (d > R) continue
    const lace = smooth(0.45, 0.6, fbm(x * 7, y * 7, (p.seed >> 10) & 1023, 2))
    mixInto(c, 150 + 30 * lace, 140 + 24 * lace, 70, smooth(R, R * 0.6, d) * (0.5 + 0.4 * lace))
  }
}

/**
 * 立着的东西：圆顶舱、走廊、太阳能板、天线座、立柱、晶簇与植物，按斜俯视把顶往上挪；
 * 每样东西按自己的形状求法线打光，舱顶的玻璃映着天上
 */
function raisedAt(sc: PaintScene, prep: Prepared, x: number, y: number, aa: number, c: Rgb, tmp: Rgb): void {
  const { plan, cfg } = sc
  for (const k of near(prep.plants, x, y)) {
    const p = plan.plants[k]!
    if (p.kind !== 2) plant(p, x, y, c)
  }
  for (const k of near(prep.crystals, x, y)) crystal(plan.crystals[k]!, cfg, x, y, c)
  for (const p of plan.panels) panel(p, cfg.gear.panelM, x, y, aa, c, tmp)
  for (const t of plan.tubes) tube(t, x, y, aa, c)
  for (const d of plan.domes) dome(d, cfg.gear.domeM, x, y, aa, c, tmp)
  const m = plan.mast
  if (m) mastBase(m, cfg.gear.mastM, x, y, aa, c)
  for (const p of plan.pylons) pylon(p.x, p.y, cfg, x, y, aa, c)
}

/** 异星植物：0 是肉质的莲座，酒红的叶子尖上发粉；1 是一丛细茎，顶着橙色的球苞 */
function plant(p: { x: number; y: number; r: number; kind: number; seed: number }, x: number, y: number, c: Rgb): void {
  const dx = x - p.x
  const dy = y - p.y
  const d = Math.hypot(dx, dy)
  if (d > p.r * 1.4) return
  if (p.kind === 0) {
    const sh = Math.hypot(dx - (-TO_SUN.x) * p.r * 0.35, dy - (-TO_SUN.y) * p.r * 0.35)
    if (sh < p.r * 0.95 && d > p.r * 0.9) scale(c, 0.8)
    const a = Math.atan2(dy, dx)
    const n = 7 + (p.seed % 4)
    const leaf = Math.abs(Math.sin(((a + (p.seed % 100) * 0.06) * n) / 2))
    const reach = p.r * (0.55 + 0.45 * leaf)
    if (d > reach) return
    const q = d / reach
    const vein = Math.pow(1 - leaf, 8)
    const lit = 0.75 + 0.35 * ((dx * TO_SUN.x + dy * TO_SUN.y) / (d + 1e-3)) * q
    const r0 = (108 + 120 * q * q) * lit
    const g0 = (34 + 90 * q * q) * lit
    const b0 = (62 + 100 * q * q) * lit
    mixInto(c, r0, g0, b0, 0.95)
    if (vein > 0.3) scale(c, 0.85)
    if (d < p.r * 0.18) mixInto(c, 60, 20, 38, 0.9)
    return
  }
  const sh = Math.hypot(dx + TO_SUN.x * p.r * 0.6, dy + TO_SUN.y * p.r * 0.6)
  if (sh < p.r * 0.9) scale(c, 0.82)
  const n = 4 + (p.seed % 4)
  for (let i = 0; i < n; i++) {
    const a = ((p.seed >> (i % 16)) % 628) / 100 + i * 2.4
    const rr = p.r * (0.25 + 0.6 * (((p.seed >> (i * 3)) & 15) / 15))
    const bx = p.x + Math.cos(a) * rr
    const by = p.y + Math.sin(a) * rr
    const stem = segDist(p.x, p.y, bx, by, x, y)
    if (stem < 0.025) mixInto(c, 76, 52, 46, 0.9)
    const bd = Math.hypot(x - bx, y - by)
    const br = p.r * 0.22
    if (bd < br) {
      const lit = 0.65 + 0.5 * clamp01(0.5 + ((x - bx) * TO_SUN.x + (y - by) * TO_SUN.y) / br)
      mixInto(c, 248 * lit, 162 * lit, 72 * lit, smooth(br, br * 0.7, bd))
      const spec = Math.hypot(x - bx - TO_SUN.x * br * 0.4, y - by - TO_SUN.y * br * 0.4)
      if (spec < br * 0.25) mixInto(c, 255, 236, 200, 0.7)
    }
  }
}

/** 晶簇：一根根乳白泛紫的六棱晶柱斜着戳出地面，迎光的晶面亮、背光的偏紫，棱上一线高光；底下压着一圈碎晶 */
function crystal(cr: { x: number; y: number; r: number; tall: boolean; prisms: readonly { dx: number; dy: number; a: number; len: number; w: number }[] }, cfg: OutpostConfig, x: number, y: number, c: Rgb): void {
  const dx0 = x - cr.x
  const dy0 = y - cr.y
  if (Math.hypot(dx0, dy0) > cr.r + 0.25) return
  const top = cr.tall ? cfg.crystals.tallM : cfg.crystals.lowM
  const foot = Math.hypot(dx0, dy0) / (cr.r + 0.2)
  if (foot < 1) mixInto(c, 118, 106, 134, (1 - foot) * 0.45)
  for (const p of cr.prisms) {
    const bx = cr.x + p.dx
    const by = cr.y + p.dy - 0.02
    const lift = top * (0.55 + 0.45 * (p.len / (cr.r * 1.15))) * FACE_U_PER_M
    const ex = bx + Math.cos(p.a) * p.len
    const ey = by + Math.sin(p.a) * p.len - lift
    const ax = ex - bx
    const ay = ey - by
    const l2 = ax * ax + ay * ay
    const u = clamp01(((x - bx) * ax + (y - by) * ay) / (l2 || 1))
    const qx = bx + ax * u
    const qy = by + ay * u
    const wid = p.w * (u > 0.82 ? (1 - u) / 0.18 : 1)
    const ox = x - qx
    const oy = y - qy
    const len = Math.sqrt(l2) || 1
    const side = (ox * -ay + oy * ax) / len
    if (Math.abs(side) > wid) continue
    const f = side / Math.max(1e-3, wid)
    const nx = (-ay / len) * f
    const ny = (ax / len) * f
    const nz = Math.sqrt(Math.max(0, 1 - f * f)) * 0.8 + 0.2
    const lam = lambert(nx, ny, nz)
    const facet = f > 0.15 ? 0.82 : f < -0.15 ? 1.08 : 1
    const bright = (0.55 + 0.6 * lam) * facet * (0.85 + 0.15 * u)
    c[0] = 214 * bright
    c[1] = 200 * bright
    c[2] = 236 * bright
    if (Math.abs(Math.abs(f) - 0.15) < 0.06) mixInto(c, 255, 250, 255, 0.55)
    if (u > 0.82) mixInto(c, 250, 244, 255, 0.35)
  }
}

/** 太阳能板：深蓝的电池片排成格子，银色的框，板面朝太阳翘起，映着天光；底下一道影子 */
function panel(p: Panel, h: number, x: number, y: number, aa: number, c: Rgb, sky: Rgb): void {
  const lift = h * FACE_U_PER_M
  const q = inPanel(p, x, y + lift, 0.02)
  if (!q) return
  const hu = p.len / 2
  const hv = p.wid / 2
  const edge = Math.min(hu - Math.abs(q.u), hv - Math.abs(q.v))
  const inside = smooth(-aa, aa, edge)
  if (inside <= 0) return
  const t = clamp01((q.v + hv) / p.wid)
  const nx = TO_SUN.x * 0.5
  const ny = TO_SUN.y * 0.5
  const nl = Math.hypot(nx, ny, 1)
  skyColor((2 * nx) / nl, (2 * ny) / nl, 2 / nl - 1 + 0.6, sky)
  const cellU = ((q.u + hu) / p.len) * 6
  const cellV = t * 2
  const grid = Math.min(Math.abs(cellU - Math.round(cellU)) * (p.len / 6), Math.abs(cellV - Math.round(cellV)) * (p.wid / 2))
  const tone: Rgb = [30, 40, 76]
  mixInto(tone, sky[0], sky[1], sky[2], 0.3 + 0.25 * t)
  if (grid < 0.025) mixInto(tone, 110, 122, 156, 0.85)
  const frame = edge < 0.05
  if (frame) {
    tone[0] = 196
    tone[1] = 198
    tone[2] = 206
  }
  const glint = Math.exp(-(((q.u / p.len - 0.15) * 3) ** 2)) * 0.25
  mixInto(tone, 255, 246, 236, glint)
  mixInto(c, tone[0], tone[1], tone[2], inside)
}

/** 连着两座圆顶舱的走廊：半圆的筒身，一道道加强肋 */
function tube(t: { ax: number; ay: number; bx: number; by: number; w: number }, x: number, y: number, aa: number, c: Rgb): void {
  const H = 2
  let yy = y
  let q = 0
  let u = 0
  for (let k = 0; k < 3; k++) {
    const dx = t.bx - t.ax
    const dy = t.by - t.ay
    const l2 = dx * dx + dy * dy
    u = clamp01(((x - t.ax) * dx + (yy - t.ay) * dy) / l2)
    const d = Math.hypot(x - t.ax - dx * u, yy - t.ay - dy * u)
    q = d / (t.w / 2)
    const z = q < 1 ? H * Math.sqrt(1 - q * q) : 0
    yy = y + z * FACE_U_PER_M
  }
  if (q >= 1 + aa) return
  const dx = t.bx - t.ax
  const dy = t.by - t.ay
  const len = Math.hypot(dx, dy)
  const sx = (x - t.ax - dx * u) / (t.w / 2)
  const sy = (yy - t.ay - dy * u) / (t.w / 2)
  const nz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy))
  const lam = lambert(sx, sy, nz * 1.2)
  const rib = Math.abs(((u * len) % 0.5) - 0.25) < 0.03 ? 0.82 : 1
  const v = (0.5 + 0.6 * lam) * rib
  mixInto(c, 206 * v, 202 * v, 198 * v, smooth(1 + aa, 1 - aa, q))
}

/**
 * 圆顶舱：白色陶瓷板拼的半球，板缝按经纬划开，舱顶一块圆形的玻璃天窗映着天上的气态巨行星与月亮；
 * 底边一圈深色的基座，朝站心那边开着一扇橙色的气闸门
 */
function dome(d: Disc, H: number, x: number, y: number, aa: number, c: Rgb, sky: Rgb): void {
  if (Math.abs(x - d.x) > d.r + 0.1 || y < d.y - d.r - H * FACE_U_PER_M - 0.1 || y > d.y + d.r + 0.1) return
  let yy = y
  let z = 0
  for (let k = 0; k < 4; k++) {
    const q = Math.hypot(x - d.x, yy - d.y) / d.r
    z = q < 1 ? H * Math.sqrt(1 - q * q) : 0
    yy = y + z * FACE_U_PER_M
  }
  const ox = (x - d.x) / d.r
  const oy = (yy - d.y) / d.r
  const q = Math.hypot(ox, oy)
  if (q >= 1 + aa / d.r) return
  const k = smooth(1 + aa / d.r, 1 - aa / d.r, q)
  const nz0 = Math.sqrt(Math.max(0, 1 - q * q))
  const nx = ox
  const ny = oy
  const nz = nz0 * (d.r / H) * 1.1
  const nl = Math.hypot(nx, ny, nz) || 1
  const lam = lambert(nx / nl, ny / nl, nz / nl)
  const lat = Math.acos(Math.min(1, nz0))
  const lon = Math.atan2(oy, ox)
  const seamLat = Math.abs(((lat / (Math.PI / 2)) * 4) % 1 - 0.5) > 0.47
  const seamLon = Math.abs(((lon / (Math.PI * 2)) * 16 + 16) % 1 - 0.5) > 0.47 && q > 0.35
  let v = 0.42 + 0.68 * lam
  const t: Rgb = [228 * v, 224 * v, 216 * v]
  if (seamLat || seamLon) scale(t, 0.8)
  if (q > 0.93) scale(t, 0.62)
  if (q < 0.36) {
    const rx = (2 * nz / nl) * (nx / nl)
    const ry = (2 * nz / nl) * (ny / nl)
    const rz = 2 * (nz / nl) * (nz / nl) - 1
    skyColor(rx * 2.2, ry * 2.2, Math.max(0.05, rz), sky)
    t[0] = sky[0] * 0.8
    t[1] = sky[1] * 0.8
    t[2] = sky[2] * 0.85
    const spec = Math.pow(Math.max(0, rx * L.x + ry * L.y + rz * L.z), 60)
    mixInto(t, 255, 250, 240, spec)
    const frame = Math.abs(q - 0.36) < 0.025 || (Math.abs(Math.sin(lon * 3)) < 0.05 && q < 0.36)
    if (frame) {
      v = 0.5 + 0.5 * lam
      t[0] = 120 * v
      t[1] = 122 * v
      t[2] = 134 * v
    }
  }
  const door = Math.atan2(d.y - FRAME_U / 2, d.x - FRAME_U / 2) + Math.PI
  const dd = Math.abs(Math.atan2(Math.sin(lon - door), Math.cos(lon - door)))
  if (dd < 0.22 && q > 0.72 && q < 0.95) {
    t[0] = 236 * (0.55 + 0.5 * lam)
    t[1] = 128 * (0.55 + 0.5 * lam)
    t[2] = 60 * (0.55 + 0.5 * lam)
    if (Math.abs(q - 0.84) < 0.02) scale(t, 0.7)
  }
  mixInto(c, t[0], t[1], t[2], k)
}

/** 天线的底座：方形的地脚板与螺栓，往上一截格构塔（塔身更高处与转着的碟由画面画） */
function mastBase(m: Disc, H: number, x: number, y: number, aa: number, c: Rgb): void {
  const s = 0.42
  if (Math.abs(x - m.x) < s && Math.abs(y - m.y) < s) {
    const edge = Math.min(s - Math.abs(x - m.x), s - Math.abs(y - m.y))
    mixInto(c, 96, 98, 108, smooth(0, aa * 2, edge))
    const bolt = Math.hypot(Math.abs(x - m.x) - s * 0.7, Math.abs(y - m.y) - s * 0.7)
    if (bolt < 0.05) mixInto(c, 190, 190, 200, 0.9)
  }
  const top = H * FACE_U_PER_M
  const u = (m.y - y) / top
  if (u < 0 || u > 1) return
  const half = 0.16 * (1 - u * 0.55)
  const dx = x - m.x
  if (Math.abs(dx) > half) return
  const lattice = Math.abs(((u * 14) % 1) - 0.5) < 0.1 || Math.abs(Math.abs(dx) - half) < 0.03 || Math.abs(((dx / half + u * 14) % 1 + 1) % 1 - 0.5) < 0.08
  if (!lattice) return
  const lit = dx < 0 ? 1 : 0.7
  mixInto(c, 176 * lit, 178 * lit, 188 * lit, 0.95)
}

/** 围栏的立柱：地上一圈底座，立着一根深灰的金属柱，柱头一圈发射器（光由画面画） */
function pylon(px: number, py: number, cfg: OutpostConfig, x: number, y: number, aa: number, c: Rgb): void {
  const top = cfg.fence.pylonM * FACE_U_PER_M
  if (Math.abs(x - px) > 0.34 || y < py - top - 0.2 || y > py + 0.34) return
  const db = Math.hypot(x - px, y - py)
  if (db < 0.3) {
    mixInto(c, 72, 72, 84, smooth(0.3, 0.27, db))
    const ring = Math.abs(db - 0.24)
    if (ring < 0.025) mixInto(c, 150, 150, 164, 0.7)
  }
  const half = 0.11
  const dx = x - px
  const u = (py - y) / top
  if (u >= -0.02 && u <= 1 && Math.abs(dx) < half + aa) {
    const f = dx / half
    const lam = lambert(f, 0.4, Math.sqrt(Math.max(0, 1 - f * f)))
    const v = 0.45 + 0.6 * lam
    const band = Math.abs(u - 0.3) < 0.03 || Math.abs(u - 0.62) < 0.03 ? 0.75 : 1
    mixInto(c, 128 * v * band, 130 * v * band, 144 * v * band, smooth(half + aa, half - aa, Math.abs(dx)))
  }
  const cap = Math.hypot(x - px, (y - (py - top)) * 1.4)
  if (cap < 0.17) {
    const v = 0.4 + 0.5 * clamp01(0.5 - ((x - px) * TO_SUN.x + (y - py + top) * TO_SUN.y) / 0.17)
    mixInto(c, 70 * v, 72 * v, 86 * v, smooth(0.17, 0.15, cap))
    if (cap < 0.08) mixInto(c, 34, 34, 44, 0.9)
  }
}
