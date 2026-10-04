import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { glyphAt, glyphOffset, glyphSegments, lineUnits, STROKE } from './font'
import { arenaRoom, boxDist, FRAME_LIP_U, FRAME_WALL_U, plateDist, segDist } from './layout'
import type { CircuitPlan, Label, Part, Plate } from './layout'
import type { CircuitConfig } from '../../types/maps'

/** 元件、线、字按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2
/** 铺铜离别的铜、焊盘与过孔留出的间隙，格 */
const POUR_GAP_U = 0.3
/** 元件本体边上的倒角多宽，格 */
const BEVEL_U = 0.16
/** 元件脚下的阴暗：离本体这么近（格）以内越近越暗 */
const AO_U = 0.45

const LX = SUN.x
const LY = SUN.y
const LZ = SUN.z
const SUN_LEN = Math.hypot(LX, LY)
const TO_SUN = { x: LX / SUN_LEN, y: LY / SUN_LEN }
/** 高 1 格的东西，影子背着太阳拖出多远（格） */
const SHX = -LX / LZ
const SHY = -LY / LZ
/** 正上方看下来时镜面反光的半程向量 */
const HL = Math.hypot(LX, LY, LZ + 1)
const HX = LX / HL
const HY = LY / HL
const HZ = (LZ + 1) / HL

/** 板面受的光：天光与正对着太阳时的阳光各多强；天光偏冷，阳光按它配成偏暖，平地照着太阳时合起来是白的 */
const AMBIENT = 0.5
const DIRECT = 0.76
const SKY = { r: 0.86, g: 0.96, b: 1.16 } as const
const warm = (sky: number): number => 1 + (AMBIENT * (1 - sky)) / (DIRECT * LZ)
const SUNLIGHT = { r: warm(SKY.r), g: warm(SKY.g), b: warm(SKY.b) } as const

type Rgb = readonly [number, number, number]
/** 阻焊层：底下没铜、底下铺着铜、底下是细线；沉金的裸铜；没盖阻焊的基材；丝印 */
const MASK: Rgb = [12, 31, 31]
const POUR: Rgb = [19, 46, 43]
const SIGNAL: Rgb = [27, 61, 55]
const GOLD: Rgb = [198, 152, 72]
const LAMINATE: Rgb = [96, 94, 64]
const SILK: Rgb = [212, 216, 204]
/** 元件：环氧封装、激光刻的字、镀锡的脚与端头、陶瓷、铝壳、铁氧体、电极 */
const EPOXY: Rgb = [30, 31, 35]
const LASER: Rgb = [88, 92, 96]
const TIN: Rgb = [176, 181, 187]
const CERAMIC: Rgb = [158, 128, 92]
const RESISTOR: Rgb = [24, 24, 27]
const ALU: Rgb = [188, 193, 199]
const FERRITE: Rgb = [56, 58, 62]
const LENS: Rgb = [196, 204, 208]
const ELECTRODE_RGB: Rgb = [184, 188, 196]
/** 屏蔽罩的钢片与它脚下的焊锡 */
const STEEL: Rgb = [146, 153, 160]
const SOLDER: Rgb = [160, 164, 168]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: CircuitConfig
  readonly plan: CircuitPlan
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

/** 地面铺满地图外 padU 格 */
export function groundArea(sc: PaintScene): Area {
  const pad = sc.cfg.padU
  return { x0: -pad, y0: -pad, w: sc.plan.size + pad * 2, h: sc.plan.size + pad * 2 }
}

/** 地面贴图的大小，像素 */
export function textureSize(sc: PaintScene): { w: number; h: number } {
  const a = groundArea(sc)
  return { w: Math.round(a.w * GROUND_PPU), h: Math.round(a.h * GROUND_PPU) }
}

/** 一段线：从 a 到 b、半宽 r（格）；dash 不为 0 时是虚线，s0 是这段起点在整条线上的弧长 */
interface Seg {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly r: number
  readonly dash: number
  readonly s0: number
}

/** 一行要画的字：丝印或元件上印的字；color 0 是丝印、1 是激光刻字、2 是白色印字 */
interface Text {
  readonly s: string
  readonly x: number
  readonly y: number
  readonly size: number
  readonly rot: 0 | 1
  readonly color: 0 | 1 | 2
}

/** 按位置分桶：键是桶的行列，值是条目的序号 */
interface Buckets {
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly map: Map<number, number[]>
}

const NONE: readonly number[] = []

function buckets(area: Area): Buckets {
  return { x0: area.x0 - BUCKET_U * 2, y0: area.y0 - BUCKET_U * 2, cols: Math.ceil(area.w / BUCKET_U) + 8, map: new Map() }
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  return bk.map.get(Math.floor((y - bk.y0) / BUCKET_U) * bk.cols + Math.floor((x - bk.x0) / BUCKET_U)) ?? NONE
}

/** 把一个外接框为 [x0, x1] × [y0, y1] 的条目记进它罩住的每一桶 */
function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let by = Math.floor((y0 - bk.y0) / BUCKET_U); by <= Math.floor((y1 - bk.y0) / BUCKET_U); by++) {
    for (let bx = Math.floor((x0 - bk.x0) / BUCKET_U); bx <= Math.floor((x1 - bk.x0) / BUCKET_U); bx++) {
      const key = by * bk.cols + bx
      let list = bk.map.get(key)
      if (!list) bk.map.set(key, (list = []))
      list.push(k)
    }
  }
}

/** 开画前准备好的东西：裸铜线、阻焊层下的细线、丝印线各自的线段，要画的字，各自分好桶 */
export interface Prepared {
  readonly exposed: readonly Seg[]
  readonly signals: readonly Seg[]
  readonly silk: readonly Seg[]
  readonly texts: readonly Text[]
  readonly exposedBk: Buckets
  readonly signalBk: Buckets
  readonly silkBk: Buckets
  readonly textBk: Buckets
  readonly partBk: Buckets
  readonly padBk: Buckets
  readonly plateBk: Buckets
  readonly viaBk: Buckets
  /** 屏蔽罩高多少格，影子最远拖出多少格 */
  readonly frameZ: number
  readonly frameReach: number
}

function lineSegs(pts: readonly { x: number; y: number }[], r: number, dash: number): Seg[] {
  const out: Seg[] = []
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r, dash, s0: s })
    s += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return out
}

function segBuckets(area: Area, segs: readonly Seg[], reach: number): Buckets {
  const bk = buckets(area)
  segs.forEach((s, k) => file(bk, k, Math.min(s.ax, s.bx) - s.r - reach, Math.min(s.ay, s.by) - s.r - reach, Math.max(s.ax, s.bx) + s.r + reach, Math.max(s.ay, s.by) + s.r + reach))
  return bk
}

/** 一行字的外接框：转过的字横竖对调 */
function textBox(t: Text): { x0: number; y0: number; x1: number; y1: number } {
  const half = (lineUnits(t.s.length) * t.size) / 12 + 0.2
  const tall = t.size * 0.75
  return t.rot === 0 ? { x0: t.x - half, y0: t.y - tall, x1: t.x + half, y1: t.y + tall } : { x0: t.x - tall, y0: t.y - half, x1: t.x + tall, y1: t.y + half }
}

/** 元件本体上印的字：芯片刻型号，电阻印阻值，电感印感值；字顺着长边，大小撑满本体的一大半 */
function bodyText(p: Part): Text | null {
  if (!p.mark || p.kind === 'electrode' || p.kind === 'can') return null
  const long = p.axis === 0 ? p.hw * 2 : p.hh * 2
  const short = p.axis === 0 ? p.hh * 2 : p.hw * 2
  const units = lineUnits(p.mark.length)
  const size = Math.min(short * (p.kind === 'ic' ? 0.26 : 0.5), ((long * 0.82) / units) * 6)
  const color = p.kind === 'ic' || p.kind === 'sot' ? 1 : 2
  return { s: p.mark, x: p.x, y: p.y, size, rot: p.axis === 0 ? 0 : 1, color }
}

export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const area = groundArea(sc)
  const exposed = plan.traces.filter((t) => t.net >= 0).flatMap((t) => lineSegs(t.pts, t.w / 2, 0))
  const signals = plan.traces.filter((t) => t.net < 0).flatMap((t) => lineSegs(t.pts, t.w / 2, 0))
  const silk: Seg[] = plan.marks.flatMap((m) => lineSegs(m.pts, m.w / 2, m.dash))
  // 高压警示：三角，里面一道闪电
  for (const w of plan.warnings) {
    const s = w.size
    const h = s * 0.866
    const tri = [
      { x: w.x, y: w.y - h * 0.62 },
      { x: w.x + s / 2, y: w.y + h * 0.38 },
      { x: w.x - s / 2, y: w.y + h * 0.38 },
      { x: w.x, y: w.y - h * 0.62 },
    ]
    const bolt = [
      { x: w.x + s * 0.06, y: w.y - h * 0.34 },
      { x: w.x - s * 0.1, y: w.y + h * 0.04 },
      { x: w.x + s * 0.1, y: w.y + h * 0.02 },
      { x: w.x - s * 0.05, y: w.y + h * 0.3 },
    ]
    silk.push(...lineSegs(tri, 0.06, 0), ...lineSegs(bolt, 0.055, 0))
  }
  // 触摸开关外圈的丝印
  for (const b of plan.buttons) {
    const r = b.r + 0.3
    const ring = Array.from({ length: 41 }, (_, i) => ({ x: b.x + Math.cos((i / 40) * Math.PI * 2) * r, y: b.y + Math.sin((i / 40) * Math.PI * 2) * r }))
    silk.push(...lineSegs(ring, 0.05, 0))
  }
  const texts: Text[] = plan.labels.map((l: Label) => ({ ...l, color: 0 as const }))
  for (const p of plan.parts) {
    const t = bodyText(p)
    if (t) texts.push(t)
  }
  const textBk = buckets(area)
  texts.forEach((t, k) => {
    const b = textBox(t)
    file(textBk, k, b.x0, b.y0, b.x1, b.y1)
  })
  // 元件按本体、焊盘与影子罩住的范围分桶
  const frameZ = sc.cfg.frame.heightMM / sc.cfg.mmPerU
  const partBk = buckets(area)
  const padBk = buckets(area)
  plan.parts.forEach((p, k) => {
    const dx = SHX * p.z
    const dy = SHY * p.z
    const soft = 0.1 + 0.04 * p.z
    file(partBk, k, Math.min(p.x - p.bw, p.x - p.hw + dx) - AO_U - soft, Math.min(p.y - p.bh, p.y - p.hh + dy) - AO_U - soft, Math.max(p.x + p.bw, p.x + p.hw + dx) + AO_U + soft, Math.max(p.y + p.bh, p.y + p.hh + dy) + AO_U + soft)
    file(padBk, k, p.x - p.bw - POUR_GAP_U - 0.1, p.y - p.bh - POUR_GAP_U - 0.1, p.x + p.bw + POUR_GAP_U + 0.1, p.y + p.bh + POUR_GAP_U + 0.1)
  })
  const plateBk = buckets(area)
  plan.plates.forEach((p, k) => file(plateBk, k, p.x0 - 1, p.y0 - 1, p.x1 + 1, p.y1 + 1))
  const viaBk = buckets(area)
  plan.vias.forEach((v, k) => file(viaBk, k, v.x - v.r - POUR_GAP_U - 0.1, v.y - v.r - POUR_GAP_U - 0.1, v.x + v.r + POUR_GAP_U + 0.1, v.y + v.r + POUR_GAP_U + 0.1))
  return {
    exposed,
    signals,
    silk,
    texts,
    exposedBk: segBuckets(area, exposed, POUR_GAP_U + 0.2),
    signalBk: segBuckets(area, signals, POUR_GAP_U + 0.2),
    silkBk: segBuckets(area, silk, 0.1),
    textBk,
    partBk,
    padBk,
    plateBk,
    viaBk,
    frameZ,
    frameReach: (frameZ * SUN_LEN) / LZ,
  }
}

/** 这一点离线段多远；虚线的空当里算作无穷远 */
function segInk(s: Seg, x: number, y: number): number {
  const ex = s.bx - s.ax
  const ey = s.by - s.ay
  const l2 = ex * ex + ey * ey || 1e-12
  const t = clamp01(((x - s.ax) * ex + (y - s.ay) * ey) / l2)
  if (s.dash > 0 && fract((s.s0 + t * Math.sqrt(l2)) / (s.dash * 2)) > 0.5) return Infinity
  return Math.hypot(x - s.ax - ex * t, y - s.ay - ey * t)
}

/** 一行字在 (x, y) 处的墨，0 到 1；aa 是半个像素（格） */
function inkAt(t: Text, x: number, y: number, aa: number): number {
  const dx = x - t.x
  const dy = y - t.y
  const lx = t.rot === 0 ? dx : -dy
  const ly = t.rot === 0 ? dy : dx
  const k = 6 / t.size
  const units = lineUnits(t.s.length)
  const gx = lx * k + units / 2
  const gy = ly * k + 3
  if (gy < -1 || gy > 7 || gx < -1 || gx > units + 1) return 0
  let best = Infinity
  const i0 = glyphAt(gx)
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    const ch = t.s[i]
    if (ch === undefined) continue
    const ox = glyphOffset(i)
    for (const s of glyphSegments(ch)) best = Math.min(best, segDist(s.ax + ox, s.ay, s.bx + ox, s.by, gx, gy))
  }
  const half = STROKE / 2
  return smooth(half + aa * k, half - aa * k, best)
}

/** 一个像素正在画的表面：反照率、法线、多金属（镜面反光多强）、多光滑 */
interface Surf {
  r: number
  g: number
  b: number
  nx: number
  ny: number
  nz: number
  metal: number
  shine: number
}

function setSurf(s: Surf, c: Rgb, k: number, metal: number, shine: number): void {
  s.r = c[0] * k
  s.g = c[1] * k
  s.b = c[2] * k
  s.nx = 0
  s.ny = 0
  s.nz = 1
  s.metal = metal
  s.shine = shine
}

function mixSurf(s: Surf, c: Rgb, a: number): void {
  s.r += (c[0] - s.r) * a
  s.g += (c[1] - s.g) * a
  s.b += (c[2] - s.b) * a
}

/** 把法线往水平方向 (hx, hy) 斜过去 k */
function tilt(s: Surf, hx: number, hy: number, k: number): void {
  const nx = hx * k
  const ny = hy * k
  const l = Math.hypot(nx, ny, 1)
  s.nx = nx / l
  s.ny = ny / l
  s.nz = 1 / l
}

/** 长方形本体的倒角：离边 BEVEL_U 以内法线朝外斜 */
function bevel(s: Surf, p: Part, x: number, y: number, depth: number): void {
  const ex = p.hw - Math.abs(x - p.x)
  const ey = p.hh - Math.abs(y - p.y)
  const e = Math.min(ex, ey)
  if (e >= BEVEL_U) return
  const k = depth * (1 - e / BEVEL_U) ** 1.5
  if (ex < ey) tilt(s, Math.sign(x - p.x), 0, k)
  else tilt(s, 0, Math.sign(y - p.y), k)
}

/** 本体顶上：返回 true 表示这一点在这个元件的本体上（包括引脚与端头），s 写好了表面 */
function partTop(sc: PaintScene, p: Part, x: number, y: number, aa: number, s: Surf): boolean {
  const seed = sc.plan.seed
  const dx = x - p.x
  const dy = y - p.y
  // 引脚：芯片本体边到焊盘之间一条镀锡的脚，弯下来的地方亮一道
  if (p.kind === 'ic' || p.kind === 'sot') {
    for (const pad of p.pads) {
      if (!pad.lead) continue
      const along = pad.nx !== 0 ? (x - p.x) * pad.nx : (y - p.y) * pad.ny
      const across = pad.nx !== 0 ? y - pad.y : x - pad.x
      const edge = pad.nx !== 0 ? p.hw : p.hh
      const tip = pad.nx !== 0 ? Math.abs(pad.x - p.x) + pad.hw * 0.55 : Math.abs(pad.y - p.y) + pad.hh * 0.55
      const half = (pad.nx !== 0 ? pad.hh : pad.hw) * 0.72
      if (along < edge - 0.02 || along > tip || Math.abs(across) > half) continue
      const u = (along - edge) / (tip - edge)
      setSurf(s, TIN, 1, 0.8, 24)
      // 脚的横截面是扁的，两侧圆一点；脚从本体伸出来先平后弯下去，弯处朝上斜
      const side = across / half
      const bend = u < 0.35 ? 0 : u < 0.7 ? -1.4 * Math.sin(((u - 0.35) / 0.35) * Math.PI) : 0
      const nx0 = pad.nx !== 0 ? pad.nx * bend * 0.6 : side * 0.9
      const ny0 = pad.nx !== 0 ? side * 0.9 : pad.ny * bend * 0.6
      tilt(s, nx0, ny0, 1)
      return true
    }
  }
  if (p.kind === 'can') {
    const r = Math.hypot(dx, dy)
    if (r > p.hw) {
      // 方形塑料底座露在铝壳外的四个角，角是斜切的
      const base = p.hw + 0.15 / sc.cfg.mmPerU
      if (Math.abs(dx) > base || Math.abs(dy) > base || Math.abs(dx) + Math.abs(dy) > base * 1.7) return false
      setSurf(s, EPOXY, 0.9, 0.05, 8)
      return true
    }
    // 铝壳顶：沿半径拉丝的纹，外缘一圈卷边，负极一侧印一片深色，中间压出十字防爆槽
    const t = r / p.hw
    const ang = Math.atan2(dy, dx)
    const brush = 0.92 + 0.1 * valueNoise(ang * 40, t * 3, seed + 31)
    setSurf(s, ALU, brush, 0.9, 30)
    if (t > 0.86) tilt(s, dx / (r || 1), dy / (r || 1), (t - 0.86) * 9)
    const neg = (dx * p.dx + dy * p.dy) / p.hw
    if (neg > 0.45 && t < 0.86) mixSurf(s, [34, 38, 52], smooth(0.45, 0.5, neg))
    const groove = Math.min(Math.abs(dx), Math.abs(dy))
    if (t < 0.55) {
      const g = smooth(0.07 + aa, 0.07 - aa, groove)
      s.r *= 1 - 0.45 * g
      s.g *= 1 - 0.45 * g
      s.b *= 1 - 0.45 * g
    }
    return true
  }
  if (Math.abs(dx) > p.hw || Math.abs(dy) > p.hh) return false
  if (p.kind === 'electrode') {
    // 电极：根部方，往尖削出两道斜面
    const along = dx * p.dx + dy * p.dy
    const across = p.dx !== 0 ? dy : dx
    const len = p.dx !== 0 ? p.hw : p.hh
    const wid = p.dx !== 0 ? p.hh : p.hw
    const taper = clamp01((along - (len - 0.45)) / 0.45)
    const half = wid * (1 - taper * 0.92)
    if (Math.abs(across) > half) return false
    setSurf(s, ELECTRODE_RGB, 0.95 + 0.08 * valueNoise(x * 9, y * 9, seed + 33), 0.85, 34)
    const side = Math.sign(across)
    if (taper > 0) tilt(s, p.dx * 0.6 + (p.dx === 0 ? side * 1.3 : 0), p.dy * 0.6 + (p.dy === 0 ? side * 1.3 : 0), 0.7)
    else bevel(s, p, x, y, 1.1)
    return true
  }
  if (p.kind === 'ic' || p.kind === 'sot') {
    // 环氧封装：很细的颗粒，四边倒角，一号脚旁边压一个小圆坑，顶上激光刻型号
    const grain = 0.94 + 0.12 * valueNoise(x * 24, y * 24, seed + 35)
    setSurf(s, EPOXY, grain, 0.12, 14)
    bevel(s, p, x, y, 1.2)
    const pin1 = p.pads[0]
    if (pin1 && p.kind === 'ic') {
      const cx = p.axis === 0 ? p.x - p.hw + 0.55 : pin1.x - pin1.nx * (Math.abs(pin1.x - p.x) - 0.55)
      const cy = p.axis === 0 ? pin1.y - pin1.ny * (Math.abs(pin1.y - p.y) - 0.55) : p.y - p.hh + 0.55
      const dd = Math.hypot(x - cx, y - cy)
      if (dd < 0.26) {
        s.r *= 0.7
        s.g *= 0.7
        s.b *= 0.7
        tilt(s, -(x - cx) / (dd || 1), -(y - cy) / (dd || 1), dd / 0.26)
      }
    }
    return true
  }
  // 两头焊的贴片件：本体两头各一截镀锡的端头
  const along = p.axis === 0 ? Math.abs(dx) : Math.abs(dy)
  const half = p.axis === 0 ? p.hw : p.hh
  const capLen = 0.3 / sc.cfg.mmPerU
  if (along > half - capLen) {
    setSurf(s, TIN, 1, 0.75, 22)
    const u = (along - (half - capLen)) / capLen
    tilt(s, p.axis === 0 ? Math.sign(dx) * u * 0.9 : 0, p.axis === 0 ? 0 : Math.sign(dy) * u * 0.9, 1)
    return true
  }
  if (p.kind === 'res') setSurf(s, RESISTOR, 1, 0.1, 10)
  else if (p.kind === 'cap') setSurf(s, CERAMIC, 0.94 + 0.08 * valueNoise(x * 14, y * 14, seed + 37), 0.08, 8)
  else if (p.kind === 'led') setSurf(s, LENS, 1, 0.5, 40)
  else setSurf(s, FERRITE, 0.9 + 0.14 * valueNoise(x * 18, y * 18, seed + 39), 0.1, 8)
  bevel(s, p, x, y, p.kind === 'coil' ? 0.9 : 0.6)
  if (p.kind === 'led') {
    // 发光管里那颗芯：一个深色的小方块和一根金线
    const ld = Math.max(Math.abs(dx), Math.abs(dy))
    if (ld < 0.22) mixSurf(s, [70, 64, 60], 0.8)
  }
  return true
}

/** 这一点落没落在某个元件的影子里：本体沿背着太阳的方向拖出去扫过的范围，影子边按高矮虚化 */
function partShadow(p: Part, x: number, y: number): number {
  const dx = SHX * p.z
  const dy = SHY * p.z
  const soft = 0.06 + 0.035 * p.z
  let best = Infinity
  for (let k = 0; k <= 6; k++) {
    const t = k / 6
    const d = p.kind === 'can' ? Math.hypot(x - p.x - dx * t, y - p.y - dy * t) - p.hw : boxDist(p.x + dx * t, p.y + dy * t, p.hw, p.hh, x, y)
    if (d < best) best = d
  }
  return smooth(soft, -soft, best)
}

/** 这一点往太阳那边看，屏蔽罩挡不挡：罩壁在 frameReach 格以内就挡住 */
function frameShadow(sc: PaintScene, prep: Prepared, x: number, y: number): number {
  const a = sc.plan.arena
  const here = arenaRoom(a, x, y)
  if (here <= 0 && here > -FRAME_WALL_U) return 0
  let shade = 0
  const step = 0.1
  for (let s = step; s <= prep.frameReach; s += step) {
    const r = arenaRoom(a, x + TO_SUN.x * s, y + TO_SUN.y * s)
    if (r <= 0 && r > -FRAME_WALL_U - 0.05) {
      shade = smooth(prep.frameReach, prep.frameReach * 0.8, s)
      break
    }
  }
  return shade
}

/** 画一块地面：先定这一点是元件、屏蔽罩还是板面，板面一层层叠上铺铜、细线、过孔、裸铜与丝印，再按太阳打光、投影、压暗罩外 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const plan = sc.plan
  const arena = plan.arena
  const seed = plan.seed
  const ppu = GROUND_PPU
  const aa = 0.5 / ppu
  const w = rect.x1 - rect.x0
  const plazaR = sc.cfg.plazaU
  const S: Surf = { r: 0, g: 0, b: 0, nx: 0, ny: 0, nz: 1, metal: 0, shine: 8 }
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const room = arenaRoom(arena, x, y)
      let onTop = false
      let ao = 1
      let shadow = 0
      // 元件：本体顶上直接画；本体外面看它的影子与脚下的阴暗
      for (const k of near(prep.partBk, x, y)) {
        const p = plan.parts[k]!
        if (!onTop && partTop(sc, p, x, y, aa, S)) {
          onTop = true
          continue
        }
        const d = p.kind === 'can' ? Math.max(Math.hypot(x - p.x, y - p.y) - p.hw, boxDist(p.x, p.y, p.bw, p.bh, x, y)) : boxDist(p.x, p.y, p.hw, p.hh, x, y)
        if (d < AO_U) ao = Math.min(ao, 1 - 0.32 * (1 - Math.max(0, d) / AO_U) ** 2)
        shadow = Math.max(shadow, partShadow(p, x, y))
      }
      if (onTop) {
        // 元件顶上的字
        for (const k of near(prep.textBk, x, y)) {
          const t = prep.texts[k]!
          if (t.color === 0) continue
          const ink = inkAt(t, x, y, aa)
          if (ink > 0) mixSurf(S, t.color === 1 ? LASER : SILK, ink * (t.color === 1 ? 0.85 : 0.9))
        }
        ao = 1
        shadow = 0
      } else if (room <= 0 && room > -FRAME_WALL_U) {
        // 屏蔽罩的罩壁顶：一条钢片，两边倒角
        const t = -room / FRAME_WALL_U
        setSurf(S, STEEL, 0.94 + 0.1 * valueNoise(x * 6, y * 6, seed + 41), 0.85, 26)
        const gx = arenaRoom(arena, x + 0.05, y) - arenaRoom(arena, x - 0.05, y)
        const gy = arenaRoom(arena, x, y + 0.05) - arenaRoom(arena, x, y - 0.05)
        const gl = Math.hypot(gx, gy) || 1
        if (t < 0.3) tilt(S, gx / gl, gy / gl, (0.3 - t) * 3)
        else if (t > 0.7) tilt(S, -gx / gl, -gy / gl, (t - 0.7) * 3)
        shadow = 0
        ao = 1
      } else {
        // 板面：阻焊层，透出底下玻纤布的经纬；铺铜区里是铺铜，离别的铜留出一圈间隙
        const fx = x / 0.5
        const fy = y / 0.5
        const weave = (Math.floor(fx) + Math.floor(fy)) & 1 ? Math.sin(Math.PI * fract(fx)) : Math.sin(Math.PI * fract(fy))
        const tone = (0.96 + 0.05 * weave * weave) * (0.95 + 0.1 * fbm(x / 3, y / 3, seed + 43, 2)) * (0.98 + 0.04 * valueNoise(x * 30, y * 30, seed + 45))
        let gap = Infinity
        let expo = Infinity
        let expoIndex = -1
        for (const k of near(prep.exposedBk, x, y)) {
          const d = segInk(prep.exposed[k]!, x, y) - prep.exposed[k]!.r
          if (d < expo) {
            expo = d
            expoIndex = k
          }
        }
        let sig = Infinity
        for (const k of near(prep.signalBk, x, y)) sig = Math.min(sig, segInk(prep.signals[k]!, x, y) - prep.signals[k]!.r)
        let pad = Infinity
        for (const k of near(prep.padBk, x, y)) for (const q of plan.parts[k]!.pads) pad = Math.min(pad, boxDist(q.x, q.y, q.hw, q.hh, x, y))
        let plate = Infinity
        let plateRef: Plate | null = null
        for (const k of near(prep.plateBk, x, y)) {
          const d = plateDist(plan.plates[k]!, x, y)
          if (d < plate) {
            plate = d
            plateRef = plan.plates[k]!
          }
        }
        let via = Infinity
        let viaIndex = -1
        for (const k of near(prep.viaBk, x, y)) {
          const v = plan.vias[k]!
          const d = Math.hypot(x - v.x, y - v.y) - v.r
          if (d < via) {
            via = d
            viaIndex = k
          }
        }
        // 触摸开关：中间一块圆金、外面一圈金环，中间隔着一圈阻焊
        let button = Infinity
        let touch = Infinity
        for (const b of plan.buttons) {
          const r = Math.hypot(x - b.x, y - b.y)
          button = Math.min(button, r - b.r)
          touch = Math.min(touch, r - b.r * 0.64, Math.abs(r - b.r * 0.92) - b.r * 0.08)
        }
        let fid = Infinity
        for (const f of plan.fiducials) fid = Math.min(fid, Math.hypot(x - f.x, y - f.y) - 0.5)
        let hole = Infinity
        for (const h of plan.holes) hole = Math.min(hole, Math.hypot(x - h.x, y - h.y) - 1.6)
        gap = Math.min(expo, sig, pad, plate, via, button, fid - 0.6, hole - 0.2)
        const pour = Math.hypot(x - plan.start.x, y - plan.start.y) < plazaR ? 0 : smooth(POUR_GAP_U - aa, POUR_GAP_U + aa, gap)
        setSurf(S, MASK, tone, 0.18, 30)
        if (pour > 0) mixSurf(S, [POUR[0] * tone, POUR[1] * tone, POUR[2] * tone], pour)
        // 阻焊层下的细线：比铺铜略亮，铜比基材高一点，朝太阳那侧的边亮一线
        if (sig < aa) {
          mixSurf(S, [SIGNAL[0] * tone, SIGNAL[1] * tone, SIGNAL[2] * tone], smooth(aa, -aa, sig))
          let sk = -1
          let sd = Infinity
          for (const k of near(prep.signalBk, x, y)) {
            const d = segInk(prep.signals[k]!, x, y) - prep.signals[k]!.r
            if (d < sd) {
              sd = d
              sk = k
            }
          }
          const sg = prep.signals[sk]
          if (sg && sd > -0.06) {
            const ex = sg.bx - sg.ax
            const ey = sg.by - sg.ay
            const l2 = ex * ex + ey * ey || 1
            const t = clamp01(((x - sg.ax) * ex + (y - sg.ay) * ey) / l2)
            const qx = x - sg.ax - ex * t
            const qy = y - sg.ay - ey * t
            const ql = Math.hypot(qx, qy) || 1
            tilt(S, qx / ql, qy / ql, (sd + 0.06) * 10)
          }
        }
        // 过孔：盖着阻焊的鼓一圈、中间凹一个小坑；露金的是一圈金、中间黑洞
        const v = plan.vias[viaIndex]
        if (v && via < aa) {
          const dd = Math.hypot(x - v.x, y - v.y)
          if (v.open) {
            setSurf(S, GOLD, 0.95, 0.9, 30)
            if (dd < v.hole + aa) mixSurf(S, [8, 9, 10], smooth(v.hole + aa, v.hole - aa, dd))
          } else {
            mixSurf(S, [SIGNAL[0] * tone, SIGNAL[1] * tone, SIGNAL[2] * tone], smooth(aa, -aa, via))
            tilt(S, (x - v.x) / (dd || 1), (y - v.y) / (dd || 1), dd < v.hole ? -0.8 * (dd / v.hole) : 0.6 * smooth(v.r * 0.6, v.r, dd))
            if (dd < v.hole) mixSurf(S, [10, 22, 22], 0.6)
          }
        }
        // 露着的铜一律沉金：带电的线、焊盘、铜板、触摸开关、基准点；铜边外阻焊开窗露出一线基材
        const metal = Math.min(expo, pad, plate, touch, fid)
        let gold = 0
        if (metal < aa) {
          gold = smooth(aa, -aa, metal)
          const brush = 0.9 + 0.12 * fbm(x * 2.5, y * 2.5, seed + 47, 2) + 0.05 * valueNoise(x * 40, y * 4, seed + 49)
          const k = gold
          S.r += (GOLD[0] * brush - S.r) * k
          S.g += (GOLD[1] * brush - S.g) * k
          S.b += (GOLD[2] * brush - S.b) * k
          S.metal = 0.9
          S.shine = 22
          // 裸铜比阻焊层薄薄高出一点：边上朝外斜
          if (metal > -0.07 && expoIndex >= 0 && metal === expo) {
            const sg = prep.exposed[expoIndex]!
            const ex = sg.bx - sg.ax
            const ey = sg.by - sg.ay
            const l2 = ex * ex + ey * ey || 1
            const t = clamp01(((x - sg.ax) * ex + (y - sg.ay) * ey) / l2)
            const qx = x - sg.ax - ex * t
            const qy = y - sg.ay - ey * t
            const ql = Math.hypot(qx, qy) || 1
            tilt(S, qx / ql, qy / ql, (metal + 0.07) * 9)
          } else if (metal > -0.07 && plateRef && metal === plate) {
            const gx = plateDist(plateRef, x + 0.03, y) - plateDist(plateRef, x - 0.03, y)
            const gy = plateDist(plateRef, x, y + 0.03) - plateDist(plateRef, x, y - 0.03)
            const gl = Math.hypot(gx, gy) || 1
            tilt(S, gx / gl, gy / gl, (metal + 0.07) * 9)
          }
          // 焊盘上有引脚压着的那头，焊锡把脚包住
          if (metal === pad) {
            for (const k2 of near(prep.padBk, x, y)) {
              for (const q of plan.parts[k2]!.pads) {
                if (boxDist(q.x, q.y, q.hw, q.hh, x, y) > 0) continue
                const along = q.nx !== 0 ? (x - q.x) * q.nx : (y - q.y) * q.ny
                const len = q.nx !== 0 ? q.hw : q.hh
                const solder = smooth(len * 0.9, -len * 0.2, along)
                if (q.lead || plan.parts[k2]!.kind !== 'electrode') mixSurf(S, SOLDER, solder * 0.7)
              }
            }
          }
        } else if (metal < 0.06) {
          const ring = smooth(0.06, 0, metal)
          mixSurf(S, LAMINATE, ring * 0.35)
        }
        // 基准点周围一圈不盖阻焊，露出基材
        if (fid > aa && fid < 0.6) mixSurf(S, LAMINATE, smooth(0.6, 0.55, fid) * 0.9)
        // 安装孔：一圈金，中间透过孔看到板子底下的黑
        if (hole < 0.1) {
          const dd = hole + 1.6
          setSurf(S, GOLD, 0.9, 0.9, 26)
          if (dd < 1.05) setSurf(S, [6, 7, 8], 1, 0, 4)
        }
        // 丝印：开窗的铜上不印
        if (gold < 0.5) {
          let ink = 0
          for (const k of near(prep.silkBk, x, y)) {
            const sg = prep.silk[k]!
            ink = Math.max(ink, smooth(sg.r + aa, sg.r - aa, segInk(sg, x, y)))
          }
          for (const k of near(prep.textBk, x, y)) {
            const t = prep.texts[k]!
            if (t.color !== 0) continue
            ink = Math.max(ink, inkAt(t, x, y, aa))
          }
          if (ink > 0) {
            const speck = 0.9 + 0.1 * valueNoise(x * 50, y * 50, seed + 51)
            mixSurf(S, [SILK[0] * speck, SILK[1] * speck, SILK[2] * speck], ink * 0.92)
            S.metal = 0.05
          }
        }
        // 屏蔽罩外脚：焊在一圈金上，焊锡一坨一坨
        if (room <= -FRAME_WALL_U && room > -FRAME_WALL_U - FRAME_LIP_U) {
          const blob = valueNoise((x + y) * 3, (x - y) * 3, seed + 53)
          setSurf(S, blob > 0.45 ? SOLDER : GOLD, 0.92 + 0.1 * blob, 0.85, 24)
        }
        if (Math.abs(room) < prep.frameReach + FRAME_WALL_U + 0.2) shadow = Math.max(shadow, frameShadow(sc, prep, x, y))
        if (room > 0 && room < 0.5) ao = Math.min(ao, 1 - 0.3 * (1 - room / 0.5) ** 2)
        if (room < -FRAME_WALL_U - FRAME_LIP_U && room > -FRAME_WALL_U - FRAME_LIP_U - 0.4) ao = Math.min(ao, 1 - 0.25 * (1 - (-room - FRAME_WALL_U - FRAME_LIP_U) / 0.4) ** 2)
      }
      // 光：天光按朝天的程度，阳光按朝太阳的程度、挨着影子只剩天光；金属另有一点镜面反光；罩外压暗
      const lambert = Math.max(0, S.nx * LX + S.ny * LY + S.nz * LZ)
      const sky = AMBIENT * (0.75 + 0.25 * S.nz) * ao
      const sun = DIRECT * lambert * (1 - 0.82 * shadow) * ao
      const spec = S.metal * Math.max(0, S.nx * HX + S.ny * HY + S.nz * HZ) ** S.shine * (1 - shadow) * 120
      const far = room < 0 ? 1 - 0.42 * smooth(0.4, 7, -room) : 1
      out[o] = (S.r * (sky * SKY.r + sun * SUNLIGHT.r) + spec) * far
      out[o + 1] = (S.g * (sky * SKY.g + sun * SUNLIGHT.g) + spec * 0.97) * far
      out[o + 2] = (S.b * (sky * SKY.b + sun * SUNLIGHT.b) + spec * 0.9) * far
      out[o + 3] = 255
    }
  }
}
