import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U, UNIT } from '../../util/units'
import { roomAt } from '../basin'
import { doorOffsets, fixtureRoom, toLocal, trainLength } from './layout'
import type { Fixture, Track, TransitPlan } from './layout'
import type { TransitConfig } from '../../types/maps'

/** 站台的石材：沿轨道多长、横过多宽（格），缝多宽 */
const TILE_U = { u: 2, v: 2 } as const
const SEAM_U = 0.03
/** 顶棚的主梁沿轨道隔多远、错开多少，檩条横过轨道隔多远（格） */
const BEAM_U = 5.5
const BEAM_PHASE_U = 1.3
const PURLIN_U = 1.85
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

/** 一段圆弧上的点：圆心 (cx, cy)、半径 r，从 a0 转到 a1（弧度，y 朝下），取 n 段 */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

/** 线路号的笔画：字高 2、字宽约 1，原点在字心，y 朝下；每个字几条折线 */
const GLYPH: Readonly<Record<number, readonly (readonly [number, number])[][]>> = {
  1: [[[-0.38, -0.62], [0.08, -1], [0.08, 1]], [[-0.38, 1], [0.52, 1]]],
  2: [[...arc(0, -0.48, 0.5, Math.PI * 1.08, Math.PI * 2.22, 10), [-0.52, 1], [0.56, 1]]],
  3: [arc(-0.02, -0.5, 0.47, Math.PI * 1.1, Math.PI * 2.5, 12), arc(-0.02, 0.48, 0.52, Math.PI * 1.5, Math.PI * 2.9, 12)],
}

function numeral(n: number, x: number, y: number, size: number, w: number, color: number): Numeral {
  const k = size / 2
  const segs: Seg[] = []
  for (const line of GLYPH[n] ?? []) {
    for (let i = 1; i < line.length; i++) segs.push({ ax: x + line[i - 1]![0] * k, ay: y + line[i - 1]![1] * k, bx: x + line[i]![0] * k, by: y + line[i]![1] * k })
  }
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

/** 一块石材的颜色：冷白的大块亮面石材，每块深浅略有不同，石面上细细的浅灰斑点；缝是浅灰的细线 */
function stone(u: number, v: number, aa: number, o: Rgb): void {
  const cu = Math.floor(u / TILE_U.u)
  const cv = Math.floor(v / TILE_U.v)
  const fu = u - cu * TILE_U.u
  const fv = v - cv * TILE_U.v
  const tone = 1 + (valueNoise(cu * 7.13, cv * 3.71, 17) - 0.5) * 0.028
  set(o, 238 * tone, 240 * tone, 243 * tone)
  const speck = valueNoise(u * 26, v * 26, 5)
  if (speck > 0.82) mixTo(o, 196, 202, 210, (speck - 0.82) * 2.2)
  const cloud = fbm(u * 0.35 + cu, v * 0.35 + cv, 41, 3)
  scale(o, 1 - 0.025 * smooth(0.45, 0.8, cloud))
  const seam = Math.min(fu, TILE_U.u - fu, fv, TILE_U.v - fv)
  mixTo(o, 214, 219, 225, 1 - smooth(SEAM_U / 2 - aa, SEAM_U / 2 + aa, seam))
}

/** 站台上摆设施的那一条：深一点的暖灰花岗岩，一米一块，两边各嵌一道金属细条 */
function granite(u: number, d: number, half: number, aa: number, o: Rgb): void {
  const cover = 1 - smooth(half - aa, half + aa, d)
  const cu = Math.floor(u / 1.2)
  const tone = 1 + (valueNoise(cu * 3.3, 11, 23) - 0.5) * 0.05
  const c: Rgb = [206 * tone, 206 * tone, 204 * tone]
  const speck = valueNoise(u * 30, d * 30 + cu, 8)
  if (speck > 0.78) mixTo(c, 150, 152, 156, (speck - 0.78) * 1.6)
  const fu = u - cu * 1.2
  mixTo(c, 184, 186, 190, 1 - smooth(0.015 - aa, 0.015 + aa, Math.min(fu, 1.2 - fu)))
  mixTo(c, 150, 160, 172, 1 - smooth(0.025 - aa, 0.025 + aa, Math.abs(d - half + 0.05)))
  mixTo(o, c[0], c[1], c[2], cover)
}

/** 候车标线里朝着车门的箭头：两笔的 V，尖朝道床 */
const CHEV_A: Seg = { ax: -0.14, ay: 0.1, bx: 0, by: -0.08 }
const CHEV_B: Seg = { ax: 0, ay: -0.08, bx: 0.14, by: 0.1 }

/** 候车标线：列车停稳后车门对着的地方，站台边里侧画一块线路色的框，框里两道朝着车门的箭头；d 是离警示带内沿多远（格） */
function boarding(cfg: TransitConfig, berth: number, t: Track, u: number, d: number, aa: number, o: Rgb): void {
  if (d < 0.08 || d > 0.95) return
  const spec = cfg.train
  const len = trainLength(spec)
  for (const off of doorOffsets(spec)) {
    const du = Math.abs(u - (berth + off))
    const hu = spec.doorU / 2 + 0.05
    if (du > hu + aa || Math.abs(off) > len / 2) continue
    const [r, g, b] = rgbOf(t.color)
    const inside = 1 - smooth(hu - aa, hu + aa, du)
    mixTo(o, r, g, b, inside * 0.14)
    const frame = Math.min(hu - du, d - 0.08, 0.95 - d)
    mixTo(o, r, g, b, inside * (1 - smooth(0.035 - aa, 0.035 + aa, frame)) * 0.95)
    for (const side of [-1, 1]) {
      const x = u - (berth + off) - side * hu * 0.42
      const y = d - 0.52
      const k = Math.min(segDist(CHEV_A, x, y), segDist(CHEV_B, x, y))
      mixTo(o, r, g, b, (1 - smooth(0.035 - aa, 0.035 + aa, k)) * 0.9)
    }
    return
  }
}

/** 玻璃顶棚的钢梁投在站厅地上的影子：横过轨道的主梁一道道、顺着轨道的檩条细一些，影子边缘柔和 */
function canopy(u: number, v: number): number {
  const bu = ((u - BEAM_PHASE_U) % BEAM_U + BEAM_U) % BEAM_U
  const beam = Math.exp(-(((Math.min(bu, BEAM_U - bu)) / 0.22) ** 2))
  const pv = ((v % PURLIN_U) + PURLIN_U) % PURLIN_U
  const purlin = Math.exp(-(((Math.min(pv, PURLIN_U - pv)) / 0.07) ** 2))
  return 0.1 * beam + 0.045 * purlin
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
  // 柱顶是一圈扁的弧面：边上往下弯，迎着太阳的一侧亮、背着的一侧暗，正中一块平的顶板
  const k = smooth(f.r * 0.55, f.r, r)
  const tilt = k * 1.2
  const sx = nx * Math.sin(tilt)
  const sy = ny * Math.sin(tilt)
  const sz = Math.cos(tilt)
  const lit = 0.62 + 0.42 * clamp01(sx * L.x + sy * L.y + sz * L.z)
  set(o, 246 * lit, 248 * lit, 250 * lit)
  mixTo(o, 255, 255, 255, Math.exp(-((r / (f.r * 0.4)) ** 2)) * 0.25)
  mixTo(o, 196, 204, 214, (1 - smooth(0.012, 0.03, Math.abs(r - f.r * 0.55))) * 0.6)
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

/** 售货机的几种外壳色 */
const VENDING_SHELLS: readonly Rgb[] = [
  [86, 186, 196],
  [238, 136, 112],
  [242, 244, 247],
  [74, 82, 94],
]

/** 自动售货机：从上往下看是一只方盒，顶面浅一圈，朝站台的一面一道亮着的屏 */
function vending(f: Extract<Fixture, { kind: 'vending' }>, du: number, dv: number, aa: number, o: Rgb): boolean {
  const hu = f.len / 2
  const hv = f.dep / 2
  if (Math.abs(du) > hu + aa || Math.abs(dv) > hv + aa) return false
  const cover = (1 - smooth(hu - aa, hu + aa, Math.abs(du))) * (1 - smooth(hv - aa, hv + aa, Math.abs(dv)))
  const shell = VENDING_SHELLS[Math.floor(f.hue * VENDING_SHELLS.length)]!
  const rim = Math.min(hu - Math.abs(du), hv - Math.abs(dv))
  const c: Rgb = [shell[0], shell[1], shell[2]]
  if (rim > 0.07) mixTo(c, 255, 255, 255, 0.18)
  const front = -f.back * dv
  if (front > hv - 0.12) mixTo(c, 230, 248, 255, 0.85)
  if (rim > 0.07 && Math.abs(du) < hu * 0.5 && Math.abs(dv) < hv * 0.4) mixTo(c, 40, 46, 56, 0.55)
  mixTo(o, c[0], c[1], c[2], cover)
  return true
}

/** 垃圾桶：一只不锈钢的圆桶，顶上一圈深色的投口 */
function bin(f: Extract<Fixture, { kind: 'bin' }>, du: number, dv: number, aa: number, o: Rgb): boolean {
  const r = Math.hypot(du, dv)
  if (r > f.r + aa) return false
  mixTo(o, 186, 194, 202, 1 - smooth(f.r - aa, f.r + aa, r))
  mixTo(o, 50, 56, 64, (1 - smooth(f.r * 0.55 - aa, f.r * 0.55 + aa, r)) * 0.9)
  mixTo(o, 250, 252, 255, Math.exp(-(((r - f.r * 0.8) / 0.02) ** 2)) * 0.5)
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
  if (f.kind === 'vending') {
    let best = 0
    for (let k = 1; k <= 6; k++) best = Math.max(best, smooth(-0.2, 0.15, fixtureRoom(f, u - ax * k * 0.28, v - ay * k * 0.28)) * (1 - k / 7))
    return best * 0.26
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

/** 站厅外地上的花坛：每 4.5 格一格里按种子挑一些摆一只圆花坛，s 至少离站厅边 from 格；一圈浅灰的混凝土沿，里面是一丛丛的绿叶 */
function planter(u: number, s: number, from: number, aa: number, o: Rgb): void {
  const G = 4.5
  if (s < from) return
  const cu = Math.floor(u / G)
  const cs = Math.floor((s - from) / G)
  const pick = valueNoise(cu * 5.7 + 0.5, cs * 9.3 + 0.5, 211)
  if (pick > 0.5) return
  const cx = (cu + 0.5) * G + (pick - 0.25) * 1.2
  const cy = from + (cs + 0.5) * G
  const R = 0.75 + pick * 0.4
  const d = Math.hypot(u - cx, s - cy)
  if (d > R + 0.15 + aa) {
    if (d < R + 0.45) scale(o, 1 - 0.12 * (1 - (d - R - 0.15) / 0.3))
    return
  }
  mixTo(o, 196, 200, 206, 1 - smooth(R + 0.15 - aa, R + 0.15 + aa, d))
  if (d < R) {
    const leaf = fbm(u * 3.2, s * 3.2, 19, 3)
    const lit = clamp01(0.5 + ((u - cx) * L.x + (s - cy) * L.y) / R * -0.5)
    set(o, 58 + 50 * leaf + 30 * lit, 104 + 56 * leaf + 30 * lit, 62 + 30 * leaf + 10 * lit)
    scale(o, 1 - 0.3 * smooth(R * 0.75, R, d))
  }
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
  if (s > 2.1 && s < 2.75) {
    plan.tracks.forEach((t, k) => {
      const [r, g, b] = rgbOf(t.color)
      mixTo(o, r, g, b, (1 - smooth(0.045 - aa, 0.045 + aa, Math.abs(s - 2.25 - k * 0.2))) * 0.8)
    })
  }
  planter(u, s, 3.4, aa, o)
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
  planter(u, s, 2.6, aa, o)
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

/** 站房顶的一格，e 是离站厅边多远、v 是横过轨道的位置（格）：白色的顶板，有的格是映着天光的玻璃天窗，有的格上蹲着一台空调外机 */
function roofPanel(e: number, v: number, aa: number, o: Rgb): void {
  const PW = 2.2
  const PH = 3
  const ce = Math.floor((e - 0.6) / PW)
  const cv = Math.floor(v / PH)
  const fe = e - 0.6 - ce * PW
  const fv = v - cv * PH
  const kind = valueNoise(ce * 13.7 + 0.5, cv * 7.1 + 0.5, 61)
  set(o, 240, 243, 246)
  if (ce >= 1 && kind < 0.38) {
    const t = clamp01((fv + fe * 0.4) / (PH + PW * 0.4))
    set(o, 168 + 60 * t, 196 + 40 * t, 222 + 24 * t)
    const mull = Math.min(fe, PW - fe, Math.abs(fv - PH / 2), fv, PH - fv)
    mixTo(o, 226, 232, 238, 1 - smooth(0.05 - aa, 0.05 + aa, mull))
  } else if (ce >= 1 && kind > 0.86) {
    const bx = Math.abs(fe - PW / 2)
    const by = Math.abs(fv - PH / 2)
    if (bx < 0.8 && by < 1.1) {
      set(o, 120, 128, 138)
      const fan = Math.hypot(fe - PW / 2, Math.abs(fv - PH / 2) - 0.5)
      if (fan < 0.38) {
        set(o, 64, 70, 80)
        mixTo(o, 150, 158, 168, (1 - smooth(0.03, 0.05, Math.abs(fan - 0.3))) * 0.8)
        const blade = Math.sin(Math.atan2(Math.abs(fv - PH / 2) - 0.5, fe - PW / 2) * 3)
        mixTo(o, 110, 118, 128, smooth(0.4, 0.6, blade) * 0.7 * smooth(0.06, 0.12, fan))
      }
      mixTo(o, 180, 188, 196, 1 - smooth(0.03 - aa, 0.03 + aa, Math.min(0.8 - bx, 1.1 - by)))
    }
  }
  mixTo(o, 214, 220, 226, 1 - smooth(0.03 - aa, 0.03 + aa, Math.min(fe, PW - fe, fv, PH - fv)))
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
          for (const st of plan.strips) {
            const d = Math.abs(v - st.v)
            if (d < st.w / 2 + aa) granite(u, d, st.w / 2, aa, o)
          }
          if (near) boarding(cfg, plan.berth, near, u, Math.abs(dv) - half - edge, aa, o)
        }
        let shadow = 0
        let drawn = false
        for (const f of plan.fixtures) {
          const du = u - f.u
          const dvf = v - f.v
          if (!drawn) {
            if (f.kind === 'pillar') drawn = pillar(f, du, dvf, plan.horiz, aa, o)
            else if (f.kind === 'bench') drawn = bench(f, du, dvf, aa, o)
            else if (f.kind === 'kiosk') drawn = kiosk(f, du, dvf, aa, o)
            else if (f.kind === 'vending') drawn = vending(f, du, dvf, aa, o)
            else drawn = bin(f, du, dvf, aa, o)
            if (drawn) continue
          }
          shadow = Math.max(shadow, fixtureShadow(f, u, v, plan.horiz))
        }
        const room = roomAt(plan.basin, x * UNIT, y * UNIT) / UNIT
        const ao = room > 0 ? 1 - 0.13 * Math.exp(-room / 0.28) : 1
        const wall = 0.16 * Math.exp(-(y - hall.y0) / WALL_SHADOW_U) + 0.16 * Math.exp(-(x - hall.x0) / WALL_SHADOW_U)
        if (!drawn) scale(o, (1 - shadow) * (1 - Math.min(0.3, wall)) * (1 - canopy(u, v)))
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
        roofPanel(e, v, aa, o)
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
