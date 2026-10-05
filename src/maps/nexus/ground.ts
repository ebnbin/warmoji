import { AWAY } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { boxDist, hallRoom } from './layout'
import { HATCH_R_U } from './marks'
import type { NexusPlan } from './layout'
import type { NexusConfig } from '../../types/maps'

/** 幕墙多厚、外面那一道檐口多宽，格 */
export const WALL_U = 0.16
const LEDGE_U = 0.5
/** 玻璃地面一块多长（沿墙），格；玻璃与瓷砖之间那条金属收边多宽 */
const PANE_U = 2
const TRIM_U = 0.07
/** 瓷砖缝多宽、缝边的倒角多宽，格 */
const GROUT_U = 0.035
const BEVEL_U = 0.05
/** 每隔这么多块瓷砖嵌一条灯带 */
const STRIP_EVERY = 6
const STRIP_U = 0.03
/** 立柱、电梯井的影子往背光一侧拖多远，全息台的多远，格；脚下的阴暗多宽 */
const TALL_SHADOW_U = 1.1
const LOW_SHADOW_U = 0.45
const AO_U = 0.5

type Rgb = readonly [number, number, number]
/** 哑光的浅灰瓷砖、缝里的暗灰；嵌在地里的灯带与厅心的光环是冷蓝 */
const TILE: Rgb = [226, 231, 238]
const GROUT: Rgb = [176, 184, 196]
const STRIP: Rgb = [128, 188, 255]
const INLAY: Rgb = [96, 160, 255]
/** 玻璃地面透出的冷色、玻璃的分格框、金属收边 */
const GLASS: Rgb = [150, 220, 255]
const FRAME: Rgb = [214, 222, 232]
const TRIM: Rgb = [188, 198, 210]
/** 幕墙的竖梃与外面那一道檐口 */
const MULLION: Rgb = [236, 242, 248]
const LEDGE: Rgb = [70, 84, 104]
/** 立柱是白的，脚下一圈蓝光 */
const PILLAR: Rgb = [244, 247, 250]
const PILLAR_RING: Rgb = [90, 170, 255]
/** 电梯井的顶：深色玻璃，浅色的框，门框发蓝光 */
const CORE_TOP: Rgb = [34, 46, 64]
const CORE_FRAME: Rgb = [206, 214, 224]
const DOOR_LIGHT: Rgb = [80, 180, 255]
/** 全息台：白边，深色玻璃台面，青色的发射环 */
const PED_RIM: Rgb = [240, 244, 248]
const PED_TOP: Rgb = [30, 46, 66]
const PED_RING: Rgb = [90, 232, 255]
/** 检修口：金属盖板，通风缝，黄黑的警示边 */
const HATCH: Rgb = [176, 186, 198]
const VENT: Rgb = [70, 78, 90]
const WARN: Rgb = [255, 196, 40]
const WARN_DARK: Rgb = [40, 40, 44]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const fract = (v: number): number => v - Math.floor(v)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: NexusConfig
  readonly plan: NexusPlan
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

/** 地面铺满方框，贴图的大小，像素 */
export function textureSize(): { w: number; h: number } {
  return { w: FRAME_U * GROUND_PPU, h: FRAME_U * GROUND_PPU }
}

/** 一点的颜色与不透明度，按 0 到 255 */
interface Px {
  r: number
  g: number
  b: number
  a: number
}

function set(p: Px, c: Rgb, k = 1): void {
  p.r = c[0] * k
  p.g = c[1] * k
  p.b = c[2] * k
}

function mix(p: Px, c: Rgb, t: number): void {
  p.r += (c[0] - p.r) * t
  p.g += (c[1] - p.g) * t
  p.b += (c[2] - p.b) * t
}

/** 点到全部障碍（立柱、全息台、电梯井）的有符号距离（格，里面为负）与那一处有多高：0 矮、1 顶到天花板 */
function fixtureAt(plan: NexusPlan, x: number, y: number): { d: number; tall: boolean } {
  let d = Infinity
  let tall = false
  for (const q of plan.pillars) {
    const e = Math.hypot(x - q.x, y - q.y) - q.r
    if (e < d) {
      d = e
      tall = true
    }
  }
  for (const q of plan.pedestals) {
    const e = Math.hypot(x - q.x, y - q.y) - q.r
    if (e < d) {
      d = e
      tall = false
    }
  }
  for (const c of plan.cores) {
    const out = boxDist(c.x0, c.y0, c.x1, c.y1, x, y)
    const e = out > 0 ? out : -Math.min(x - c.x0, c.x1 - x, y - c.y0, c.y1 - y)
    if (e < d) {
      d = e
      tall = true
    }
  }
  return { d, tall }
}

/** 地上的影子与脚下的阴暗：背光一侧挪过去的障碍罩住这一点就暗，越贴着障碍越暗；0 是不暗。near 是这一点到障碍的距离（格） */
function shade(plan: NexusPlan, x: number, y: number, near: number): number {
  if (near > TALL_SHADOW_U + 0.8) return 0
  const ao = 0.22 * (1 - smooth(0, AO_U, near))
  let shadow = 0
  for (const [len, tall] of [
    [TALL_SHADOW_U, true],
    [LOW_SHADOW_U, false],
  ] as const) {
    const f = fixtureAt(plan, x - AWAY.x * len, y - AWAY.y * len)
    if (f.tall !== tall) continue
    shadow = Math.max(shadow, 0.2 * (1 - smooth(-0.15, 0.55, f.d)))
  }
  return Math.min(0.4, ao + shadow)
}

/** 瓷砖：每块的色调略有不同，四边一道浅缝带倒角，每隔几块缝里嵌一条灯带；厅心一圈嵌着光环 */
function tile(p: Px, sc: PaintScene, x: number, y: number, aa: number): void {
  const plan = sc.plan
  const seed = plan.seed
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = x - i
  const fy = y - j
  const tone = 0.985 + 0.03 * valueNoise(i, j, seed) + 0.012 * (valueNoise(x * 9, y * 9, seed + 7) - 0.5)
  // 天花板的灯一格格照下来，地上一片片微微亮一点
  const pool = 0.985 + 0.03 * smooth(0.5, 0, Math.hypot(fract((x - plan.start.x) / STRIP_EVERY) - 0.5, fract((y - plan.start.y) / STRIP_EVERY) - 0.5))
  set(p, TILE, tone * pool)
  const ex = Math.min(fx, 1 - fx)
  const ey = Math.min(fy, 1 - fy)
  const edge = Math.min(ex, ey)
  // 倒角：左上两边迎光亮一点，右下两边暗一点
  if (edge < BEVEL_U + GROUT_U) {
    const lit = fx < 0.5 && ex === edge ? 1 : fy < 0.5 && ey === edge ? 1 : -1
    const k = 1 - smooth(GROUT_U, GROUT_U + BEVEL_U, edge)
    p.r *= 1 + 0.035 * lit * k
    p.g *= 1 + 0.035 * lit * k
    p.b *= 1 + 0.035 * lit * k
  }
  const grout = 1 - smooth(GROUT_U - aa, GROUT_U + aa, edge)
  if (grout > 0) {
    // 每隔几块的缝里嵌一条冷蓝的灯带，从厅心起算
    const sx = Math.abs(Math.round(x - plan.start.x)) % STRIP_EVERY === 0 && ex < STRIP_U + aa
    const sy = Math.abs(Math.round(y - plan.start.y)) % STRIP_EVERY === 0 && ey < STRIP_U + aa
    mix(p, sx || sy ? STRIP : GROUT, grout)
  }
  // 厅心的光环与环上的刻度
  const r = Math.hypot(x - plan.start.x, y - plan.start.y)
  const rings = [sc.cfg.plazaU - 1.6, sc.cfg.plazaU - 1.2]
  for (const R of rings) {
    const k = 1 - smooth(0.025 - aa, 0.025 + aa, Math.abs(r - R))
    if (k > 0) mix(p, INLAY, k * 0.9)
  }
  const a = Math.atan2(y - plan.start.y, x - plan.start.x)
  const tick = Math.abs(fract(a / (Math.PI / 12)) - 0.5) * (Math.PI / 12) * r
  if (r > rings[1]! && r < rings[1]! + 0.3 && tick < 0.025 + aa) mix(p, INLAY, 0.8)
}

/** 玻璃地面：透出底下的城市，沿墙一块块分格，靠里那一道金属收边 */
function glassFloor(p: Px, sc: PaintScene, x: number, y: number, room: number, aa: number): void {
  const g = sc.cfg.glassU
  set(p, GLASS)
  p.a = 255 * (0.16 + 0.12 * smooth(g, 0, room))
  // 分格：沿墙每 PANE_U 一道框，按到厅心的方向切
  const cx = sc.plan.start.x
  const cy = sc.plan.start.y
  const along = Math.abs(x - cx) > Math.abs(y - cy) ? y : x
  if (Math.abs(fract(along / PANE_U) - 0.5) * PANE_U > PANE_U / 2 - 0.03 - aa) {
    set(p, FRAME)
    p.a = 235
  }
  if (room > g - TRIM_U) {
    set(p, TRIM)
    p.a = 255
  }
}

/** 幕墙：窄窄一道亮的竖梃线，里侧一道细细的反光 */
function curtain(p: Px, room: number): void {
  set(p, MULLION)
  p.a = 255 * (0.82 + 0.18 * smooth(-WALL_U, 0, room))
}

/** 立柱的顶：白的，迎光一侧亮，边上一道暗线，里面一圈蓝光 */
function pillarTop(p: Px, d: number, r: number, nx: number, ny: number, aa: number): void {
  const lit = 1 + 0.06 * (-nx * AWAY.x - ny * AWAY.y)
  set(p, PILLAR, lit)
  if (d > -0.05) mix(p, GROUT, 1 - smooth(-0.05, -0.02, d))
  const ring = Math.abs(d + r * 0.3)
  if (ring < 0.03 + aa) mix(p, PILLAR_RING, 0.85)
}

/** 全息台的顶：白边、深色玻璃台面、青色的发射环与正中的透镜 */
function pedestalTop(p: Px, d: number, r: number, aa: number): void {
  if (d > -0.12) {
    set(p, PED_RIM)
    return
  }
  set(p, PED_TOP)
  const rr = d + r
  if (Math.abs(rr - r * 0.55) < 0.035 + aa) mix(p, PED_RING, 0.95)
  if (rr < 0.12) mix(p, PED_RING, 0.7)
}

/** 电梯井的顶：浅色的框围着深色玻璃，玻璃上细格子；朝厅里那一面的两扇门框发蓝光 */
function coreTop(p: Px, sc: PaintScene, x: number, y: number, aa: number): boolean {
  for (const c of sc.plan.cores) {
    if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) continue
    const inset = Math.min(x - c.x0, c.x1 - x, y - c.y0, c.y1 - y)
    if (inset < 0.22) {
      set(p, CORE_FRAME)
    } else {
      set(p, CORE_TOP)
      const gx = Math.abs(fract(x * 2) - 0.5)
      const gy = Math.abs(fract(y * 2) - 0.5)
      if (gx > 0.47 || gy > 0.47) mix(p, CORE_FRAME, 0.12)
    }
    const half = sc.cfg.cores.doorU / 2
    for (const d of c.doors) {
      const along = c.nx !== 0 ? Math.abs(y - d.y) : Math.abs(x - d.x)
      const depth = c.nx !== 0 ? (x - d.x) * -c.nx : (y - d.y) * -c.ny
      if (along < half && depth >= 0 && depth < 0.3) {
        set(p, along > half - 0.08 || depth < 0.06 ? DOOR_LIGHT : CORE_FRAME, along > half - 0.08 || depth < 0.06 ? 1 : 0.92)
        if (along < 0.04 + aa) mix(p, VENT, 0.6)
      }
    }
    p.a = 255
    return true
  }
  return false
}

/** 检修口：盖板上几道通风缝，四周一圈黄黑相间的警示边，四角的螺栓 */
function hatch(p: Px, x: number, y: number, hx: number, hy: number, aa: number): void {
  const fx = x - hx
  const fy = y - hy
  const e = Math.min(fx, 1 - fx, fy, 1 - fy)
  const inner = 0.5 - HATCH_R_U
  if (e < inner) return
  set(p, HATCH)
  if (e < inner + 0.1) {
    const stripe = fract((fx + fy) * 6) < 0.5
    set(p, stripe ? WARN : WARN_DARK)
  } else {
    const slot = fy > 0.3 && fy < 0.7 && Math.abs(fract(fx * 6) - 0.5) < 0.16 && fx > 0.22 && fx < 0.78
    if (slot) set(p, VENT)
    for (const [bx, by] of [
      [0.24, 0.24],
      [0.76, 0.24],
      [0.24, 0.76],
      [0.76, 0.76],
    ]) {
      if (Math.hypot(fx - bx!, fy - by!) < 0.035 + aa) set(p, VENT)
    }
  }
}

/**
 * 画一块地面：幕墙外透明，透出城市；幕墙是一道亮线，外面一道深色的檐口；贴墙一圈玻璃地面半透明；
 * 里面是一格一块的哑光瓷砖，立柱、全息台、电梯井的顶直接画，地上压着它们的影子与脚下的阴暗；检修口替掉那一格瓷砖
 */
export function paintGround(sc: PaintScene, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const hall = plan.hall
  const ppu = GROUND_PPU
  const aa = 0.5 / ppu
  const w = rect.x1 - rect.x0
  const p: Px = { r: 0, g: 0, b: 0, a: 255 }
  const hatches = new Set(plan.hatches.map((h) => h.y * FRAME_U + h.x))
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const room = hallRoom(hall, x, y)
      p.a = 255
      if (room < -WALL_U - LEDGE_U) {
        out[o + 3] = 0
        continue
      }
      if (room < -WALL_U) {
        set(p, LEDGE, 0.9 + 0.1 * smooth(-WALL_U - LEDGE_U, -WALL_U, room))
      } else if (room < 0) {
        curtain(p, room)
      } else if (!coreTop(p, sc, x, y, aa)) {
        const f = fixtureAt(plan, x, y)
        if (f.d < 0) {
          const pillar = plan.pillars.find((q) => Math.hypot(x - q.x, y - q.y) < q.r)
          if (pillar) {
            const l = Math.hypot(x - pillar.x, y - pillar.y) || 1
            pillarTop(p, f.d, pillar.r, (x - pillar.x) / l, (y - pillar.y) / l, aa)
          } else {
            const ped = plan.pedestals.find((q) => Math.hypot(x - q.x, y - q.y) < q.r)!
            pedestalTop(p, f.d, ped.r, aa)
          }
        } else {
          if (room < sc.cfg.glassU) glassFloor(p, sc, x, y, room, aa)
          else {
            tile(p, sc, x, y, aa)
            const i = Math.floor(x)
            const j = Math.floor(y)
            if (hatches.has(j * FRAME_U + i)) hatch(p, x, y, i, j, aa)
            // 立柱脚下一圈蓝光
            for (const q of plan.pillars) {
              const d = Math.hypot(x - q.x, y - q.y) - q.r
              if (d < 0.14) mix(p, PILLAR_RING, 0.55 * (1 - smooth(0.02, 0.14, d)))
            }
          }
          const s = shade(plan, x, y, f.d)
          p.r *= 1 - s
          p.g *= 1 - s
          p.b *= 1 - s
          if (p.a < 255) p.a = Math.min(255, p.a + s * 255)
        }
      }
      out[o] = p.r
      out[o + 1] = p.g
      out[o + 2] = p.b
      out[o + 3] = p.a
    }
  }
}
