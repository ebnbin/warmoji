import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { pageRoom } from './model'

/** 台面在方框里的位置，格：画背景只要这些数，能整个发给画画的线程 */
export interface PaintScene {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly seed: number
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

/** 背景铺满方框 */
export function textureSize(): { w: number; h: number } {
  return { w: FRAME_U * GROUND_PPU, h: FRAME_U * GROUND_PPU }
}

/** 地布外露出来的一圈台板多宽，格；台口前沿的立面多高（画面上多宽），格 */
export const BOARD_U = 1.4
const APRON_U = 0.9
/** 脚灯：沿台口每隔多远一盏，格 */
const FOOTLIGHT_STEP_U = 1.7
/** 观众席一排排座椅：排距、座宽，格 */
const ROW_U = 1.35
const SEAT_U = 1.1

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function lerp3(a: readonly number[], b: readonly number[], t: number): Rgb {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
}

/** 地布：本白的粗布 */
const CLOTH = [238, 228, 206] as const
const CLOTH_LO = [214, 200, 172] as const
/** 台板：浅色的木地板 */
const BOARD_LO = [140, 92, 54] as const
const BOARD_HI = [206, 152, 98] as const
/** 台口的立面、观众席的地面与椅子 */
const APRON = [74, 40, 26] as const
const HALL = [30, 14, 12] as const
const SEAT = [120, 26, 32] as const
const SEAT_HI = [168, 46, 50] as const
/** 两边的红丝绒大幕、金边 */
const VELVET_LO = [92, 10, 18] as const
const VELVET_HI = [190, 34, 42] as const
const GILT = [222, 178, 92] as const
/** 台后的墙 */
const WALL = [34, 24, 22] as const
/** 脚灯的暖光 */
const GLOW = [255, 214, 140] as const

/** 画背景之前一次算好的：没有 */
export type Prepared = null

export function prepare(): Prepared {
  return null
}

/** 台板：一条条从台口铺向台后的木板，板缝深色，偶尔一个节疤 */
function boards(sc: PaintScene, x: number, y: number): Rgb {
  const w = 0.9
  const col = Math.floor(x / w)
  const u = (x - col * w) / w
  const shift = valueNoise(col * 3.1, 0.5, sc.seed) * 30
  const grain = 0.5 + 0.5 * Math.sin((x * 9 + fbm(x * 0.6, (y + shift) * 0.08, sc.seed + 11, 2) * 14) * 1.3)
  const tone = 0.4 + 0.25 * valueNoise(col * 7.7, 1.3, sc.seed + 1) + 0.25 * grain + 0.1 * valueNoise(x * 20, (y + shift) * 2.5, sc.seed + 5)
  let c = lerp3(BOARD_LO, BOARD_HI, clamp01(tone))
  const seam = Math.min(u, 1 - u) * w
  c = lerp3(c, [60, 34, 20], (1 - smooth(0, 0.04, seam)) * 0.8)
  return c
}

/** 地布：粗布的经纬，边上收一道布边、一圈缝线；灯照在台中最亮 */
function cloth(sc: PaintScene, x: number, y: number, r: number): Rgb {
  const weave = (Math.sin(x * 90) * Math.sin(y * 90) * 0.5 + 0.5) * 0.08 + fbm(x * 0.35, y * 0.35, sc.seed + 21, 2) * 0.3
  let c = lerp3(CLOTH, CLOTH_LO, clamp01(weave))
  const hem = 1 - smooth(0.12, 0.32, r)
  c = lerp3(c, CLOTH_LO, hem * 0.7)
  const along = x < sc.x0 + 0.5 || x > sc.x1 - 0.5 ? y : x
  if (Math.abs(r - 0.42) < 0.025 && Math.sin(along * 14) > 0) c = lerp3(c, [150, 120, 90], 0.7)
  return c
}

/** 台口：前沿一道深色立面，一排脚灯；再往外是黑乎乎的观众席，一排排空着的红椅子 */
function front(sc: PaintScene, x: number, y: number): Rgb {
  const d = y - sc.y1 - BOARD_U
  if (d < APRON_U) return lerp3(APRON, [40, 22, 14], d / APRON_U)
  const row = Math.floor((d - APRON_U - 0.6) / ROW_U)
  const v = (d - APRON_U - 0.6 - row * ROW_U) / ROW_U
  let c: Rgb = [...HALL]
  if (row >= 0 && v > 0.15 && v < 0.6) {
    const seat = (x - (row % 2) * SEAT_U * 0.5) / SEAT_U
    const u = seat - Math.floor(seat)
    if (u > 0.1 && u < 0.9) {
      const top = 1 - Math.abs((v - 0.37) / 0.23)
      c = lerp3(SEAT, SEAT_HI, clamp01(top * 0.8))
    }
  }
  const fade = 1 - smooth(0, 9, d)
  return lerp3(HALL, c, 0.35 + 0.65 * fade)
}

/** 两边的大幕：红丝绒一道道竖着的褶，靠台的那一边镶金边 */
function curtain(sc: PaintScene, x: number, y: number): Rgb {
  const left = x < sc.x0
  const inner = left ? sc.x0 - BOARD_U - x : x - sc.x1 - BOARD_U
  const fold = 0.5 + 0.5 * Math.sin(inner * 3.4 + fbm(inner * 0.5, y * 0.05, sc.seed + 31, 2) * 3)
  let c = lerp3(VELVET_LO, VELVET_HI, Math.pow(fold, 1.6) * (0.75 + 0.25 * valueNoise(x * 0.4, y * 0.2, sc.seed + 33)))
  c = lerp3(c, GILT, (1 - smooth(0.05, 0.22, inner)) * 0.9)
  return c
}

/** 画方框里的一块：地布、台板、台口与观众席、两边大幕、台后的墙；脚灯照亮台口一带 */
export function paintBackdrop(sc: PaintScene, _prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const w = rect.x1 - rect.x0
  const lamps: number[] = []
  for (let x = sc.x0 + FOOTLIGHT_STEP_U / 2; x < sc.x1; x += FOOTLIGHT_STEP_U) lamps.push(x)
  const fy = sc.y1 + BOARD_U * 0.55
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / GROUND_PPU
      const y = (py + 0.5) / GROUND_PPU
      const r = pageRoom(sc.x0, sc.x1, sc.y0, sc.y1, x, y)
      let c: Rgb
      const side = x < sc.x0 - BOARD_U || x > sc.x1 + BOARD_U
      if (r >= 0) c = cloth(sc, x, y, r)
      else if (side) c = curtain(sc, x, y)
      else if (r > -BOARD_U) c = boards(sc, x, y)
      else if (y > sc.y1) c = front(sc, x, y)
      else c = lerp3(WALL, [20, 14, 12], valueNoise(x * 0.3, y * 0.3, sc.seed + 41) * 0.5)
      // 脚灯：黄铜的灯罩，灯泡亮着；往台上照出一片暖光
      let glow = 0
      if (!side) {
        for (const lx of lamps) {
          const dx = x - lx
          const dy = y - fy
          const d = Math.hypot(dx, dy * 1.6)
          if (d < 0.28) c = d < 0.14 ? [255, 244, 210] : [170, 130, 70]
          if (dy < 0) glow += Math.exp(-(dx * dx) / 3 - (dy * dy) / 18) * 0.12
        }
      }
      // 台上的灯光：台中最亮，往外渐暗，台外更暗
      const cx = (sc.x0 + sc.x1) / 2
      const cy = (sc.y0 + sc.y1) / 2
      const pool = r >= -BOARD_U && !side ? 1.04 - 0.22 * smooth(0.3, 1.2, Math.hypot((x - cx) / (sc.x1 - sc.x0), (y - cy) / (sc.y1 - sc.y0)) * 1.6) : 0.85
      c = lerp3(c, GLOW, clamp01(glow))
      const o = ((py - rect.y0) * w + (px - rect.x0)) * 4
      out[o] = c[0] * pool
      out[o + 1] = c[1] * pool
      out[o + 2] = c[2] * pool
      out[o + 3] = 255
    }
  }
}
