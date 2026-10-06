import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { FEEDER_U } from './layout'
import { SIGNS } from './palette'
import type { Box, Ornament, WarpPlan, WarpRoom } from './layout'
import type { WarpConfig } from '../../types/maps'

/** 缸朝屏幕下方露出的那一截玻璃正面多高，格：标签贴在这里 */
export const FACE_U = 0.9
/** 缸落在实验台上的影子往哪边偏、偏多远（格），影子边多软（格） */
const SHADOW = { x: 0.7, y: 1.1, soft: 0.6, alpha: 0.55 } as const
/** 摆件落在缸底的影子往哪边偏，格 */
const DROP = { x: 0.22, y: 0.32 } as const
/** 投料碗多大，格 */
const BOWL_U = 0.55
/** 感应地板：底色（冷白偏青）、缝的颜色、缝宽（格） */
const TILE = [232, 246, 250] as const
const SEAM = [60, 200, 220] as const
const SEAM_U = 0.045
/** 管口的金属 */
const STEEL = [96, 128, 146] as const
const DARK = [14, 24, 34] as const
/** 玻璃：底下透出来的那层冷青、边上的高光 */
const GLASS = [150, 235, 245] as const
const GLINT = [235, 255, 255] as const

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

const SL = Math.hypot(SUN.x, SUN.y)
const LX = SUN.x / SL
const LY = SUN.y / SL

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: WarpConfig
  readonly plan: WarpPlan
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

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面贴图的大小，像素：铺满方框 */
export function textureSize(): { w: number; h: number } {
  return { w: Math.round(FRAME_U * GROUND_PPU), h: Math.round(FRAME_U * GROUND_PPU) }
}

/** 画之前一次算好的：每只缸的灯色（0 到 255） */
export interface Prepared {
  readonly colors: readonly Rgb[]
}

export function prepare(sc: PaintScene): Prepared {
  return { colors: sc.plan.rooms.map((r) => [(SIGNS[r.sign]!.color >> 16) & 0xff, (SIGNS[r.sign]!.color >> 8) & 0xff, SIGNS[r.sign]!.color & 0xff] as Rgb) }
}

/** 方形的有符号距离：里面为负，格 */
function sdBox(b: Box, x: number, y: number): number {
  const dx = Math.max(b.x0 - x, x - b.x1)
  const dy = Math.max(b.y0 - y, y - b.y1)
  return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy)
}

function set(out: Rgb, c: readonly number[], k = 1): void {
  out[0] = c[0]! * k
  out[1] = c[1]! * k
  out[2] = c[2]! * k
}

function mixIn(out: Rgb, c: readonly number[], t: number): void {
  for (let i = 0; i < 3; i++) out[i] = out[i]! + (c[i]! - out[i]!) * t
}

function addGlow(out: Rgb, c: readonly number[], k: number): void {
  for (let i = 0; i < 3; i++) out[i] = out[i]! + c[i]! * k
}

function scale(out: Rgb, k: number): void {
  for (let i = 0; i < 3; i++) out[i] = out[i]! * k
}

/** 摆件的朝向：按圆心打散出一个角度 */
function headingOf(o: Ornament): number {
  return valueNoise(o.x * 3.1, o.y * 2.7, 77) * Math.PI * 2
}

/** 圆顶的迎光：r 是离中心几成（0 到 1），(ux, uy) 是这一点朝外的方向 */
function dome(r: number, ux: number, uy: number): number {
  const z = Math.sqrt(Math.max(0, 1 - r * r))
  return clamp01(0.35 + 0.65 * (ux * SUN.x * r + uy * SUN.y * r + z * SUN.z))
}

/** 花盆：一圈陶土的盆沿，盆里是土 */
function pot(out: Rgb, d: number, R: number, ux: number, uy: number): boolean {
  if (d > R) return false
  const t = d / R
  if (t > 0.8) {
    set(out, [176, 92, 56], 0.8 + 0.4 * dome((t - 0.8) / 0.2, ux, uy))
    return true
  }
  set(out, [62, 42, 30], 0.85 + 0.25 * valueNoise(d * 30 + ux * 9, uy * 30, 5))
  return true
}

/**
 * 一件摆件的顶面，(dx, dy) 是这一点离圆心多远，格；画到了就返回 true。
 * 都是水族箱里那种小摆件：缩小了、塑料或陶瓷做的、摆得端端正正
 */
function ornament(out: Rgb, o: Ornament, dx: number, dy: number): boolean {
  const d = Math.hypot(dx, dy)
  const ux = d > 1e-6 ? dx / d : 0
  const uy = d > 1e-6 ? dy / d : 0
  const ang = Math.atan2(dy, dx)
  const h = headingOf(o)
  switch (o.kind) {
    case 'daisy': {
      // 雏菊：一圈白花瓣、黄花心，盆里露出几片叶子
      const petal = 0.62 * (0.72 + 0.28 * Math.abs(Math.cos(((ang - h) * 13) / 2)))
      if (d < 0.17) {
        set(out, [250, 196, 40], 0.75 + 0.35 * dome(d / 0.17, ux, uy))
        if (valueNoise(dx * 40, dy * 40, 3) > 0.6) scale(out, 0.85)
        return true
      }
      if (d < petal) {
        set(out, [250, 250, 244], 0.86 + 0.14 * Math.cos(((ang - h) * 13) / 2) ** 2)
        mixIn(out, [255, 220, 120], 0.25 * (1 - smooth(0.17, 0.3, d)))
        return true
      }
      const leaf = Math.abs(Math.sin((ang - h - 0.4) * 2)) > 0.86 && d < 0.78
      if (leaf) {
        set(out, [74, 150, 64], 0.9 + 0.2 * (1 - d))
        return true
      }
      return pot(out, d, 0.88, ux, uy)
    }
    case 'bonsai': {
      // 樱花盆景：一团粉色的花冠，几簇深一点的花团，边上露出一截深蓝的釉盆
      const wob = 1.05 + 0.12 * Math.sin((ang - h) * 5) + 0.06 * Math.sin((ang + h) * 9)
      if (d < wob) {
        const n = valueNoise(dx * 5 + 7, dy * 5 + 3, 11)
        const cluster = valueNoise(dx * 2.4, dy * 2.4, 13)
        set(out, [248, 178, 204], 0.72 + 0.4 * dome(d / wob, ux, uy))
        if (cluster > 0.62) mixIn(out, [222, 110, 150], 0.45)
        if (n > 0.72) mixIn(out, [255, 240, 246], 0.6)
        scale(out, 1 - 0.25 * smooth(0.82, 1, d / wob))
        return true
      }
      const c = Math.cos(h)
      const s = Math.sin(h)
      const px = dx * c + dy * s
      const py = -dx * s + dy * c
      if (Math.abs(px) < 1.28 && Math.abs(py) < 0.7) {
        set(out, [40, 66, 120], 0.9 + 0.25 * (Math.abs(py) > 0.6 ? 1 : 0))
        return true
      }
      return false
    }
    case 'cactus': {
      // 仙人掌：一圈陶盆，盆里一个带棱的绿球，顶上开一朵小粉花
      if (d < 0.62) {
        const rib = 0.5 + 0.5 * Math.cos((ang - h) * 12)
        set(out, [64, 150, 82], (0.6 + 0.5 * dome(d / 0.62, ux, uy)) * (0.82 + 0.22 * rib))
        const spine = rib > 0.96 && Math.abs(((d * 9) % 1) - 0.5) < 0.12
        if (spine) mixIn(out, [246, 240, 210], 0.8)
        if (d < 0.14) set(out, [246, 110, 150], 0.9 + 0.2 * dome(d / 0.14, ux, uy))
        return true
      }
      return pot(out, d, 0.98, ux, uy)
    }
    case 'submarine': {
      // 玩具潜艇：黄色的胶囊、正中一座指挥塔、两侧舷窗，尾巴上一副螺旋桨
      const c = Math.cos(h)
      const s = Math.sin(h)
      const px = dx * c + dy * s
      const py = -dx * s + dy * c
      const half = 1.15
      const w = 0.42
      const along = Math.max(0, Math.abs(px) - (half - w))
      const body = Math.hypot(along, py)
      if (body < w) {
        const k = body / w
        const nx = (along * Math.sign(px)) / (body || 1)
        const ny = py / (body || 1)
        const wx = nx * c - ny * s
        const wy = nx * s + ny * c
        set(out, [250, 200, 40], 0.62 + 0.5 * dome(k, wx, wy))
        if (Math.abs(px + 0.25) < 0.22 && Math.abs(py) < 0.18) set(out, [210, 150, 30], 1.05)
        for (const ox of [0.35, 0.72]) if (Math.hypot(px - ox, Math.abs(py) - 0.28) < 0.07) set(out, [40, 90, 130], 1)
        return true
      }
      if (px < -half && px > -half - 0.28 && Math.abs(py) < 0.32 * Math.abs(Math.cos((py / 0.32) * Math.PI * 1.5))) {
        set(out, [150, 150, 150], 1)
        return true
      }
      return false
    }
    case 'column': {
      // 断柱：一截有凹槽的柱身，顶上是断开的毛面，脚下一块方的柱础
      if (d < 0.72) {
        const flute = 0.5 + 0.5 * Math.cos((ang - h) * 16)
        const rough = valueNoise(dx * 9 + 3, dy * 9, 21)
        set(out, [236, 214, 172], 0.72 + 0.32 * rough)
        if (d > 0.6) scale(out, 0.82 + 0.18 * flute)
        if (rough < 0.3) scale(out, 0.8)
        return true
      }
      const c = Math.cos(h)
      const s = Math.sin(h)
      const px = dx * c + dy * s
      const py = -dx * s + dy * c
      if (Math.max(Math.abs(px), Math.abs(py)) < 0.98) {
        const e = 0.98 - Math.max(Math.abs(px), Math.abs(py))
        const nx = Math.abs(px) > Math.abs(py) ? Math.sign(px) : 0
        const ny = nx === 0 ? Math.sign(py) : 0
        const lit = -(nx * c - ny * s) * LX - (nx * s + ny * c) * LY
        set(out, [214, 184, 136], 0.9 + (e < 0.12 ? 0.35 * lit : 0))
        return true
      }
      return false
    }
    case 'geode': {
      // 晶洞：粗糙的石壳剖开，里面一圈白石英、再往里是紫水晶，夹着几粒黄水晶
      const shell = 1.15 + 0.1 * valueNoise(ang * 2.5 + 9, h, 31)
      if (d > shell) return false
      const t = d / shell
      if (t > 0.78) {
        set(out, [120, 104, 96], 0.7 + 0.45 * dome((t - 0.78) / 0.22, ux, uy) * (0.8 + 0.4 * valueNoise(dx * 8, dy * 8, 33)))
        return true
      }
      if (t > 0.66) {
        set(out, [240, 236, 246], 0.92)
        return true
      }
      const facet = valueNoise(dx * 7 + 1, dy * 7 + 5, 35)
      const shine = Math.max(0, Math.cos(ang * 6 + facet * 9))
      set(out, [150, 84, 214], 0.45 + 0.5 * t + 0.35 * shine * facet)
      if (valueNoise(dx * 3.2 + 11, dy * 3.2, 37) > 0.78) set(out, [250, 196, 70], 0.75 + 0.4 * shine)
      return true
    }
    case 'ice': {
      // 冰块：一块方的冰，边上的斜面迎光亮，里面几道裂纹
      const c = Math.cos(h)
      const s = Math.sin(h)
      const px = dx * c + dy * s
      const py = -dx * s + dy * c
      const e = 0.8 - Math.max(Math.abs(px), Math.abs(py))
      if (e < 0) return false
      set(out, [200, 238, 252], 0.92)
      if (e < 0.14) {
        const nx = Math.abs(px) > Math.abs(py) ? Math.sign(px) : 0
        const ny = nx === 0 ? Math.sign(py) : 0
        const lit = -(nx * c - ny * s) * LX - (nx * s + ny * c) * LY
        mixIn(out, lit > 0 ? [255, 255, 255] : [120, 180, 220], 0.6 * Math.abs(lit))
      }
      const crack = Math.abs(valueNoise(px * 3 + 2, py * 3, 41) - 0.5) < 0.03
      if (crack) mixIn(out, [255, 255, 255], 0.8)
      mixIn(out, [255, 255, 255], 0.4 * Math.exp(-(((px + py + 0.4) / 0.12) ** 2)))
      return true
    }
    case 'volcano': {
      // 冒泡的小火山：棕色的锥，顶上一口发红的火口，几道熔岩顺着坡淌下来
      if (d > 1.4) return false
      const t = d / 1.4
      if (t < 0.2) {
        set(out, [255, 110, 40], 0.7 + 0.5 * (1 - t / 0.2))
        return true
      }
      const slope = clamp01(0.5 + 0.5 * (ux * LX + uy * LY) * 1.4)
      set(out, [120, 74, 52], 0.55 + 0.6 * slope)
      if (t < 0.27) set(out, [70, 40, 32], 1)
      const flow = Math.abs(((ang - h) / (Math.PI * 2)) * 5 - Math.round(((ang - h) / (Math.PI * 2)) * 5))
      if (flow < 0.05 * (1 - t) + 0.01 && t < 0.85) mixIn(out, [255, 96, 32], 0.9 * (1 - t))
      return true
    }
  }
}

/** 这一点落在哪件摆件上，没有为 null */
function ornamentAt(room: WarpRoom, x: number, y: number, out: Rgb): boolean {
  for (const o of room.ornaments) {
    const dx = x - o.x
    const dy = y - o.y
    if (dx * dx + dy * dy > (o.r + 0.2) ** 2) continue
    if (ornament(out, o, dx, dy)) return true
  }
  return false
}

/** 管口：一圈钢的箍，出口是往下抽的栅格口，进口是光面的落脚盘，盘上几道往缸里指的刻线 */
function mouth(out: Rgb, d: number, R: number, ang: number, exit: boolean, dir: { x: number; y: number }, aa: number): void {
  const t = d / R
  if (t > 0.84) {
    const bev = (t - 0.84) / 0.16
    set(out, STEEL, 0.85 + 0.35 * Math.exp(-(((bev - 0.3) / 0.25) ** 2)))
    return
  }
  if (exit) {
    set(out, DARK, 1 + 0.6 * t)
    const bars = Math.abs(((ang / (Math.PI * 2)) * 10) % 1 - 0.5) > 0.4
    const ring = Math.abs(t - 0.45) < 0.05 + aa / R
    if ((bars && t > 0.18) || ring) set(out, STEEL, 0.55 + 0.3 * t)
    return
  }
  set(out, [176, 198, 208], 0.92 - 0.18 * t)
  const groove = Math.abs(t - 0.62) < 0.03 + aa / R
  if (groove) scale(out, 0.75)
  const along = -(Math.cos(ang) * dir.x + Math.sin(ang) * dir.y) * t
  if (t < 0.55 && Math.abs(((along * 3 + 10) % 1) - 0.5) < 0.06) scale(out, 0.8)
}

/** 投料口落饲料的小钢碗 */
function bowl(out: Rgb, d: number, ux: number, uy: number): boolean {
  if (d > BOWL_U) return false
  const t = d / BOWL_U
  if (t > 0.78) set(out, STEEL, 0.9 + 0.4 * dome((t - 0.78) / 0.22, ux, uy))
  else set(out, [150, 170, 182], 0.7 + 0.3 * (1 - dome(t, ux, uy)))
  return true
}

/** 感应地板：一格一块，冷白里带一点这只缸的灯色，块与块之间一道缝，迎光的两边一线亮、背光的两边一线暗；离缸壁、摆件近的地方暗一点 */
function tile(out: Rgb, color: Rgb, x: number, y: number, ao: number, aa: number): void {
  const fx = x - Math.floor(x)
  const fy = y - Math.floor(y)
  const h = valueNoise(Math.floor(x) * 1.37, Math.floor(y) * 1.91, 3)
  set(out, TILE, 0.95 + 0.05 * h + 0.03 * (valueNoise(x * 6, y * 6, 5) - 0.5))
  mixIn(out, color, 0.07)
  const edge = Math.min(fx, 1 - fx, fy, 1 - fy)
  const seam = 1 - smooth(SEAM_U / 2, SEAM_U / 2 + aa, edge)
  const lit = (fx < 0.08 ? -LX : fx > 0.92 ? LX : 0) + (fy < 0.08 ? -LY : fy > 0.92 ? LY : 0)
  const bevel = Math.exp(-edge / 0.035)
  scale(out, (1 - 0.12 * bevel * Math.sign(lit)) * (1 - 0.32 * ao))
  mixIn(out, SEAM, seam)
}

/** 这一点落在哪只缸的外沿里 */
function slabAt(plan: WarpPlan, x: number, y: number): WarpRoom | null {
  for (const r of plan.rooms) if (x >= r.slab.x0 && x < r.slab.x1 && y >= r.slab.y0 && y < r.slab.y1) return r
  return null
}

/** 这一点落在哪只缸朝下的玻璃正面上，从上沿往下走到几成 */
function faceAt(plan: WarpPlan, x: number, y: number): { room: WarpRoom; t: number } | null {
  for (const r of plan.rooms) if (x >= r.slab.x0 && x < r.slab.x1 && y >= r.slab.y1 && y < r.slab.y1 + FACE_U) return { room: r, t: (y - r.slab.y1) / FACE_U }
  return null
}

/**
 * 缸壁的玻璃：半透明，底下的实验台透上来；里外两条边各一线高光，正中一道这只缸的灯色，斜着一道反光。返回透明度
 */
function glass(out: Rgb, color: Rgb, room: WarpRoom, x: number, y: number, aa: number): number {
  const f = room.floor
  const s = room.slab
  const inner = sdBox(f, x, y)
  const outer = -sdBox(s, x, y)
  set(out, GLASS, 0.7)
  let a = 0.32
  const edge = Math.max(1 - smooth(0, aa * 2.5, inner), 1 - smooth(0, aa * 2.5, outer))
  mixIn(out, GLINT, edge)
  a = Math.max(a, 0.9 * edge)
  const mid = Math.exp(-(((inner - outer) / 0.12) ** 2))
  addGlow(out, color, 0.35 * mid)
  a = Math.max(a, 0.5 * mid)
  const streak = Math.exp(-((((((x + y) % 7) - 3.5) / 0.35)) ** 2))
  mixIn(out, GLINT, 0.4 * streak)
  a = Math.max(a, 0.55 * streak)
  return a
}

/** 缸的玻璃正面：上沿一线亮，往下透出实验台；返回透明度 */
function face(out: Rgb, color: Rgb, x: number, t: number): number {
  set(out, GLASS, 0.55)
  mixIn(out, GLINT, 0.8 * Math.exp(-t / 0.06))
  addGlow(out, color, 0.25 * Math.exp(-(((t - 0.85) / 0.08) ** 2)))
  const streak = Math.exp(-((((((x * 0.9) % 5) - 2.5) / 0.3)) ** 2))
  mixIn(out, GLINT, 0.35 * streak)
  return Math.max(0.26 + 0.6 * Math.exp(-t / 0.06), 0.5 * streak, 0.7 * Math.exp(-(((t - 0.97) / 0.03) ** 2)))
}

/** 缸里的一点：缸底、管口、投料碗、出怪板与摆件；返回透明度 */
function inside(sc: PaintScene, prep: Prepared, room: WarpRoom, x: number, y: number, aa: number, out: Rgb): number {
  const color = prep.colors[room.index]!
  const R = sc.cfg.pad.radiusU
  if (ornamentAt(room, x, y, out)) return 1
  for (const [p, exit, dir] of [
    [room.exit, true, room.exitDir],
    [room.entry, false, room.entryDir],
  ] as const) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < R) {
      mouth(out, d, R, Math.atan2(y - p.y, x - p.x), exit, dir, aa)
      return 1
    }
  }
  const bx = room.entry.x - room.entryDir.x * FEEDER_U
  const by = room.entry.y - room.entryDir.y * FEEDER_U
  const bd = Math.hypot(x - bx, y - by)
  if (bowl(out, bd, bd > 1e-6 ? (x - bx) / bd : 0, bd > 1e-6 ? (y - by) / bd : 0)) return 1
  for (const p of room.plates) {
    if (sdBox(p.box, x, y) >= 0) continue
    const d = -sdBox(p.box, x, y)
    set(out, DARK, 1.4)
    const across = p.box.x1 - p.box.x0 > p.box.y1 - p.box.y0 ? x - p.box.x0 : y - p.box.y0
    if (Math.abs(((across + 0.1) % 0.2) - 0.1) < 0.035 && d > 0.12) set(out, STEEL, 0.45)
    addGlow(out, color, 0.9 * Math.exp(-(((d - 0.05) / 0.04) ** 2)))
    return 1
  }
  let ao = Math.exp(-Math.max(0, -sdBox(room.floor, x, y)) / 0.35) * 0.45
  for (const o of room.ornaments) ao = Math.max(ao, 0.6 * (1 - smooth(o.r * 0.7, o.r + 0.25, Math.hypot(x - DROP.x - o.x, y - DROP.y - o.y))))
  for (const p of [room.exit, room.entry]) ao = Math.max(ao, Math.exp(-Math.max(0, Math.hypot(x - p.x, y - p.y) - R) / 0.18) * 0.4)
  tile(out, color, x, y, ao, aa)
  return 1
}

/**
 * 实验台上的四只饲养缸：缸外的实验台透明，留给底下的着色器；缸底是一格一块的感应地板，四边一圈半透明的玻璃缸壁，
 * 缸朝屏幕下方露出一截玻璃正面，在实验台上落下一片软影。管口、投料碗、出怪板与摆件也画在这里
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const ppu = GROUND_PPU
  const aa = 0.8 / ppu
  const w = rect.x1 - rect.x0
  const col: Rgb = [0, 0, 0]
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      let alpha = 1
      const room = slabAt(plan, x, y)
      if (room) {
        const f = room.floor
        if (x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1) alpha = inside(sc, prep, room, x, y, aa, col)
        else alpha = glass(col, prep.colors[room.index]!, room, x, y, aa)
      } else {
        const f = faceAt(plan, x, y)
        if (f) {
          alpha = face(col, prep.colors[f.room.index]!, x, f.t)
        } else {
          let shadow = 0
          for (const r of plan.rooms) {
            const s = { x0: r.slab.x0, y0: r.slab.y0, x1: r.slab.x1, y1: r.slab.y1 + FACE_U }
            // 画面四周平铺：贴着方框边的影子要接上那一头的缸落下来的
            for (const ox of [-FRAME_U, 0, FRAME_U]) for (const oy of [-FRAME_U, 0, FRAME_U]) shadow = Math.max(shadow, 1 - smooth(-SHADOW.soft, SHADOW.soft, sdBox(s, x - SHADOW.x - ox, y - SHADOW.y - oy)))
          }
          set(col, [0, 6, 10])
          alpha = shadow * SHADOW.alpha
        }
      }
      out[o] = col[0]
      out[o + 1] = col[1]
      out[o + 2] = col[2]
      out[o + 3] = alpha * 255
    }
  }
}
