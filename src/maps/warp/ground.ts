import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { SEASONS } from './palette'
import type { Box, Chamber, WarpPlan } from './layout'
import type { WarpConfig } from '../../types/maps'

/** 平台朝屏幕下方露出的那一截侧面多高，格：比平台下沿到格边的缝窄，舱与舱之间还留得出一线虚空 */
export const FACE_U = 0.4
/** 平台落在远处底下的影子往哪边偏、偏多远（格），影子边多软（格） */
const SHADOW = { x: 0.9, y: 1.3, soft: 0.7, alpha: 0.6 } as const
/** 凹槽往下看得见的那一截内壁多高，格 */
const PIT_FACE_U = 1.5
/** 地砖：底色（冷白偏青）、缝的颜色、缝宽（格） */
const TILE = [236, 252, 255] as const
const SEAM = [40, 215, 235] as const
const SEAM_U = 0.045
/** 台沿、机柜与传送台的金属 */
const GRAPHITE = [10, 24, 38] as const
const STEEL = [56, 106, 130] as const
const DEEP = [0, 10, 22] as const
/** 整座实验室的主题色：平台侧面的灯带 */
const CYAN = [0, 255, 255] as const

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

/** 画之前一次算好的：每间舱室那一季的主色（0 到 255） */
export interface Prepared {
  readonly colors: readonly Rgb[]
}

export function prepare(sc: PaintScene): Prepared {
  return {
    colors: sc.plan.rooms.map((r) => {
      const c = SEASONS[r.season]!.color
      return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff] as Rgb
    }),
  }
}

/** 方形的有符号距离：里面为负，格 */
function sdBox(b: Box, x: number, y: number): number {
  const dx = Math.max(b.x0 - x, x - b.x1)
  const dy = Math.max(b.y0 - y, y - b.y1)
  return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy)
}

function grow(b: Box, d: number): Box {
  return { x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d }
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

/** 平台朝屏幕下方的侧面：上沿一道高光，往下暗下去，一条房间颜色的灯带，隔一段一道竖缝 */
function face(out: Rgb, color: readonly number[], x: number, t: number, aa: number): void {
  set(out, STEEL, 0.62 - 0.38 * t)
  mixIn(out, [190, 255, 255], 0.55 * Math.exp(-t / 0.06))
  const strip = Math.exp(-(((t - 0.32) / 0.07) ** 2))
  addGlow(out, color, 0.85 * strip)
  const seam = 1 - smooth(0.02, 0.02 + aa, Math.abs(((x + 0.75) % 1.5) - 0.75))
  for (let i = 0; i < 3; i++) out[i] = out[i]! * (1 - 0.35 * seam * (1 - strip))
}

/** 台沿：亮一点的金属护栏，贴着虚空的那一边一道那一季颜色的亮线，隔一段一根矮柱 */
function lip(out: Rgb, color: readonly number[], along: number, edge: number, aa: number): void {
  set(out, STEEL, 0.72 + 0.25 * smooth(0.2, 0.9, edge))
  const post = 1 - smooth(0.08, 0.08 + aa, Math.abs(((along + 0.75) % 1.5) - 0.75))
  mixIn(out, [180, 250, 255], 0.6 * post * smooth(0.3, 0.5, edge))
  const rail = Math.exp(-(((edge - 0.86) / 0.05) ** 2))
  addGlow(out, color, 1.2 * rail)
  const inner = Math.exp(-(((edge - 0.1) / 0.05) ** 2))
  for (let i = 0; i < 3; i++) out[i] = out[i]! * (1 - 0.35 * inner)
}

/** 凹槽：沿口一道亮线，远处那一面内壁从沿口往下暗进深处，槽底是房间颜色的细网格和一道往上透的光 */
function pit(out: Rgb, color: Rgb, b: Box, x: number, y: number, aa: number): void {
  const d = -sdBox(b, x, y)
  const down = y - b.y0
  set(out, DEEP)
  const gx = Math.abs(((x - b.x0) % 0.5) - 0.25)
  const gy = Math.abs(((y - b.y0) % 0.5) - 0.25)
  const grid = Math.max(1 - smooth(0.2, 0.25, gx), 1 - smooth(0.2, 0.25, gy))
  addGlow(out, color, 0.16 * grid)
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  addGlow(out, color, 0.32 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / 4))
  if (down < PIT_FACE_U) {
    const t = down / PIT_FACE_U
    set(out, GRAPHITE, 1.25 - 0.95 * t)
    const band = Math.abs(((down + 0.1) % 0.38) - 0.19) < 0.02
    if (band) addGlow(out, color, 0.25 * (1 - t))
  }
  const rim = Math.exp(-((d / 0.05) ** 2))
  addGlow(out, color, 1.1 * rim)
  mixIn(out, [200, 255, 255], 0.35 * (1 - smooth(0, aa * 2, d)))
}

/** 机柜的底座：方的金属墩子，四边斜面迎光亮、背光暗，顶上一圈那一季颜色的灯 */
function plinth(out: Rgb, color: Rgb, b: Box, x: number, y: number): void {
  const d = -sdBox(b, x, y)
  set(out, STEEL, 0.55)
  const bev = 1 - smooth(0.05, 0.16, d)
  if (bev > 0) {
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    const ax = Math.abs(x - cx) > Math.abs(y - cy) ? Math.sign(x - cx) : 0
    const ay = ax === 0 ? Math.sign(y - cy) : 0
    const lit = -(ax * LX + ay * LY)
    for (let i = 0; i < 3; i++) out[i] = out[i]! * (1 + 0.7 * lit * bev)
  }
  const ring = Math.exp(-(((d - 0.24) / 0.04) ** 2))
  addGlow(out, color, 1.1 * ring)
  if (d > 0.3) mixIn(out, [24, 30, 44], 0.7)
}

/** 出怪板：嵌进地面的暗槽，一根根栅条，四边一圈房间颜色的灯 */
function plate(out: Rgb, color: Rgb, b: Box, x: number, y: number): void {
  const d = -sdBox(b, x, y)
  set(out, DEEP, 1.4)
  const across = b.x1 - b.x0 > b.y1 - b.y0 ? x - b.x0 : y - b.y0
  const bar = Math.abs(((across + 0.1) % 0.2) - 0.1) < 0.035
  if (bar && d > 0.12) set(out, STEEL, 0.45)
  addGlow(out, color, 0.9 * Math.exp(-(((d - 0.05) / 0.04) ** 2)))
  addGlow(out, [255, 70, 90], 0.12 * smooth(0.1, 0.4, d))
}

/** 标本罐的罐座：钢的方墩，正中一圈玻璃底，罐里的液体透着那一季的颜色 */
function jarBase(out: Rgb, color: Rgb, b: Box, x: number, y: number, aa: number): void {
  const d = -sdBox(b, x, y)
  set(out, STEEL, 0.5)
  mixIn(out, [200, 240, 255], 0.5 * Math.exp(-(((d - 0.05) / 0.04) ** 2)))
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  const r = Math.hypot(x - cx, y - cy)
  const R = (b.x1 - b.x0) * 0.38
  if (r < R) {
    set(out, color, 0.28)
    addGlow(out, [180, 255, 255], 0.35 * Math.exp(-(((r - R * 0.92) / 0.05) ** 2)))
    mixIn(out, [230, 250, 255], 0.25 * (1 - smooth(R - aa * 2, R, r)) * smooth(0, R, r))
  }
}

/** 传送台的台座：钢的外圈与斜面，暗色的台面上两道刻槽、一圈刻度，正中一块镜面 */
function padBase(out: Rgb, r: number, R: number, ang: number, aa: number): void {
  const t = r / R
  set(out, [16, 24, 38])
  if (t > 0.86) {
    set(out, STEEL, 0.8)
    const bev = (t - 0.86) / 0.14
    mixIn(out, [220, 232, 245], 0.4 * Math.exp(-(((bev - 0.15) / 0.15) ** 2)))
  }
  for (const g of [0.36, 0.62]) {
    const groove = Math.exp(-(((t - g) / (0.02 + aa / R)) ** 2))
    for (let i = 0; i < 3; i++) out[i] = out[i]! * (1 - 0.6 * groove) + 40 * groove * 0.2
  }
  if (t > 0.7 && t < 0.82) {
    const tick = Math.abs(((ang / (Math.PI * 2)) * 24) % 1 - 0.5) > 0.42
    if (tick) mixIn(out, [120, 140, 165], 0.5)
  }
  if (t < 0.2) mixIn(out, [60, 78, 102], 0.6 * (1 - t / 0.2))
}

/** 地砖：一格一块，冷白偏青，块与块之间一道缝，迎光的两边一线亮、背光的两边一线暗，块面有一点不匀；离墙、立柱与凹槽近的地方暗一点 */
function tile(out: Rgb, x: number, y: number, ao: number, aa: number): void {
  const fx = x - Math.floor(x)
  const fy = y - Math.floor(y)
  const h = valueNoise(Math.floor(x) * 1.37, Math.floor(y) * 1.91, 3)
  set(out, TILE, 0.95 + 0.06 * h + 0.03 * (valueNoise(x * 6, y * 6, 5) - 0.5))
  const edge = Math.min(fx, 1 - fx, fy, 1 - fy)
  const seam = 1 - smooth(SEAM_U / 2, SEAM_U / 2 + aa, edge)
  const lit = (fx < 0.08 ? -LX : fx > 0.92 ? LX : 0) + (fy < 0.08 ? -LY : fy > 0.92 ? LY : 0)
  const bevel = Math.exp(-edge / 0.035)
  for (let i = 0; i < 3; i++) out[i] = out[i]! * (1 - 0.12 * bevel * Math.sign(lit)) * (1 - 0.32 * ao)
  mixIn(out, SEAM, seam)
}

/** 空舱地上嵌的一枚圆徽：两道同心圆，四个缺口对着四面 */
function emblem(out: Rgb, color: Rgb, room: Chamber, x: number, y: number): void {
  const dx = x - room.center.x
  const dy = y - room.center.y
  const r = Math.hypot(dx, dy)
  const ang = Math.atan2(dy, dx)
  const notch = Math.abs(((ang / (Math.PI / 2)) % 1 + 1) % 1 - 0.5) > 0.44
  for (const [rr, w] of [
    [2.6, 0.05],
    [3.1, 0.12],
  ] as const) {
    const k = Math.exp(-(((r - rr) / w) ** 2)) * (notch ? 0 : 1)
    mixIn(out, [40, 220, 240], 0.55 * k)
    addGlow(out, color, 0.08 * k)
  }
}

/** 这一点落在哪块平台的顶面上 */
function slabAt(plan: WarpPlan, x: number, y: number): Chamber | null {
  for (const r of plan.rooms) if (x >= r.slab.x0 && x < r.slab.x1 && y >= r.slab.y0 && y < r.slab.y1) return r
  return null
}

/** 这一点落在哪块平台朝下的侧面上，从侧面上沿往下走到几成 */
function faceAt(plan: WarpPlan, x: number, y: number): { room: Chamber; t: number } | null {
  for (const r of plan.rooms) if (x >= r.slab.x0 && x < r.slab.x1 && y >= r.slab.y1 && y < r.slab.y1 + FACE_U) return { room: r, t: (y - r.slab.y1) / FACE_U }
  return null
}

/** 平台顶面上的一点：按落在哪一块画 */
function slabTop(sc: PaintScene, prep: Prepared, room: Chamber, x: number, y: number, aa: number, out: Rgb): void {
  const color = prep.colors[room.index]!
  const f = room.floor
  const pr = sc.cfg.pad.radiusU
  let pd = Infinity
  for (const p of [room.entry, ...room.doors]) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < pr) return padBase(out, d, pr, Math.atan2(y - p.y, x - p.x), aa)
    pd = Math.min(pd, d)
  }
  const inFloor = x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1
  if (inFloor) {
    if (room.pit && sdBox(room.pit, x, y) < 0) return pit(out, color, room.pit, x, y, aa)
    if (sdBox(room.jar, x, y) < 0) return jarBase(out, color, room.jar, x, y, aa)
    for (const b of room.racks) if (sdBox(grow(b, 0.12), x, y) < 0) return plinth(out, color, grow(b, 0.12), x, y)
    for (const p of room.plates) if (sdBox(p.box, x, y) < 0) return plate(out, color, p.box, x, y)
    let ao = 0
    ao = Math.max(ao, Math.exp(-Math.max(0, -sdBox(f, x, y)) / 0.35) * 0.55)
    if (room.pit) ao = Math.max(ao, Math.exp(-Math.max(0, sdBox(room.pit, x, y)) / 0.3) * 0.25)
    for (const b of [...room.racks, room.jar]) {
      const sx = x - 0.25
      const sy = y - 0.35
      ao = Math.max(ao, Math.exp(-Math.max(0, sdBox(grow(b, 0.12), sx, sy)) / 0.25) * 0.55)
    }
    ao = Math.max(ao, Math.exp(-Math.max(0, pd - pr) / 0.18) * 0.4)
    tile(out, x, y, ao, aa)
    if (room.shape === 'hall') emblem(out, color, room, x, y)
    return
  }
  const toFloor = sdBox(f, x, y)
  const along = x < f.x0 || x >= f.x1 ? y : x
  return lip(out, color, along, clamp01(toFloor / sc.cfg.maze.lipU), aa)
}

/**
 * 迷宫的地面：虚空透明，留给底下的着色器；每间舱室的平台顶面是一格一块的冷白地砖，四边一圈护栏台沿，
 * 镶着那一季颜色的灯带；平台朝屏幕下方露出一截侧面，在远处的底上落下一片软影。机柜的墩子、凹槽、标本罐的罐座、出怪板与门、入口的台座也画在这里
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
        slabTop(sc, prep, room, x, y, aa, col)
        // 平台的四条边缘：贴着虚空的那一圈一线亮
        const e = -sdBox(room.slab, x, y)
        mixIn(col, [170, 255, 255], 0.4 * (1 - smooth(0, aa * 2.5, e)))
      } else {
        const f = faceAt(plan, x, y)
        if (f) {
          face(col, CYAN, x, f.t, aa)
        } else {
          let shadow = 0
          let glow = 0
          let gc: Rgb = [0, 0, 0]
          for (const r of plan.rooms) {
            const s = { x0: r.slab.x0, y0: r.slab.y0, x1: r.slab.x1, y1: r.slab.y1 + FACE_U }
            // 画面四周平铺：贴着方框边的影子要接上那一头平台落下来的
            for (const ox of x < 4 ? [0, -FRAME_U] : [0]) for (const oy of y < 4 ? [0, -FRAME_U] : [0]) shadow = Math.max(shadow, 1 - smooth(-SHADOW.soft, SHADOW.soft, sdBox(s, x - SHADOW.x - ox, y - SHADOW.y - oy)))
            const under = y - (r.slab.y1 + FACE_U)
            if (x >= r.slab.x0 - 0.3 && x < r.slab.x1 + 0.3 && under >= 0 && under < 1.2) {
              const k = Math.exp(-under / 0.35) * (1 - smooth(r.slab.x1 - 0.2, r.slab.x1 + 0.3, x)) * smooth(r.slab.x0 - 0.3, r.slab.x0 + 0.2, x)
              if (k > glow) {
                glow = k
                gc = prep.colors[r.index]!
              }
            }
          }
          set(col, [0, 4, 12])
          alpha = Math.max(shadow * SHADOW.alpha, glow * 0.4)
          if (glow * 0.4 > shadow * SHADOW.alpha) set(col, gc, 0.6)
        }
      }
      out[o] = col[0]
      out[o + 1] = col[1]
      out[o + 2] = col[2]
      out[o + 3] = alpha * 255
    }
  }
}
