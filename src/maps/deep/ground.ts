import { FRAME_U } from '../../util/units.ts'
import { cellEdge, fbm, valueNoise } from '../../util/noise.ts'
import { fromWhale, inBoulder, reachOf, seabedM, skullHalf, SKULL_FRAC, SKULL_HALF, swing, toLocal, WHALE_HALF, whaleUV } from './layout.ts'
import type { DeepPlan, Local, Reach, Whale } from './layout'

/** 高度图每格多少像素 */
export const RELIEF_PPU = 16
/** 高度按 16 位存：从开局站位往下 lo 米起，跨 span 米 */
export const HEIGHT_RANGE = { lo: -34, span: 54 } as const

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

type Rgb = [number, number, number]

function mixTo(c: Rgb, r: number, g: number, b: number, t: number): void {
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

/** 线段 a→b 上离 (x, y) 最近的点有多远，与那一点在线段上的比例 */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / l2) : 0
  return { d: Math.hypot(x - ax - dx * t, y - ay - dy * t), t }
}

/** 一根骨头：鲸骨坐标（u、v，格）下的折线、粗细（格，起止）、多高（米） */
interface Bone {
  readonly pts: Float32Array
  readonly w0: number
  readonly w1: number
  readonly h: number
  /** 粗细是否沿着中间鼓起：肋骨两头细中间粗 */
  readonly belly: boolean
}

/** 一节脊椎：鲸骨坐标下的中心、顺着脊椎的半长、横着的半宽、两侧横突伸多远（格），歪了多少（弧度） */
interface Vert {
  readonly u: number
  readonly v: number
  readonly hl: number
  readonly hw: number
  readonly wing: number
  readonly rot: number
}

/** 画一副鲸骨要的形状：下颌、肋骨、鳍骨与一节节的脊椎，按鲸骨的种子摆开、有的散落歪斜 */
export interface Skeleton {
  readonly whale: Whale
  readonly bones: readonly Bone[]
  readonly verts: readonly Vert[]
  readonly reach: number
}

function polyline(n: number, at: (s: number) => [number, number]): Float32Array {
  const out = new Float32Array((n + 1) * 2)
  for (let i = 0; i <= n; i++) {
    const p = at(i / n)
    out[i * 2] = p[0]
    out[i * 2 + 1] = p[1]
  }
  return out
}

export function skeletonOf(w: Whale): Skeleton {
  const L = w.length
  const sk = SKULL_FRAC * L
  const ws = SKULL_HALF * L
  const r = (k: number): number => hash(k, 17, w.seed)
  const bones: Bone[] = []
  // 下颌：从脑颅后两角往前，向外弓出去，比吻部还长一点
  for (const side of [-1, 1]) {
    const splay = 0.15 + 0.35 * r(side + 3)
    bones.push({ pts: polyline(14, (s) => [0.9 * sk - s * 1.02 * sk, side * (0.95 * ws + (0.32 + splay) * ws * Math.sin(Math.PI * s * 0.9) + 0.25 * ws * s)]), w0: 0.16 * ws, w1: 0.07 * ws, h: 0.28, belly: false })
  }
  // 肋骨：十二对，从胸椎往外、往尾巴那边弯；有的倒向一边、有的散开
  for (let k = 0; k < 12; k++) {
    for (const side of [-1, 1]) {
      const j = k * 2 + (side > 0 ? 1 : 0)
      const u0 = sk + 0.035 * L + k * 0.021 * L + (r(j + 40) - 0.5) * 0.008 * L
      const len = 0.17 * L * (0.55 + 0.45 * Math.sin((Math.PI * (k + 1)) / 13)) * (0.85 + 0.25 * r(j + 80))
      const ang = (78 - k * 2.5 + (r(j + 120) - 0.5) * 34) * (Math.PI / 180)
      const bend = 0.16 + 0.12 * r(j + 160)
      const du = Math.cos(ang)
      const dv = Math.sin(ang) * side
      bones.push({
        pts: polyline(10, (s) => {
          const a = s * len
          return [u0 + du * a + bend * s * s * len * 0.9, side * 0.018 * L + dv * a - side * bend * s * s * len * 0.15]
        }),
        w0: 0.0075 * L,
        w1: 0.0045 * L,
        h: 0.22,
        belly: true,
      })
    }
  }
  // 胸鳍：一根粗短的上臂骨，两根前臂骨，再往外四根指骨
  for (const side of [-1, 1]) {
    const u0 = sk + 0.05 * L
    const v0 = side * 0.075 * L
    const a = (-30 + (r(side + 200) - 0.5) * 40) * (Math.PI / 180)
    const du = Math.cos(a)
    const dv = Math.sin(a + Math.PI / 2) * side
    const hu = 0.045 * L
    bones.push({ pts: polyline(4, (s) => [u0 + du * hu * s * 0.3, v0 + dv * hu * s]), w0: 0.014 * L, w1: 0.012 * L, h: 0.24, belly: false })
    for (const off of [-0.006, 0.006]) bones.push({ pts: polyline(4, (s) => [u0 + du * hu * 0.3 + du * 0.02 * L * s + off * L, v0 + dv * (hu + 0.05 * L * s)]), w0: 0.006 * L, w1: 0.005 * L, h: 0.18, belly: false })
    for (let f = 0; f < 4; f++) {
      const fa = a + (f - 1.5) * 0.16
      const fu = Math.cos(fa)
      const fv = Math.sin(fa + Math.PI / 2) * side
      bones.push({ pts: polyline(5, (s) => [u0 + du * hu * 0.3 + du * 0.02 * L + fu * 0.012 * L * f * 0.3 + fu * 0.07 * L * s * 0.4, v0 + dv * (hu + 0.05 * L) + fv * 0.08 * L * s]), w0: 0.0035 * L, w1: 0.002 * L, h: 0.12, belly: false })
    }
  }
  // 脊椎：三十来节，从颈椎排到尾尖，越往后越小；腰那一段的横突最长；有几节被拱散了
  const verts: Vert[] = []
  const n = 32
  const u0 = sk + 0.012 * L
  const step = (0.985 * L - u0) / n
  for (let i = 0; i < n; i++) {
    const t = i / n
    const loose = r(i + 300) < 0.15 ? 1 : 0
    verts.push({
      u: u0 + (i + 0.5) * step + loose * (r(i + 340) - 0.5) * 0.5 * step,
      v: loose * (r(i + 380) - 0.5) * 0.04 * L,
      hl: 0.4 * step,
      hw: 0.024 * L * (1 - 0.62 * t),
      wing: 0.032 * L * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (t < 0.75 ? 1 : 0.3),
      rot: (r(i + 420) - 0.5) * (loose ? 0.9 : 0.12),
    })
  }
  return { whale: w, bones, verts, reach: WHALE_HALF * L + 0.8 }
}

/** 鲸骨上 (x, y) 处是哪种骨头、多高（米）、骨面的明暗；没有骨头 kind 为 0：1 头骨、2 下颌与肋骨鳍骨、3 脊椎 */
interface BoneHit {
  kind: number
  h: number
  shade: number
}

const UV: Local = { a: 0, b: 0 }

function boneAt(s: Skeleton, x: number, y: number, out: BoneHit): BoneHit {
  out.kind = 0
  out.h = 0
  out.shade = 1
  const w = s.whale
  if (fromWhale(w, x, y) > s.reach) return out
  whaleUV(w, x, y, UV)
  const u = UV.a
  const v = UV.b
  const L = w.length
  const half = skullHalf(w, u)
  if (half > 0 && Math.abs(v) <= half) {
    const q = Math.abs(v) / half
    const sk = SKULL_FRAC * L
    out.kind = 1
    out.h = 0.85 * Math.sqrt(1 - q * q) * (0.45 + 0.55 * smooth(0, 0.6 * sk, u))
    // 吻部中线一道沟，头顶一对鼻孔，后面一对眼眶的缺口
    let sh = 0.88 + 0.12 * Math.sqrt(1 - q * q)
    if (Math.abs(v) < 0.06 * half && u < 0.7 * sk) sh *= 0.8
    const nx = (u - 0.62 * sk) / (0.08 * sk)
    const ny = (Math.abs(v) - 0.18 * half) / (0.1 * half)
    if (nx * nx + ny * ny < 1) sh *= 0.35
    if (u > 0.78 * sk && u < 0.88 * sk && q > 0.82) sh *= 0.45
    out.shade = sh
    return out
  }
  for (const vt of s.verts) {
    const du = u - vt.u
    const dv = v - vt.v
    if (Math.abs(du) > vt.hl + 0.1 || Math.abs(dv) > vt.hw + vt.wing + 0.1) continue
    const c = Math.cos(vt.rot)
    const sn = Math.sin(vt.rot)
    const a = du * c + dv * sn
    const b = -du * sn + dv * c
    const body = (a / vt.hl) ** 4 + (b / vt.hw) ** 4
    const wing = Math.abs(a) < vt.hl * 0.32 && Math.abs(b) < vt.hw + vt.wing
    if (body < 1) {
      out.kind = 3
      out.h = 0.32 * (vt.hw / (0.024 * L)) * (1 - body * 0.4)
      out.shade = 0.8 + 0.2 * (1 - body) - (Math.abs(b) < vt.hw * 0.22 ? 0.25 : 0)
      return out
    }
    if (wing) {
      out.kind = 3
      out.h = 0.12
      out.shade = 0.85
      return out
    }
  }
  for (const bn of s.bones) {
    const p = bn.pts
    const n = p.length / 2 - 1
    for (let i = 0; i < n; i++) {
      const g = segDist(u, v, p[i * 2]!, p[i * 2 + 1]!, p[i * 2 + 2]!, p[i * 2 + 3]!)
      const s0 = (i + g.t) / n
      const wdt = (bn.w0 + (bn.w1 - bn.w0) * s0) * (bn.belly ? 0.7 + 0.6 * Math.sin(Math.PI * s0) : 1)
      if (g.d > wdt) continue
      const q = g.d / wdt
      out.kind = 2
      out.h = bn.h * Math.sqrt(1 - q * q)
      out.shade = 0.78 + 0.22 * Math.sqrt(1 - q * q)
      return out
    }
  }
  return out
}

/** 冷泉里 (x, y) 处的样子：离中心占半径多少（0 心 1 边，外面大于 1） */
function seepAt(plan: DeepPlan, x: number, y: number): { k: number; seed: number; sx: number; sy: number } | null {
  for (const s of plan.seeps) {
    const d = Math.hypot(x - s.x, y - s.y)
    const wob = 1 + 0.25 * (valueNoise((x - s.x) * 1.3 + 5, (y - s.y) * 1.3 + 5, s.seed) - 0.5) * 2
    if (d < s.r * wob * 1.35) return { k: d / (s.r * wob), seed: s.seed, sx: s.x, sy: s.y }
  }
  return null
}

/** 落在第几个 cell 格里、格心的随机偏移与这个格子掷的签：撒小东西用 */
function scatter(x: number, y: number, cell: number, seed: number, chance: number, fn: (dx: number, dy: number, r: number) => void): void {
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i
      const cy = gy + j
      if (hash(cx, cy, seed) >= chance) continue
      const px = (cx + 0.15 + 0.7 * hash(cx, cy, seed + 1)) * cell
      const py = (cy + 0.15 + 0.7 * hash(cx, cy, seed + 2)) * cell
      fn(x - px, y - py, hash(cx, cy, seed + 3))
    }
  }
}

const RE: Reach = { low: 0, high: 0, rubble: 0, lip: 0 }
const LC: Local = { a: 0, b: 0 }
const BH: BoneHit = { kind: 0, h: 0, shade: 1 }

/** 软泥：灰白偏黄，大片地深浅不匀，细看是一粒粒的；新鲜的泥颜色浅 */
function ooze(c: Rgb, x: number, y: number, seed: number): void {
  const big = fbm(x / 7, y / 7, seed + 1, 3)
  const mid = fbm(x / 1.7, y / 1.7, seed + 2, 3)
  const grain = valueNoise(x * 9, y * 9, seed + 3)
  c[0] = 0.6 + 0.08 * big
  c[1] = 0.57 + 0.07 * big
  c[2] = 0.5 + 0.05 * big
  scale(c, 0.9 + 0.12 * mid + 0.06 * grain)
  mixTo(c, 0.55, 0.53, 0.42, smooth(0.55, 0.75, fbm(x / 3.3 + 7, y / 3.3, seed + 4, 2)) * 0.5)
}

/** 泥上的生痕：海参拖出的弯弯曲曲的沟、一个个洞口、匙虫在洞口四周舔出的放射状印子 */
function traces(c: Rgb, x: number, y: number, seed: number): void {
  // 海参的拖痕：一张低频噪声的等值线，沟底暗、沟沿浅
  const f = fbm(x / 4.2, y / 4.2, seed + 11, 2) + 0.08 * valueNoise(x * 2, y * 2, seed + 12)
  const band = Math.abs(f - 0.5) / 0.012
  if (band < 2.2) {
    const groove = Math.max(0, 1 - band)
    const rim = smooth(1.2, 1.6, band) * (1 - smooth(1.8, 2.2, band))
    scale(c, 1 - 0.22 * groove + 0.07 * rim)
  }
  scatter(x, y, 0.55, seed + 13, 0.55, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const hole = 0.035 + 0.04 * r
    if (d < hole) scale(c, 0.45 + 0.3 * (d / hole))
    else if (d < hole * 2.2) scale(c, 1.06)
  })
  scatter(x, y, 2.4, seed + 14, 0.18, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const reach = 0.35 + 0.35 * r
    if (d > reach) return
    const a = Math.atan2(dy, dx)
    const rays = 9 + Math.floor(r * 7)
    const ray = Math.abs(Math.sin((a * rays) / 2 + r * 10))
    if (d < 0.05) scale(c, 0.5)
    else if (ray > 0.86) scale(c, 0.9 - 0.08 * (1 - d / reach))
  })
}

/** 谷底的活物与小东西：蛇尾、玻璃海绵、海鳃、海葵、海猪、锰结核、粗粒的有孔虫球；颜色是本色，灯照上去才看得出来 */
function life(c: Rgb, x: number, y: number, seed: number): void {
  // 锰结核：成片的黑褐色小疙瘩
  if (fbm(x / 5, y / 5, seed + 20, 2) > 0.58) {
    scatter(x, y, 0.32, seed + 21, 0.6, (dx, dy, r) => {
      const d = Math.hypot(dx * (1 + r * 0.4), dy)
      const s = 0.05 + 0.07 * r
      if (d < s) mixTo(c, 0.12, 0.1, 0.09, 0.9 - 0.3 * (d / s))
      else if (d < s * 1.4) scale(c, 0.85)
    })
  }
  // 蛇尾：五条细腕，盘在泥上
  scatter(x, y, 1.6, seed + 22, 0.28, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const arm = 0.22 + 0.16 * r
    if (d > arm) return
    const a = Math.atan2(dy, dx) + r * 6.28 + d * (r - 0.5) * 3
    const k = Math.abs(Math.sin((a * 5) / 2))
    const tone: Rgb = r < 0.5 ? [0.92, 0.72, 0.52] : [0.88, 0.84, 0.76]
    if (d < 0.05) mixTo(c, tone[0], tone[1], tone[2], 0.9)
    else if (k > 0.94 - 0.04 * (1 - d / arm)) mixTo(c, tone[0], tone[1], tone[2], 0.85 * (1 - d / arm) + 0.15)
  })
  // 玻璃海绵：从上往下看是一圈象牙白的瓶口，里面黑
  scatter(x, y, 3.2, seed + 23, 0.32, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const R0 = 0.16 + 0.18 * r
    if (d > R0 * 1.15) return
    if (d < R0 * 0.6) mixTo(c, 0.06, 0.06, 0.07, 0.9)
    else if (d < R0) {
      const lattice = Math.abs(Math.sin(Math.atan2(dy, dx) * 14)) * Math.abs(Math.sin(d * 90))
      mixTo(c, 0.94, 0.92, 0.84, 0.75 + 0.2 * lattice)
    } else scale(c, 0.82)
  })
  // 海鳃：一根羽毛似的橙红色
  scatter(x, y, 2.9, seed + 24, 0.22, (dx, dy, r) => {
    const a = r * 6.28
    const u = dx * Math.cos(a) + dy * Math.sin(a)
    const v = -dx * Math.sin(a) + dy * Math.cos(a)
    const len = 0.22 + 0.14 * r
    if (Math.abs(u) > len) return
    const width = 0.06 * Math.sqrt(1 - (u / len) ** 2)
    if (Math.abs(v) < 0.012) mixTo(c, 0.75, 0.32, 0.18, 0.9)
    else if (Math.abs(v) < width && Math.sin(u * 120) > -0.2) mixTo(c, 0.95, 0.45, 0.3, 0.75)
  })
  // 海葵：一圈触手围着嘴，粉、紫、白
  scatter(x, y, 2.3, seed + 25, 0.26, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const R0 = 0.1 + 0.08 * r
    if (d > R0 * 1.7) return
    const hue: Rgb = r < 0.33 ? [0.95, 0.55, 0.68] : r < 0.66 ? [0.72, 0.52, 0.86] : [0.95, 0.92, 0.88]
    if (d < R0 * 0.35) mixTo(c, hue[0] * 0.6, hue[1] * 0.5, hue[2] * 0.6, 0.9)
    else if (d < R0) mixTo(c, hue[0], hue[1], hue[2], 0.9)
    else if (Math.abs(Math.sin(Math.atan2(dy, dx) * 9)) > 0.6) mixTo(c, hue[0], hue[1], hue[2], 0.7 * (1 - (d - R0) / (0.7 * R0)))
  })
  // 海猪：几只一群，半透明的粉
  scatter(x, y, 4.5, seed + 26, 0.16, (dx, dy, r) => {
    for (let i = 0; i < 3; i++) {
      const ox = (hash(i, 1, Math.floor(r * 1e6)) - 0.5) * 0.9
      const oy = (hash(i, 2, Math.floor(r * 1e6)) - 0.5) * 0.9
      const a = hash(i, 3, Math.floor(r * 1e6)) * 6.28
      const u = (dx - ox) * Math.cos(a) + (dy - oy) * Math.sin(a)
      const v = -(dx - ox) * Math.sin(a) + (dy - oy) * Math.cos(a)
      const e = (u / 0.14) ** 2 + (v / 0.075) ** 2
      if (e < 1) mixTo(c, 0.94, 0.7, 0.72, 0.65 + 0.25 * (1 - e))
    }
  })
  // 有孔虫球：灰色、碎碎的，偶尔一个
  scatter(x, y, 3.6, seed + 27, 0.14, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const R0 = 0.09 + 0.07 * r
    if (d < R0) mixTo(c, 0.66, 0.66, 0.62, 0.7 + 0.25 * valueNoise(dx * 60, dy * 60, seed))
  })
}

/** 岩面：深灰的玄武岩，有裂隙、有亮一点的剥落面，朝上的地方积着一层泥，石缝里长着小珊瑚与海绵 */
function rock(c: Rgb, x: number, y: number, seed: number, drape: number): void {
  const n = fbm(x / 1.4, y / 1.4, seed + 31, 3)
  c[0] = 0.27 + 0.1 * n
  c[1] = 0.26 + 0.09 * n
  c[2] = 0.25 + 0.08 * n
  const crack = cellEdge(x * 1.6, y * 1.6, seed + 32)
  if (crack < 0.05) scale(c, 0.55 + 8 * crack)
  const facet = valueNoise(Math.floor(x * 2.2), Math.floor(y * 2.2), seed + 33)
  scale(c, 0.88 + 0.22 * facet)
  mixTo(c, 0.57, 0.54, 0.47, drape * (0.75 + 0.25 * fbm(x * 2, y * 2, seed + 34, 2)))
  scatter(x, y, 0.9, seed + 35, 0.2 * (1 - drape * 0.5), (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const R0 = 0.05 + 0.06 * r
    if (d > R0) return
    if (r < 0.4) mixTo(c, 0.98, 0.8, 0.25, 0.85)
    else if (r < 0.7) mixTo(c, 0.95, 0.5, 0.25, 0.85)
    else mixTo(c, 0.95, 0.94, 0.9, 0.8)
  })
}

/** 鲸骨四周：骨头被硫化物染黑的泥，泥上一块块白的、黄的细菌席，骨头上一簇簇红的食骨虫 */
function whaleSurrounds(c: Rgb, s: Skeleton, x: number, y: number): void {
  const w = s.whale
  const d = fromWhale(w, x, y)
  const halo = 1 - smooth(WHALE_HALF * w.length * 0.6, WHALE_HALF * w.length * 1.25, d)
  if (halo <= 0) return
  mixTo(c, 0.24, 0.24, 0.23, halo * 0.75)
  const mat = fbm(x / 0.9, y / 0.9, w.seed + 5, 3)
  if (mat > 0.56) mixTo(c, 0.93, 0.92, 0.86, halo * smooth(0.56, 0.66, mat) * 0.85)
  else if (mat < 0.32) mixTo(c, 0.92, 0.72, 0.32, halo * smooth(0.32, 0.24, mat) * 0.6)
}

function boneColor(c: Rgb, hit: BoneHit, x: number, y: number, seed: number): void {
  const grime = fbm(x * 1.8, y * 1.8, seed + 7, 3)
  c[0] = 0.86 - 0.18 * grime
  c[1] = 0.83 - 0.18 * grime
  c[2] = 0.74 - 0.16 * grime
  scale(c, hit.shade)
  const fuzz = fbm(x * 3, y * 3, seed + 8, 2)
  if (fuzz > 0.62) mixTo(c, 0.97, 0.97, 0.94, smooth(0.62, 0.72, fuzz) * 0.7)
  scatter(x, y, 0.35, seed + 9, 0.3, (dx, dy) => {
    if (Math.hypot(dx, dy) < 0.04) mixTo(c, 0.85, 0.12, 0.12, 0.9)
  })
}

/** 冷泉：发黑的泥上一块块白色与橙黄色的细菌席，一圈白色的蛤壳，正中一丛顶着红羽的管虫；泥上几个冒气的小坑 */
function seepColor(c: Rgb, q: { k: number; seed: number; sx: number; sy: number }, x: number, y: number): void {
  const k = q.k
  const edge = 1 - smooth(0.85, 1.3, k)
  if (edge <= 0) return
  mixTo(c, 0.2, 0.2, 0.2, edge * 0.85)
  const mat = fbm(x / 0.6, y / 0.6, q.seed + 1, 3)
  if (mat > 0.5) mixTo(c, 0.95, 0.95, 0.9, edge * smooth(0.5, 0.6, mat))
  else if (mat < 0.36) mixTo(c, 0.97, 0.66, 0.2, edge * smooth(0.36, 0.28, mat) * 0.9)
  if (k > 0.45 && k < 1.05) {
    scatter(x, y, 0.28, q.seed + 2, 0.5, (dx, dy, r) => {
      const a = r * 6.28
      const u = dx * Math.cos(a) + dy * Math.sin(a)
      const v = -dx * Math.sin(a) + dy * Math.cos(a)
      const e = (u / 0.08) ** 2 + (v / 0.05) ** 2
      if (e < 1) mixTo(c, 0.95, 0.93, 0.88, 0.9 - 0.3 * e)
    })
  }
  if (k < 0.4) {
    scatter(x, y, 0.16, q.seed + 3, 0.7, (dx, dy, r) => {
      const d = Math.hypot(dx, dy)
      if (d < 0.035) mixTo(c, 0.9, 0.15, 0.12, 0.95)
      else if (d < 0.05 + 0.02 * r) mixTo(c, 0.95, 0.95, 0.92, 0.8)
    })
  }
  scatter(x, y, 0.7, q.seed + 4, 0.35, (dx, dy) => {
    const d = Math.hypot(dx, dy)
    if (k < 0.9 && d < 0.06) scale(c, 0.4 + 6 * d)
  })
}

/** 陡坎下的坡：泥被一道道往下冲出的沟拉成条纹 */
function slope(c: Rgb, along: number, down: number, seed: number): void {
  const streak = swing(along / 0.9, down / 6, seed + 41, 3)
  scale(c, 0.86 + 0.12 * streak)
  const gully = Math.abs(Math.sin(along * 2.1 + 3 * fbm(along / 3, down / 4, seed + 42, 2)))
  if (gully > 0.92) scale(c, 0.8)
}

/** 画地面的东西：谷底、生成好的鲸骨形状、一格多少米 */
export interface PaintScene {
  readonly plan: DeepPlan
  readonly skeleton: Skeleton
  readonly meterPerU: number
}

export function paintScene(plan: DeepPlan, meterPerU: number): PaintScene {
  return { plan, skeleton: skeletonOf(plan.whale), meterPerU }
}

/** 地面的固有色写进 out，地图坐标 (x, y) 格；alpha 恒为满 */
function albedoAt(sc: PaintScene, x: number, y: number, c: Rgb): void {
  const plan = sc.plan
  const e = plan.edges
  const seed = plan.seed
  toLocal(plan.frame, x, y, LC)
  reachOf(e, LC.a, LC.b, RE)
  ooze(c, x, y, seed)
  const lowT = -RE.low / e.wallU[0]
  const highT = -RE.high / e.wallU[1]
  const wallT = Math.max(lowT, highT)
  const pileT = -RE.rubble / e.rubbleU
  if (wallT > 0 || pileT > 0) {
    // 岩壁：一级级岩架的平处积泥；岩堆：一块块石头，顶上积泥
    const k = wallT * 3
    const ledge = wallT > 0 && wallT < 1 ? (k - Math.floor(k) < 0.5 ? 1 : 0) : 0
    const top = wallT >= 1 ? 1 : 0
    const drape = Math.max(ledge * 0.7, top * 0.85, pileT > 0 && wallT <= 0 ? 0.35 : 0)
    const foot = smooth(0, 0.18, Math.max(wallT, pileT))
    const keep: Rgb = [c[0], c[1], c[2]]
    rock(c, x, y, seed, drape)
    c[0] = keep[0] + (c[0] - keep[0]) * foot
    c[1] = keep[1] + (c[1] - keep[1]) * foot
    c[2] = keep[2] + (c[2] - keep[2]) * foot
  } else {
    traces(c, x, y, seed)
    if (RE.lip < 0) slope(c, LC.a, -RE.lip, seed)
    else life(c, x, y, seed)
    // 壁脚、堆脚下一溜碎石
    const talus = Math.min(RE.low, RE.high, RE.rubble)
    if (talus < 1.1) {
      scatter(x, y, 0.4, seed + 51, 0.7 * (1 - talus / 1.1), (dx, dy, r) => {
        const d = Math.hypot(dx * (1 + r), dy)
        const s = 0.06 + 0.1 * r
        if (d < s) {
          const keep: Rgb = [c[0], c[1], c[2]]
          rock(c, x, y, seed + 3, 0.2)
          mixTo(c, keep[0], keep[1], keep[2], d / s)
        }
      })
    }
  }
  for (const s of plan.boulders) {
    const k = inBoulder(s, x, y)
    if (k > -0.12) {
      if (k > 0) rock(c, x, y, s.seed, smooth(0.45, 0.8, k) * 0.8)
      else scale(c, 0.78 + 0.22 * smooth(0, 0.12, -k))
    }
  }
  whaleSurrounds(c, sc.skeleton, x, y)
  const q = seepAt(plan, x, y)
  if (q) seepColor(c, q, x, y)
  boneAt(sc.skeleton, x, y, BH)
  if (BH.kind > 0) boneColor(c, BH, x, y, plan.whale.seed)
}

/** 一段地面（第 r0 到 r1 行）的固有色，每格 ppu 个像素，方框从世界原点铺满 */
export function paintAlbedo(sc: PaintScene, ppu: number, out: Uint8ClampedArray, r0: number, r1: number): void {
  const W = FRAME_U * ppu
  const c: Rgb = [0, 0, 0]
  for (let py = r0; py < r1; py++) {
    const y = (py + 0.5) / ppu
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / ppu
      albedoAt(sc, x, y, c)
      const o = ((py - r0) * W + px) * 4
      out[o] = clamp01(c[0]) * 255
      out[o + 1] = clamp01(c[1]) * 255
      out[o + 2] = clamp01(c[2]) * 255
      out[o + 3] = 255
    }
  }
}

/** (x, y) 处地面的高（米）：海底的高加上骨头 */
export function groundM(sc: PaintScene, x: number, y: number): number {
  let z = seabedM(sc.plan, x, y)
  boneAt(sc.skeleton, x, y, BH)
  if (BH.kind > 0) z += BH.h
  return z
}

/** 高度图与法线图：geo 的 R、G 是 16 位的高，B 留空；norm 的 R、G、B 是法线（按 0.5 偏移） */
export function paintRelief(sc: PaintScene, geo: Uint8ClampedArray, norm: Uint8ClampedArray): void {
  const W = FRAME_U * RELIEF_PPU
  const hs = new Float32Array(W * W)
  for (let py = 0; py < W; py++) {
    const y = (py + 0.5) / RELIEF_PPU
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / RELIEF_PPU
      const z = groundM(sc, x, y)
      const i = py * W + px
      hs[i] = z
      const v = Math.round(clamp01((z - HEIGHT_RANGE.lo) / HEIGHT_RANGE.span) * 65535)
      geo[i * 4] = v >> 8
      geo[i * 4 + 1] = v & 255
      geo[i * 4 + 2] = 0
      geo[i * 4 + 3] = 255
    }
  }
  const step = 1 / RELIEF_PPU
  const mpu = sc.meterPerU
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px
      const dx = (hs[py * W + Math.min(W - 1, px + 1)]! - hs[py * W + Math.max(0, px - 1)]!) / (2 * step * mpu)
      const dy = (hs[Math.min(W - 1, py + 1) * W + px]! - hs[Math.max(0, py - 1) * W + px]!) / (2 * step * mpu)
      const l = Math.hypot(dx, dy, 1)
      norm[i * 4] = Math.round((-dx / l) * 127.5 + 127.5)
      norm[i * 4 + 1] = Math.round((-dy / l) * 127.5 + 127.5)
      norm[i * 4 + 2] = Math.round((1 / l) * 255)
      norm[i * 4 + 3] = 255
    }
  }
}
