import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U, UNIT } from '../../util/units'
import { roomAt } from '../basin'
import { fixtureRoom, toLocal } from './layout'
import type { Fixture, Track, TransitPlan } from './layout'
import type { TransitConfig } from '../../types/maps'

/** 站台的石材：沿轨道多长、横过多宽（格），缝多宽 */
const TILE_U = { u: 1.6, v: 0.8 } as const
const SEAM_U = 0.035
/** 站台边：车边的金属包边、灯槽、盲道多宽（格），盲道上的圆点隔多远、多大 */
const LIP_U = 0.07
const SLOT_U = 0.1
const DOT_U = 0.16
const DOT_R = 0.045
/** 道床：导向槽离中线多远、多宽，线路色的边线离中线多远，伸缩缝与嵌灯隔多远（格） */
const GUIDE_AT = 0.74
const GUIDE_W = 0.24
const STRIPE_AT = 1.04
const JOINT_U = 3
/** 隧道口：口沿往隧道里暗下去的那一段多长（格） */
const MOUTH_U = 1.4
/** 柱子与站厅边的墙投下的影子多长（格） */
const PILLAR_SHADOW_U = 2.2
const WALL_SHADOW_U = 0.9
/** 天窗投在亮面石材上的倒影：天窗的格子多长（格） */
const SKY_PANE_U = 3.2
/** 检票口一侧的墙多厚，玻璃栏板多厚，扶梯往下伸多长（格） */
const WALL_U = 0.5
const RAIL_U = 0.14
const STAIR_U = 5
/** 线路号写多高（格） */
const NUMERAL_U = 1.15

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function set(o: Rgb, r: number, g: number, b: number): void {
  o[0] = r
  o[1] = g
  o[2] = b
}
function mixTo(o: Rgb, r: number, g: number, b: number, k: number): void {
  if (k <= 0) return
  o[0] += (r - o[0]) * k
  o[1] += (g - o[1]) * k
  o[2] += (b - o[2]) * k
}
function scale(o: Rgb, k: number): void {
  o[0] *= k
  o[1] *= k
  o[2] *= k
}
function rgbOf(c: number): Rgb {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255]
}

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: TransitConfig
  readonly plan: TransitPlan
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** ground 是压在一切下面的地面，cover 是盖在列车上面的隧道口与两头的站房顶 */
export type PaintLayer = 'ground' | 'cover'

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

/** 地面与盖子都铺满方框 */
export function textureSize(): { w: number; h: number } {
  const n = Math.round(FRAME_U * GROUND_PPU)
  return { w: n, h: n }
}

/** 一段笔画，世界坐标（格） */
interface Seg {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
}

/** 一处要写的线路号：笔画、粗细、颜色，外接框（格） */
interface Numeral {
  readonly segs: readonly Seg[]
  readonly w: number
  readonly color: Rgb
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 七段式的数字：字高 2、字宽 1，原点在字心 */
const DIGIT: Readonly<Record<number, readonly (readonly [number, number, number, number])[]>> = {
  1: [[0.1, -1, 0.1, 1], [-0.4, -0.55, 0.1, -1]],
  2: [[-0.5, -1, 0.5, -1], [0.5, -1, 0.5, 0], [0.5, 0, -0.5, 0], [-0.5, 0, -0.5, 1], [-0.5, 1, 0.5, 1]],
  3: [[-0.5, -1, 0.5, -1], [0.5, -1, 0.5, 1], [-0.3, 0, 0.5, 0], [-0.5, 1, 0.5, 1]],
}

function numeral(n: number, x: number, y: number, size: number, w: number, color: number): Numeral {
  const k = size / 2
  const segs = (DIGIT[n] ?? []).map(([ax, ay, bx, by]) => ({ ax: x + ax * k, ay: y + ay * k, bx: x + bx * k, by: y + by * k }))
  return { segs, w, color: rgbOf(color), x0: x - k - w, y0: y - k - w, x1: x + k + w, y1: y + k + w }
}

function segDist(s: Seg, x: number, y: number): number {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((x - s.ax) * dx + (y - s.ay) * dy) / l2) : 0
  return Math.hypot(x - s.ax - dx * t, y - s.ay - dy * t)
}

/** 画之前一次算好的：道床上与隧道口上的线路号，站厅在世界里的外框（格） */
export interface Prepared {
  readonly bed: readonly Numeral[]
  readonly roof: readonly Numeral[]
  readonly hall: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
}

export function prepare(sc: PaintScene): Prepared {
  const p = sc.plan
  const at = (u: number, v: number): { x: number; y: number } => (p.horiz ? { x: u, y: v } : { x: v, y: u })
  const bed: Numeral[] = []
  const roof: Numeral[] = []
  for (const t of p.tracks) {
    for (const [u, k] of [[p.u0 + 1.5, -1], [p.u1 - 1.5, 1]] as const) {
      const q = at(u, t.v)
      bed.push(numeral(t.label, q.x, q.y, NUMERAL_U, 0.11, t.color))
      const r = at(u + k * 4.4, t.v)
      roof.push(numeral(t.label, r.x, r.y, 0.9, 0.12, 0xffffff))
    }
  }
  const a = at(p.u0, p.v0)
  const b = at(p.u1, p.v1)
  return { bed, roof, hall: { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) } }
}

/** 写在 (x, y) 上的线路号盖住多少：笔画中线半个笔宽以内 */
function ink(list: readonly Numeral[], x: number, y: number, aa: number): { k: number; n: Numeral | null } {
  for (const n of list) {
    if (x < n.x0 || x > n.x1 || y < n.y0 || y > n.y1) continue
    let d = Infinity
    for (const s of n.segs) d = Math.min(d, segDist(s, x, y))
    const k = 1 - smooth(n.w / 2 - aa, n.w / 2 + aa, d)
    if (k > 0) return { k, n }
  }
  return { k: 0, n: null }
}

/** 朝着太阳的单位向量（地面上的分量与竖直分量） */
const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const

/** 一块石材的颜色：冷白，每块深浅略有不同，带一点淡淡的石纹；缝是浅灰的 */
function stone(u: number, v: number, aa: number, o: Rgb): void {
  const row = Math.floor(v / TILE_U.v)
  const su = u + (row % 2 === 0 ? 0 : TILE_U.u / 2)
  const col = Math.floor(su / TILE_U.u)
  const fu = su - col * TILE_U.u
  const fv = v - row * TILE_U.v
  const tone = 1 + (valueNoise(col * 7.13, row * 3.71, 17) - 0.5) * 0.035
  const vein = fbm(u * 0.9 + col * 3.1, v * 2.6 + row, 41, 3)
  const streak = smooth(0.62, 0.7, vein) * (1 - smooth(0.7, 0.78, vein)) * 0.05
  set(o, 236 * tone, 239 * tone, 242 * tone)
  scale(o, 1 - streak)
  const seam = Math.min(fu, TILE_U.u - fu, fv, TILE_U.v - fv)
  mixTo(o, 204, 209, 215, 1 - smooth(SEAM_U / 2 - aa, SEAM_U / 2 + aa, seam))
}

/** 站台边，d 是离道床边多远（格）：车边一道金属包边、一条灯槽，再往里是一道盲道，凸起的圆点朝着太阳的一侧亮 */
function edgeStrip(u: number, d: number, aa: number, o: Rgb): void {
  if (d < LIP_U) {
    const k = d / LIP_U
    set(o, 168 + 40 * k, 175 + 40 * k, 184 + 40 * k)
    return
  }
  if (d < LIP_U + SLOT_U) {
    const k = Math.abs((d - LIP_U) / SLOT_U - 0.5) * 2
    set(o, 58 + 30 * k, 66 + 30 * k, 78 + 30 * k)
    return
  }
  set(o, 224, 226, 228)
  const fu = ((u % DOT_U) + DOT_U) % DOT_U - DOT_U / 2
  const fd = (((d - LIP_U - SLOT_U) % DOT_U) + DOT_U) % DOT_U - DOT_U / 2
  const r = Math.hypot(fu, fd)
  if (r < DOT_R + aa) {
    const cover = 1 - smooth(DOT_R - aa, DOT_R + aa, r)
    const lit = (fu * L.x + fd * L.y) / DOT_R
    mixTo(o, 246, 247, 248, cover * clamp01(0.5 - 0.6 * lit))
    mixTo(o, 186, 190, 196, cover * clamp01(0.5 + 0.6 * lit) * 0.8)
  }
}

/** 道床：光洁的浅灰水泥面，两道嵌在地里的导向槽，伸缩缝与中线上的小嵌灯；贴着站台边的地方被站台的檐口压暗，最外一道线路色的边线 */
function trackBed(t: Track, u: number, dv: number, half: number, aa: number, o: Rgb, x: number, y: number): void {
  const grain = 1 + (fbm(x * 1.7, y * 1.7, 303, 3) - 0.5) * 0.06
  set(o, 182 * grain, 188 * grain, 196 * grain)
  const ad = Math.abs(dv)
  if (ad < GUIDE_AT - GUIDE_W / 2) {
    mixTo(o, 196, 202, 210, 0.6)
    const j = ((u % JOINT_U) + JOINT_U) % JOINT_U
    const jd = Math.min(j, JOINT_U - j)
    mixTo(o, 120, 128, 138, 1 - smooth(0.02 - aa, 0.02 + aa, jd))
    const lamp = Math.hypot(j - JOINT_U / 2, dv)
    if (lamp < 0.11) {
      mixTo(o, 70, 78, 90, 1 - smooth(0.07 - aa, 0.07 + aa, lamp))
      mixTo(o, 220, 228, 236, Math.exp(-(((lamp - 0.085) / 0.012) ** 2)) * 0.8)
    }
  }
  const g = Math.abs(ad - GUIDE_AT)
  if (g < GUIDE_W / 2 + aa) {
    const cover = 1 - smooth(GUIDE_W / 2 - aa, GUIDE_W / 2 + aa, g)
    const inner = (ad - GUIDE_AT) / (GUIDE_W / 2)
    const shade = 46 + 22 * clamp01(0.5 + 0.5 * inner * Math.sign(dv) * (L.y + L.x))
    mixTo(o, shade, shade + 6, shade + 14, cover)
    mixTo(o, 238, 242, 246, cover * Math.exp(-(((g - GUIDE_W / 2 + 0.02) / 0.012) ** 2)) * 0.9)
    const coil = ((u * 2.5) % 1 + 1) % 1
    mixTo(o, 110, 96, 70, cover * smooth(0.45, 0.5, coil) * (1 - smooth(0.5, 0.55, coil)) * 0.35)
  }
  const sd = Math.abs(ad - STRIPE_AT)
  const [r, gg, b] = rgbOf(t.color)
  mixTo(o, r, gg, b, (1 - smooth(0.05 - aa, 0.05 + aa, sd)) * 0.85)
  const under = half - ad
  scale(o, 1 - 0.32 * Math.exp(-under / 0.14))
}

/** 圆柱：从上往下看是一圈白色的柱顶，按太阳的方向打光，柱脚一圈金属的底座 */
function pillar(f: Extract<Fixture, { kind: 'pillar' }>, du: number, dv: number, horiz: boolean, aa: number, o: Rgb): boolean {
  const r = Math.hypot(du, dv)
  if (r > f.r + 0.1 + aa) return false
  const nx = (horiz ? du : dv) / f.r
  const ny = (horiz ? dv : du) / f.r
  if (r > f.r) {
    mixTo(o, 178, 186, 196, 1 - smooth(f.r + 0.1 - aa, f.r + 0.1 + aa, r))
    return true
  }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  const lit = 0.72 + 0.28 * clamp01(nx * L.x + ny * L.y + nz * L.z)
  set(o, 250 * lit, 251 * lit, 252 * lit)
  mixTo(o, 210, 216, 224, smooth(f.r * 0.82, f.r, r) * 0.5)
  return true
}

/** 候车座椅：两头深灰的金属架，中间几条暖色的木条，靠背一侧压一道深一点的靠背 */
function bench(f: Extract<Fixture, { kind: 'bench' }>, du: number, dv: number, aa: number, o: Rgb): boolean {
  const hu = f.len / 2
  const hv = f.dep / 2
  if (Math.abs(du) > hu + aa || Math.abs(dv) > hv + aa) return false
  const cover = (1 - smooth(hu - aa, hu + aa, Math.abs(du))) * (1 - smooth(hv - aa, hv + aa, Math.abs(dv)))
  const t = (dv + hv) / f.dep
  const backSide = f.back === 0 ? Math.abs(t - 0.5) < 0.09 : f.back < 0 ? t < 0.24 : t > 0.76
  let c: Rgb = [214, 176, 128]
  if (Math.abs(du) > hu - 0.12) c = [92, 100, 112]
  else if (backSide) c = [150, 120, 88]
  else {
    const slat = (t * 5) % 1
    if (slat < 0.14) c = [130, 104, 76]
    c = [c[0] * (0.94 + 0.06 * Math.sin(du * 9)), c[1] * (0.94 + 0.06 * Math.sin(du * 9)), c[2]]
  }
  mixTo(o, c[0], c[1], c[2], cover)
  return true
}

/** 全息时刻表的底座：一圈金属，中间一块深色的玻璃，玻璃里一圈发青的投影口 */
function kiosk(f: Extract<Fixture, { kind: 'kiosk' }>, du: number, dv: number, aa: number, o: Rgb): boolean {
  const r = Math.hypot(du, dv)
  if (r > f.r + aa) return false
  mixTo(o, 200, 208, 216, 1 - smooth(f.r - aa, f.r + aa, r))
  if (r < f.r * 0.78) {
    set(o, 34, 42, 54)
    mixTo(o, 90, 222, 236, Math.exp(-(((r - f.r * 0.5) / 0.035) ** 2)) * 0.9)
    mixTo(o, 160, 240, 248, Math.exp(-((r / 0.08) ** 2)) * 0.6)
  }
  return true
}

/** 设施投在地上的影子：柱子顺着太阳拖出长影，矮的座椅与底座只在背光一侧压一点 */
function fixtureShadow(f: Fixture, u: number, v: number, horiz: boolean): number {
  const ax = horiz ? AWAY.x : AWAY.y
  const ay = horiz ? AWAY.y : AWAY.x
  if (f.kind === 'pillar') {
    const du = u - f.u
    const dv = v - f.v
    const along = du * ax + dv * ay
    if (along < 0 || along > PILLAR_SHADOW_U + f.r) return 0
    const side = Math.abs(-du * ay + dv * ax)
    return (1 - smooth(f.r * 0.7, f.r * 1.3, side)) * (1 - along / (PILLAR_SHADOW_U + f.r)) * 0.2
  }
  const off = f.kind === 'bench' ? 0.28 : 0.3
  const d = fixtureRoom(f, u - ax * off, v - ay * off)
  return smooth(-0.25, 0.1, d) * 0.22
}

/** 天窗投在亮面石材上的倒影：沿着站台正中一长条淡淡的亮，被天窗的框隔成一格一格 */
function skylight(plan: TransitPlan, cfg: TransitConfig, u: number, v: number): number {
  for (const p of plan.platforms) {
    if (v < p.v0 || v > p.v1) continue
    const mid = (p.v0 + p.v1) / 2
    const w = Math.max(0.6, (p.v1 - p.v0 - cfg.tracks.edgeU * 2) * 0.22)
    const pane = ((u % SKY_PANE_U) + SKY_PANE_U) % SKY_PANE_U
    const frame = smooth(0.06, 0.2, Math.min(pane, SKY_PANE_U - pane))
    return Math.exp(-(((v - mid) / w) ** 2)) * frame * 0.07
  }
  return 0
}

/** 检票口那一侧站厅边外面，s 是离站厅边多远（格）：一道白墙，墙上开着一排闸机通道和几部玻璃电梯，墙外是付费区暖灰的大块地砖 */
function gateSide(plan: TransitPlan, u: number, s: number, aa: number, o: Rgb): void {
  const big = 2
  const fu = ((u % big) + big) % big
  const fs = ((s % big) + big) % big
  const tone = 1 + (valueNoise(Math.floor(u / big) * 5.1, Math.floor(s / big) * 2.3, 9) - 0.5) * 0.04
  set(o, 228 * tone, 224 * tone, 218 * tone)
  mixTo(o, 200, 196, 190, 1 - smooth(0.02 - aa, 0.02 + aa, Math.min(fu, big - fu, fs, big - fs)))
  scale(o, 1 - 0.18 * Math.exp(-Math.max(0, s - WALL_U) / 0.8))
  const lift = plan.lifts.find((l) => Math.abs(u - l.u) < l.w / 2 + 0.15)
  if (lift) {
    const du = Math.abs(u - lift.u)
    if (du > lift.w / 2 || s > 2.2) {
      if (s < 2.35) set(o, 186, 194, 202)
      return
    }
    if (s < 0.22) {
      set(o, 198, 204, 210)
      mixTo(o, 120, 128, 138, 1 - smooth(0.012 - aa, 0.012 + aa, du))
      mixTo(o, 240, 244, 248, (1 - smooth(0.02, 0.06, s)) * 0.6)
      return
    }
    set(o, 168, 188, 200)
    mixTo(o, 230, 240, 246, Math.exp(-(((du - lift.w / 2 + 0.05) / 0.04) ** 2)) * 0.8)
    mixTo(o, 120, 140, 156, smooth(1.6, 2.2, s) * 0.6)
    return
  }
  const lane = plan.lanes.find((l) => Math.abs(u - l.u) < l.w / 2)
  const first = plan.lanes[0]
  const last = plan.lanes[plan.lanes.length - 1]
  const inBank = first && last && u > first.u - first.w / 2 - 0.4 && u < last.u + last.w / 2 + 0.4
  if (inBank && s < 1.5) {
    if (lane) {
      mixTo(o, 216, 220, 224, 0.5)
      if (Math.abs(s - 0.75) < 0.06) mixTo(o, 150, 220, 232, 0.55)
      return
    }
    set(o, 236, 238, 240)
    mixTo(o, 44, 52, 62, (1 - smooth(0.32, 0.36, Math.abs(s - 0.75) * 0.9)) * 0.85)
    if (s < 0.18) mixTo(o, 70, 222, 130, 0.9)
    scale(o, 1 - 0.12 * smooth(1.2, 1.5, s))
    return
  }
  if (s < WALL_U) {
    set(o, 246, 247, 248)
    mixTo(o, 196, 202, 208, 1 - smooth(0.02 - aa, 0.03 + aa, Math.min(s, WALL_U - s)))
    const panel = ((u % 2.4) + 2.4) % 2.4
    mixTo(o, 222, 226, 230, 1 - smooth(0.015 - aa, 0.015 + aa, Math.min(panel, 2.4 - panel)))
  }
}

/** 扶梯那一侧站厅边外面，s 是离站厅边多远（格）：一道玻璃栏板，栏板外往下看是换乘层，开口处的自动扶梯一级级往下没进换乘层 */
function escalatorSide(plan: TransitPlan, u: number, s: number, aa: number, o: Rgb, x: number, y: number): void {
  const lower = 1 + (fbm(x * 0.6, y * 0.6, 77, 2) - 0.5) * 0.08
  set(o, 132 * lower, 142 * lower, 154 * lower)
  const lfu = (((u + 0.5) % 2.2) + 2.2) % 2.2
  const lfs = (((s + 0.3) % 2.2) + 2.2) % 2.2
  mixTo(o, 116, 126, 138, (1 - smooth(0.03, 0.06, Math.min(lfu, 2.2 - lfu, lfs, 2.2 - lfs))) * 0.6)
  scale(o, 1 - 0.32 * Math.exp(-s / 1.4))
  const esc = plan.escalators.find((e) => Math.abs(u - e.u) < e.w / 2 + 0.12)
  if (esc && s < STAIR_U + 0.4) {
    const du = Math.abs(u - esc.u)
    if (du > esc.w / 2 - 0.08) {
      set(o, 26, 28, 32)
      mixTo(o, 160, 168, 178, Math.exp(-(((du - esc.w / 2 + 0.03) / 0.015) ** 2)) * 0.7)
      return
    }
    if (s < 0.45) {
      set(o, 186, 192, 200)
      const groove = ((du * 14) % 1 + 1) % 1
      mixTo(o, 150, 156, 164, smooth(0.4, 0.5, groove) * (1 - smooth(0.5, 0.6, groove)))
      mixTo(o, 250, 206, 60, (1 - smooth(0.04 - aa, 0.04 + aa, Math.abs(s - 0.42))) * 0.9)
      return
    }
    const down = s - 0.45
    const step = ((down / 0.38) % 1 + 1) % 1
    const k = Math.exp(-down / 2.6)
    set(o, (150 + 30 * smooth(0.0, 0.12, step)) * (0.45 + 0.55 * k), (156 + 30 * smooth(0, 0.12, step)) * (0.45 + 0.55 * k), (166 + 30 * smooth(0, 0.12, step)) * (0.45 + 0.55 * k))
    mixTo(o, 250, 206, 60, (1 - smooth(0.02, 0.04, step)) * 0.5 * k)
    return
  }
  if (s < RAIL_U) {
    mixTo(o, 214, 236, 244, 0.55)
    mixTo(o, 168, 176, 186, 1 - smooth(0.03 - aa, 0.03 + aa, s))
    mixTo(o, 255, 255, 255, Math.exp(-(((s - RAIL_U * 0.6) / 0.02) ** 2)) * 0.8)
  }
}

/** 两头站房的地面（大都被站房顶盖住）：隧道里是暗的，别处是墙 */
function endZone(plan: TransitPlan, cfg: TransitConfig, v: number, e: number, o: Rgb): void {
  const t = plan.tracks.find((k) => Math.abs(v - k.v) < cfg.tracks.bedU / 2)
  if (t) {
    set(o, 150, 156, 166)
    scale(o, Math.max(0.2, Math.exp(-e / 0.9)))
    return
  }
  set(o, 240, 242, 245)
}

/**
 * 磁浮站的地面：站台铺着冷白的亮面石材，石缝浅灰，天窗的倒影一长条一长条地落在站台正中；站台边一道金属包边、一条灯槽与一道盲道；
 * 道床是光洁的浅灰水泥，两道导向槽嵌在地里，最外面一道线路色的边线，两头写着线路号；柱子、座椅与全息时刻表的底座按太阳打光、投影；
 * 站厅一侧是墙与闸机、玻璃电梯，墙外是付费区；另一侧是玻璃栏板，栏板外往下看是换乘层与自动扶梯；墙脚与设施脚下压一点暗
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const { plan, cfg } = sc
  const ppu = GROUND_PPU
  const aa = 0.6 / ppu
  const w = rect.x1 - rect.x0
  const half = cfg.tracks.bedU / 2
  const edge = cfg.tracks.edgeU
  const l = { u: 0, v: 0 }
  const o: Rgb = [0, 0, 0]
  const hall = prep.hall
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      toLocal(plan, x, y, l)
      const { u, v } = l
      const inU = u >= plan.u0 && u <= plan.u1
      const inV = v >= plan.v0 && v <= plan.v1
      if (inU && inV) {
        let near: Track | null = null
        let dv = Infinity
        for (const t of plan.tracks) {
          const d = v - t.v
          if (Math.abs(d) < Math.abs(dv)) {
            dv = d
            near = t
          }
        }
        if (near && Math.abs(dv) < half) {
          trackBed(near, u, dv, half, aa, o, x, y)
          const n = ink(prep.bed, x, y, aa)
          if (n.k > 0 && n.n) mixTo(o, n.n.color[0], n.n.color[1], n.n.color[2], n.k * 0.9)
        } else if (near && Math.abs(dv) < half + edge) edgeStrip(u, Math.abs(dv) - half, aa, o)
        else {
          stone(u, v, aa, o)
          const sky = skylight(plan, cfg, u, v)
          mixTo(o, 255, 255, 255, sky)
        }
        let shadow = 0
        let drawn = false
        for (const f of plan.fixtures) {
          const du = u - f.u
          const dvf = v - f.v
          if (!drawn) {
            if (f.kind === 'pillar') drawn = pillar(f, du, dvf, plan.horiz, aa, o)
            else if (f.kind === 'bench') drawn = bench(f, du, dvf, aa, o)
            else drawn = kiosk(f, du, dvf, aa, o)
            if (drawn) continue
          }
          shadow = Math.max(shadow, fixtureShadow(f, u, v, plan.horiz))
        }
        const room = roomAt(plan.basin, x * UNIT, y * UNIT) / UNIT
        const ao = room > 0 ? 1 - 0.13 * Math.exp(-room / 0.28) : 1
        const wall = 0.16 * Math.exp(-(y - hall.y0) / WALL_SHADOW_U) + 0.16 * Math.exp(-(x - hall.x0) / WALL_SHADOW_U)
        if (!drawn) scale(o, (1 - shadow) * (1 - Math.min(0.3, wall)))
        scale(o, ao)
      } else if (inU) {
        const s = v < plan.v0 ? plan.v0 - v : v - plan.v1
        const gate = (plan.gateSide === 0) === v < plan.v0
        if (gate) gateSide(plan, u, s, aa, o)
        else escalatorSide(plan, u, s, aa, o, x, y)
      } else if (inV) endZone(plan, cfg, v, u < plan.u0 ? plan.u0 - u : u - plan.u1, o)
      else set(o, 240, 242, 245)
      const i = ((py - rect.y0) * w + px - rect.x0) * 4
      out[i] = o[0]
      out[i + 1] = o[1]
      out[i + 2] = o[2]
      out[i + 3] = 255
    }
  }
}

/**
 * 盖在列车上面的那一层：站厅两头的站房顶，白色的顶板一块块拼着，贴着站厅的那道檐口压一线暗；隧道口那一段从站厅边往里渐渐暗下去，
 * 进站、出站的列车钻进隧道就暗下去、被站房顶盖住；隧道口上方一道线路色的门楣，写着线路号。别处透明
 */
export function paintCover(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const { plan, cfg } = sc
  const ppu = GROUND_PPU
  const aa = 0.6 / ppu
  const w = rect.x1 - rect.x0
  const half = cfg.tracks.bedU / 2
  const l = { u: 0, v: 0 }
  const o: Rgb = [0, 0, 0]
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      toLocal(plan, x, y, l)
      const { u, v } = l
      const i = ((py - rect.y0) * w + px - rect.x0) * 4
      const e = u < plan.u0 ? plan.u0 - u : u > plan.u1 ? u - plan.u1 : -1
      if (e < 0) {
        out[i + 3] = 0
        continue
      }
      const t = plan.tracks.find((k) => Math.abs(v - k.v) < half + 0.15)
      let a = 1
      if (t && e < MOUTH_U) {
        set(o, 16, 20, 26)
        a = smooth(0, MOUTH_U, e) * 0.94
      } else {
        const pu = ((e % 2.2) + 2.2) % 2.2
        const pv = ((v % 3) + 3) % 3
        set(o, 240, 243, 246)
        mixTo(o, 214, 220, 226, 1 - smooth(0.03 - aa, 0.03 + aa, Math.min(pu, 2.2 - pu, pv, 3 - pv)))
        const vent = Math.abs(((v + 1.5) % 6 + 6) % 6 - 3) < 0.8 && e > 3.2 && e < 4.6
        if (vent) {
          const sl = ((e * 6) % 1 + 1) % 1
          mixTo(o, 150, 158, 168, smooth(0.5, 0.6, sl) * 0.7)
        }
        mixTo(o, 150, 158, 168, Math.exp(-e / 0.08) * 0.8)
        if (t && e < MOUTH_U + 0.45) {
          const [r, g, b] = rgbOf(t.color)
          mixTo(o, r, g, b, smooth(MOUTH_U, MOUTH_U + 0.05, e) * 0.95)
          mixTo(o, 255, 255, 255, Math.exp(-(((e - MOUTH_U - 0.05) / 0.02) ** 2)) * 0.5)
        }
        if (t) {
          const d = Math.hypot(e - 4.4, v - t.v)
          if (d < 0.75 + aa) {
            const [r, g, b] = rgbOf(t.color)
            mixTo(o, r, g, b, 1 - smooth(0.75 - aa, 0.75 + aa, d))
          }
          const n = ink(prep.roof, x, y, aa)
          if (n.k > 0) mixTo(o, 255, 255, 255, n.k)
        }
        const lit = 1 - 0.08 * smooth(0, 6, e)
        scale(o, lit)
      }
      out[i] = o[0]
      out[i + 1] = o[1]
      out[i + 2] = o[2]
      out[i + 3] = a * 255
    }
  }
}
