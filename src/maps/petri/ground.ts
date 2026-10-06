import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { Rng } from '../../util/rng'
import { markerText } from './marker'
import type { InkSeg } from './marker'
import type { PetriPlan } from './model'
import type { PetriConfig } from '../../types/maps'

/** 灯箱上计数网格的格距，毫米；网格线宽，格 */
const GRID_MM = 10
const GRID_LINE_U = 0.06
/** 笔画按这么大（格）的格子分桶，画一个像素只看附近一桶 */
const BUCKET_U = 2
/** 记号笔的笔画宽，格 */
const PEN_U = 0.12
/** 区号与标签的字高（格），区号写在几倍半径处，分区线从皿心往外画到几倍半径 */
const QUAD_TEXT_U = 1.3
const LABEL_TEXT_U = 0.9
const QUAD_AT = 0.88
const CROSS_TO = 0.95
/** 皿底的标签：营养琼脂平板，37 度培养 */
const LABEL = 'NA 37°C'
/** 弯月面：琼脂沿皿壁往上爬的那一圈按这么宽（格）衰减，贴壁处厚出几倍；像透镜把底下的网格往外推多少 */
const MENISCUS_U = 0.4
const MENISCUS_RISE = 0.9
const MENISCUS_LENS = 0.06
/** 营养琼脂每单位厚度透过多少光（红、绿、蓝）：灯箱的光透过它就是看到的颜色；另加琼脂表面漫反射回来的室内光 */
const AGAR_T = [0.91, 0.827, 0.616] as const
const AGAR_BACK = [12, 9, 4] as const
/** 透过钠钙玻璃看灯箱的颜色倍率：玻璃边带一点青 */
const GLASS_TINT = [0.8, 0.88, 0.88] as const
/** 灯箱：中心的颜色，到方框四角暗下去多少；网格线的颜色 */
const LIGHTBOX = [244, 248, 250] as const
const LIGHTBOX_FALL = 0.2
const GRID_INK = [118, 136, 148] as const

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 朝着灯的单位向量，正上方看下来时镜面反光的半程向量 */
const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const
const HL = Math.hypot(L.x, L.y, L.z + 1)
const H = { x: L.x / HL, y: L.y / HL, z: (L.z + 1) / HL } as const
const L_FLAT = Math.hypot(L.x, L.y)

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: PetriConfig
  readonly plan: PetriPlan
}

/** 地图上以格计的一块：左上角与宽高 */
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

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

/** 装得下一块像素的缓冲：按 rect 逐行排 */
export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面铺满方框：皿外是灯箱 */
export const GROUND_AREA: Area = { x0: 0, y0: 0, w: FRAME_U, h: FRAME_U }

/** 地面贴图的大小，像素 */
export function textureSize(): { w: number; h: number } {
  return { w: Math.round(GROUND_AREA.w * GROUND_PPU), h: Math.round(GROUND_AREA.h * GROUND_PPU) }
}

/** 按格子分的桶：每桶记着罩到它的笔画 */
interface Buckets {
  readonly cols: number
  readonly rows: number
  readonly lists: number[][]
}

const NONE: readonly number[] = []

function buckets(): Buckets {
  const cols = Math.ceil(GROUND_AREA.w / BUCKET_U)
  const rows = Math.ceil(GROUND_AREA.h / BUCKET_U)
  return { cols, rows, lists: Array.from({ length: cols * rows }, () => []) }
}

function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  const c0 = Math.max(0, Math.floor((x0 - GROUND_AREA.x0) / BUCKET_U))
  const c1 = Math.min(bk.cols - 1, Math.floor((x1 - GROUND_AREA.x0) / BUCKET_U))
  const r0 = Math.max(0, Math.floor((y0 - GROUND_AREA.y0) / BUCKET_U))
  const r1 = Math.min(bk.rows - 1, Math.floor((y1 - GROUND_AREA.y0) / BUCKET_U))
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bk.lists[r * bk.cols + c]!.push(k)
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  const c = Math.floor((x - GROUND_AREA.x0) / BUCKET_U)
  const r = Math.floor((y - GROUND_AREA.y0) / BUCKET_U)
  if (c < 0 || r < 0 || c >= bk.cols || r >= bk.rows) return NONE
  return bk.lists[r * bk.cols + c]!
}

function segDist(s: InkSeg, x: number, y: number): number {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((x - s.ax) * dx + (y - s.ay) * dy) / l2) : 0
  return Math.hypot(x - s.ax - dx * t, y - s.ay - dy * t)
}

/** 画之前一次算好的：皿底记号笔的笔画与它们的分桶，灯箱网格的格距（格） */
export interface Prepared {
  readonly ink: readonly InkSeg[]
  readonly inkBk: Buckets
  readonly pitch: number
}

/**
 * 皿底的记号笔：两条分区线（手画的，中间微微弯），四个区号，离屏幕下方最近的一区里写着标签；
 * 每个线程按同一个种子各算一遍，算出来一样
 */
export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const rng = new Rng(Math.floor(plan.grid.x * 0x7fffffff) ^ 0x51ed)
  const wobble = (): { dx: number; dy: number; turn: number } => ({ dx: (rng.next() - 0.5) * 0.5, dy: (rng.next() - 0.5) * 0.7, turn: (rng.next() - 0.5) * 0.16 })
  const ink: InkSeg[] = []
  const q0 = plan.quadrants[0]!
  for (const a of [q0.a0, q0.a0 + Math.PI / 2]) {
    const ang = a + (rng.next() - 0.5) * 0.03
    const bow = (rng.next() - 0.5) * 0.25
    const n = 16
    let prev: { x: number; y: number } | null = null
    for (let i = 0; i <= n; i++) {
      const t = -CROSS_TO + (2 * CROSS_TO * i) / n
      const along = t * plan.radius
      const side = bow * (1 - t * t)
      const p = { x: plan.cx + Math.cos(ang) * along - Math.sin(ang) * side, y: plan.cy + Math.sin(ang) * along + Math.cos(ang) * side }
      if (prev) ink.push({ ax: prev.x, ay: prev.y, bx: p.x, by: p.y })
      prev = p
    }
  }
  for (const q of plan.quadrants) {
    const a = (q.a0 + q.a1) / 2
    ink.push(...markerText(String(q.label), plan.cx + Math.cos(a) * plan.radius * QUAD_AT, plan.cy + Math.sin(a) * plan.radius * QUAD_AT, QUAD_TEXT_U, (rng.next() - 0.5) * 0.2, wobble))
  }
  ink.push(...markerText(LABEL, plan.label.x, plan.label.y, LABEL_TEXT_U, (rng.next() - 0.5) * 0.12, wobble))
  const inkBk = buckets()
  ink.forEach((s, k) => file(inkBk, k, Math.min(s.ax, s.bx) - PEN_U, Math.min(s.ay, s.by) - PEN_U, Math.max(s.ax, s.bx) + PEN_U, Math.max(s.ay, s.by) + PEN_U))
  return { ink, inkBk, pitch: GRID_MM / sc.cfg.mmPerU }
}

/** 离计数网格最近的线多近：落在线上为 1，离开半个线宽就是 0 */
function gridLine(x: number, y: number, pitch: number, aa: number): number {
  const fx = ((x % pitch) + pitch) % pitch
  const fy = ((y % pitch) + pitch) % pitch
  const d = Math.min(fx, pitch - fx, fy, pitch - fy)
  return 1 - smooth(GRID_LINE_U / 2 - aa, GRID_LINE_U / 2 + aa, d)
}

/** 灯箱面：中间亮、往方框四角暗一点，计数网格的线，零星几粒灰 */
function lightbox(x: number, y: number, lit: number, gx: number, gy: number, pitch: number, aa: number, out: Rgb): void {
  const line = gridLine(x - gx, y - gy, pitch, aa) * 0.6
  const speck = valueNoise(x * 7.3, y * 7.3, 911)
  const dust = speck > 0.985 ? ((speck - 0.985) / 0.015) * 0.35 : 0
  for (let c = 0; c < 3; c++) {
    const base = LIGHTBOX[c]! * lit
    out[c] = (base + (GRID_INK[c]! - base) * line) * (1 - dust)
  }
}

/** 记号笔在 (x, y) 处的墨有多浓：离笔画中线半个笔宽以内，毡头的墨不匀 */
function inkAt(prep: Prepared, x: number, y: number, aa: number): number {
  let d = Infinity
  for (const k of near(prep.inkBk, x, y)) d = Math.min(d, segDist(prep.ink[k]!, x, y))
  if (d === Infinity) return 0
  const cover = 1 - smooth(PEN_U / 2 - aa, PEN_U / 2 + aa, d)
  return cover <= 0 ? 0 : cover * (0.8 + 0.2 * valueNoise(x * 11, y * 11, 5))
}

/**
 * 培养皿的地面：皿外是灯箱，白亮的面上画着计数网格；皿壁外贴着一圈被玻璃折开的暗边与一线亮的焦散；
 * 玻璃壁的截面当成一段圆弧打光，迎着灯的一侧外缘与背着灯的一侧内缘各亮一道，两条边缘发暗；
 * 琼脂是灯箱的光透过营养琼脂的颜色，贴壁的弯月面更厚更暗、像透镜把底下的网格往外推，背着灯那侧的弯月面亮一线；
 * 透过琼脂看得到灯箱的网格与皿底的记号笔，琼脂里有几个小气泡，表面一片室内灯的湿光
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const ppu = GROUND_PPU
  const aa = 0.6 / ppu
  const w = rect.x1 - rect.x0
  const R = plan.radius
  const W = plan.wall
  const pitch = prep.pitch
  const gx = plan.grid.x * pitch
  const gy = plan.grid.y * pitch
  const half = GROUND_AREA.w / 2
  const corner = Math.hypot(half, half)
  const sheenX = plan.cx - R * 0.32
  const sheenY = plan.cy - R * 0.4
  const sheenC = Math.cos(-0.6)
  const sheenS = Math.sin(-0.6)
  const col: Rgb = [0, 0, 0]
  const tmp: Rgb = [0, 0, 0]
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / ppu
      const y = GROUND_AREA.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const dx = x - plan.cx
      const dy = y - plan.cy
      const r = Math.hypot(dx, dy) || 1e-6
      const lit = 1 - LIGHTBOX_FALL * (Math.hypot(x - half, y - half) / corner) ** 2
      const wAgar = 1 - smooth(R - aa, R + aa, r)
      const wOut = smooth(R + W - aa, R + W + aa, r)
      const wGlass = Math.max(0, 1 - wAgar - wOut)
      col[0] = 0
      col[1] = 0
      col[2] = 0
      if (wOut > 0) {
        lightbox(x, y, lit, gx, gy, pitch, aa, tmp)
        const off = Math.max(0, r - R - W)
        const dark = 0.3 * Math.exp(-off / 0.28)
        const caustic = 0.22 * Math.exp(-(((off - 0.5) / 0.1) ** 2))
        for (let c = 0; c < 3; c++) col[c]! += (tmp[c]! * (1 - dark) + (255 - tmp[c]!) * caustic) * wOut
      }
      if (wGlass > 0) {
        lightbox(x, y, lit, gx, gy, pitch, aa, tmp)
        const t = clamp01((r - R) / W)
        const th = (2 * t - 1) * 1.05
        const nx = (Math.sin(th) * dx) / r
        const ny = (Math.sin(th) * dy) / r
        const nz = Math.cos(th)
        const spec = Math.pow(Math.max(0, nx * H.x + ny * H.y + nz * H.z), 36)
        const dif = 0.86 + 0.14 * (nx * L.x + ny * L.y + nz * L.z)
        const edge = Math.max(Math.exp(-((t / 0.12) ** 2)), Math.exp(-(((1 - t) / 0.12) ** 2)))
        for (let c = 0; c < 3; c++) {
          const v = tmp[c]! * GLASS_TINT[c]! * dif * (1 - 0.4 * edge)
          col[c]! += (v + (255 - v) * 0.8 * spec) * wGlass
        }
      }
      if (wAgar > 0) {
        const inward = Math.max(0, R - r)
        const climb = Math.exp(-inward / MENISCUS_U)
        const thick = 1 + MENISCUS_RISE * climb
        const mag = 1 + MENISCUS_LENS * climb
        const line = gridLine(plan.cx + dx * mag - gx, plan.cy + dy * mag - gy, pitch, aa)
        const light = lit * (1 - 0.3 * line)
        const mottle = 1 + 0.14 * (fbm(x * 1.1, y * 1.1, 77, 3) - 0.5)
        for (let c = 0; c < 3; c++) tmp[c] = LIGHTBOX[c]! * light * Math.pow(AGAR_T[c]!, thick) * mottle + AGAR_BACK[c]!
        const ink = inkAt(prep, x, y, aa)
        if (ink > 0) for (let c = 0; c < 3; c++) tmp[c] = tmp[c]! * (1 - 0.55 * ink)
        for (const b of plan.bubbles) {
          const d = Math.hypot(x - b.x, y - b.y)
          if (d > b.r + aa) continue
          const k = 1 - smooth(b.r - aa, b.r + aa, d)
          const rim = Math.exp(-(((b.r - d) / (b.r * 0.25)) ** 2))
          const hd = Math.hypot(x - (b.x - b.r * 0.35), y - (b.y - b.r * 0.35))
          const glint = (1 - smooth(b.r * 0.12, b.r * 0.3, hd)) * k
          for (let c = 0; c < 3; c++) {
            const v = tmp[c]! * (1 + 0.35 * k * (1 - rim)) * (1 - 0.45 * rim * k)
            tmp[c] = v + (255 - v) * 0.8 * glint
          }
        }
        const su = ((x - sheenX) * sheenC + (y - sheenY) * sheenS) / (R * 0.5)
        const sv = (-(x - sheenX) * sheenS + (y - sheenY) * sheenC) / (R * 0.2)
        const sheen = 0.07 * Math.exp(-(su * su + sv * sv))
        const away = Math.max(0, -(dx * L.x + dy * L.y) / (r * L_FLAT))
        const lip = 0.5 * away * away * away * Math.exp(-(((inward - 0.1) / 0.06) ** 2))
        const shine = sheen + lip
        for (let c = 0; c < 3; c++) col[c]! += (tmp[c]! + (255 - tmp[c]!) * shine) * wAgar
      }
      out[o] = col[0]
      out[o + 1] = col[1]
      out[o + 2] = col[2]
      out[o + 3] = 255
    }
  }
}
