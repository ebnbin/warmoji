import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { pageRoom } from './model'

/** 摊开的书在方框里的位置，格：画背景只要这些数，能整个发给画画的线程 */
export interface PaintScene {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly gx: number
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

/** 书页外一圈：底下一叠书页的纸边多宽，再外面硬壳封面多宽，格 */
export const STACK_U = 0.42
export const COVER_U = 0.62
/** 书在桌上投的影子往背光的方向挪多远、糊开多宽，格 */
const SHADOW_U = 0.7
const SHADOW_SOFT_U = 0.9
/** 书脊两边的折痕：中缝两侧多宽（格）里纸往下弯 */
const GUTTER_U = 1.6

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function lerp3(a: readonly number[], b: readonly number[], t: number): Rgb {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
}

const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const

/** 桌面：深色胡桃木 */
const WOOD_LO = [62, 36, 22] as const
const WOOD_HI = [128, 80, 46] as const
/** 封面的布面与烫金线 */
const CLOTH = [44, 72, 86] as const
const CLOTH_LO = [24, 42, 52] as const
const GILT = [214, 172, 92] as const
/** 纸的本色、泛黄的边、霉斑 */
const PAPER = [246, 238, 216] as const
const PAPER_OLD = [228, 206, 160] as const
const FOX = [196, 150, 98] as const
/** 堆起来的纸边 */
const EDGE = [234, 222, 196] as const
const EDGE_LO = [176, 160, 132] as const
/** 书脊两头的堵头布：红白相间 */
const BAND_A = [176, 42, 46] as const
const BAND_B = [236, 226, 204] as const

/** 画背景之前一次算好的：没有 */
export type Prepared = null

export function prepare(): Prepared {
  return null
}

/** 桌面：木板横着铺，木纹顺着板长，偶尔一个节疤；板缝是深色的细线 */
function desk(sc: PaintScene, x: number, y: number): Rgb {
  const plank = 3.2
  const row = Math.floor(y / plank)
  const v = (y - row * plank) / plank
  const shift = valueNoise(row * 3.1, 0.5, sc.seed) * 40
  const gx = x + shift
  const warp = fbm(gx * 0.08, y * 0.6, sc.seed + 11, 2)
  const grain = 0.5 + 0.5 * Math.sin((y * 9 + warp * 14 + valueNoise(gx * 0.5, y * 3, sc.seed + 3) * 3) * 1.3)
  const fine = valueNoise(gx * 2.5, y * 22, sc.seed + 5)
  const tone = 0.32 + 0.28 * valueNoise(row * 7.7, 1.3, sc.seed + 1) + 0.22 * grain + 0.18 * fine
  let c = lerp3(WOOD_LO, WOOD_HI, clamp01(tone))
  const seam = Math.min(v, 1 - v) * plank
  const joint = smooth(0, 0.05, seam)
  c = lerp3(c, [26, 14, 9], (1 - joint) * 0.8)
  return c
}

/** 书在桌上的影子：封面外框往背光的方向挪一点，边缘糊开 */
function bookShadow(sc: PaintScene, x: number, y: number): number {
  const m = STACK_U + COVER_U
  const r = pageRoom(sc.x0 - m, sc.x1 + m, sc.y0 - m, sc.y1 + m, x - AWAY.x * SHADOW_U, y - AWAY.y * SHADOW_U)
  return smooth(-SHADOW_SOFT_U, SHADOW_SOFT_U * 0.6, r)
}

/** 台灯的光：从左上方照过来，书那一片最亮，越往方框四角越暗 */
function lamp(sc: PaintScene, x: number, y: number): number {
  const cx = (sc.x0 + sc.x1) / 2 - 3
  const cy = (sc.y0 + sc.y1) / 2 - 4
  const d = Math.hypot((x - cx) / 30, (y - cy) / 26)
  return 1.08 - 0.55 * smooth(0.2, 1.1, d)
}

/** 纸面：纤维、颗粒、边上泛黄、几点霉斑；书脊两边往下弯进中缝，迎着灯的一侧亮、背着的一侧暗 */
function paper(sc: PaintScene, x: number, y: number): Rgb {
  const edge = pageRoom(sc.x0, sc.x1, sc.y0, sc.y1, x, y)
  const outer = Math.min(Math.abs(x - (x < sc.gx ? sc.x0 : sc.x1)), y - sc.y0, sc.y1 - y)
  const age = (1 - smooth(0, 2.4, outer)) * 0.55 + fbm(x * 0.3, y * 0.3, sc.seed + 21, 2) * 0.25
  let c = lerp3(PAPER, PAPER_OLD, clamp01(age * 0.6))
  const fox = fbm(x * 1.7, y * 1.7, sc.seed + 31, 2)
  c = lerp3(c, FOX, smooth(0.74, 0.86, fox) * 0.25 * (1 - smooth(0, 6, outer)))
  const fiber = fbm(x * 9, y * 2.2, sc.seed + 41, 2) - 0.5
  const grain = valueNoise(x * 30, y * 30, sc.seed + 51) - 0.5
  const k = 1 + fiber * 0.05 + grain * 0.04
  // 纸往中缝弯下去：坡度按离中缝的远近，法线往中缝那边歪
  const d = x - sc.gx
  const t = 1 - smooth(0, GUTTER_U, Math.abs(d))
  const slope = t * t * 1.4 * Math.sign(d)
  const nx = slope / Math.hypot(slope, 1)
  const nz = 1 / Math.hypot(slope, 1)
  const lit = (nx * -L.x + nz * L.z) / L.z
  const crease = 1 - (1 - smooth(0, 0.22, Math.abs(d))) * 0.42
  // 页边往上翘一点：外沿一窄条略暗
  const curl = 1 - (1 - smooth(0, 0.35, edge)) * 0.12
  const shade = k * (0.82 + 0.18 * lit) * crease * curl
  return [c[0] * shade, c[1] * shade, c[2] * shade]
}

/** 一叠书页的纸边：一层层的细线，越往外越暗 */
function stack(sc: PaintScene, x: number, y: number, r: number): Rgb {
  const along = x < sc.x0 || x > sc.x1 ? x : y
  const lines = 0.5 + 0.5 * Math.sin(-r * 140 + fbm(along * 0.8, r * 3, sc.seed + 61, 2) * 6)
  const c = lerp3(EDGE, EDGE_LO, clamp01(-r / STACK_U) * 0.6 + lines * 0.25)
  return c
}

/** 硬壳封面：布纹，离纸边一小段处一道烫金线 */
function cover(sc: PaintScene, x: number, y: number, r: number): Rgb {
  const weave = (Math.sin(x * 70) * Math.sin(y * 70) * 0.5 + 0.5) * 0.12 + fbm(x * 4, y * 4, sc.seed + 71, 2) * 0.25
  let c = lerp3(CLOTH_LO, CLOTH, 0.55 + weave)
  const gilt = Math.abs(-r - STACK_U - COVER_U * 0.45)
  c = lerp3(c, GILT, (1 - smooth(0.02, 0.06, gilt)) * 0.9)
  // 书脊两头：中缝上下伸出页外那一段是书脊的堵头布
  if (Math.abs(x - sc.gx) < 0.5 && (y < sc.y0 || y > sc.y1)) {
    const band = Math.floor((x - sc.gx) * 18) % 2 === 0 ? BAND_A : BAND_B
    const k = Math.abs(y < sc.y0 ? y - sc.y0 : y - sc.y1)
    if (k < STACK_U + 0.1) c = lerp3(band, [40, 20, 20], 0.15 + 0.25 * Math.abs(x - sc.gx) * 2)
  }
  return c
}

/** 画方框里的一块：桌面、书的影子、封面、一叠纸边、纸面 */
export function paintBackdrop(sc: PaintScene, _prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const w = rect.x1 - rect.x0
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / GROUND_PPU
      const y = (py + 0.5) / GROUND_PPU
      const r = pageRoom(sc.x0, sc.x1, sc.y0, sc.y1, x, y)
      let c: Rgb
      if (r >= 0) c = paper(sc, x, y)
      else if (r > -STACK_U) c = stack(sc, x, y, r)
      else if (r > -STACK_U - COVER_U) c = cover(sc, x, y, r)
      else {
        c = desk(sc, x, y)
        const s = bookShadow(sc, x, y)
        c = [c[0] * (0.45 + 0.55 * s), c[1] * (0.45 + 0.55 * s), c[2] * (0.45 + 0.55 * s)]
      }
      // 纸边与封面的外沿压一道细细的暗边
      const rim = Math.min(Math.abs(r), Math.abs(r + STACK_U), Math.abs(r + STACK_U + COVER_U))
      const line = 1 - (1 - smooth(0, 0.04, rim)) * 0.35
      const k = lamp(sc, x, y) * line
      const o = ((py - rect.y0) * w + (px - rect.x0)) * 4
      out[o] = c[0] * k
      out[o + 1] = c[1] * k
      out[o + 2] = c[2] * k
      out[o + 3] = 255
    }
  }
}
