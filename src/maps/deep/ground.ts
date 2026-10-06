import { FRAME_U } from '../../util/units.ts'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise.ts'
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

/** 线段 a→b 上离 (x, y) 最近的点：距离与在线段上的比例写进 SEG */
const SEG = { d: 0, t: 0 }
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): void {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / l2) : 0
  SEG.d = Math.hypot(x - ax - dx * t, y - ay - dy * t)
  SEG.t = t
}

/** 一根骨头：鲸骨坐标（u、v，格）下的折线、粗细（格，起止）、多高（米）；box 是折线连同粗细的外框 u0、v0、u1、v1 */
interface Bone {
  readonly pts: Float32Array
  readonly box: readonly [number, number, number, number]
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
  /** 鲸骨连同四周沙窝的外框，地图坐标 x0、y0、x1、y1 */
  readonly box: readonly [number, number, number, number]
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
  const add = (b: Omit<Bone, 'box'>): void => {
    const p = b.pts
    const w = Math.max(b.w0, b.w1) * 1.6
    let u0 = Infinity
    let v0 = Infinity
    let u1 = -Infinity
    let v1 = -Infinity
    for (let i = 0; i < p.length; i += 2) {
      u0 = Math.min(u0, p[i]!)
      u1 = Math.max(u1, p[i]!)
      v0 = Math.min(v0, p[i + 1]!)
      v1 = Math.max(v1, p[i + 1]!)
    }
    bones.push({ ...b, box: [u0 - w, v0 - w, u1 + w, v1 + w] })
  }
  // 下颌：从脑颅后两角往前，向外弓出去，比吻部还长一点
  for (const side of [-1, 1]) {
    const splay = 0.15 + 0.35 * r(side + 3)
    add({ pts: polyline(14, (s) => [0.9 * sk - s * 1.02 * sk, side * (0.95 * ws + (0.32 + splay) * ws * Math.sin(Math.PI * s * 0.9) + 0.25 * ws * s)]), w0: 0.16 * ws, w1: 0.07 * ws, h: 0.28, belly: false })
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
      add({
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
    add({ pts: polyline(4, (s) => [u0 + du * hu * s * 0.3, v0 + dv * hu * s]), w0: 0.014 * L, w1: 0.012 * L, h: 0.24, belly: false })
    for (const off of [-0.006, 0.006]) add({ pts: polyline(4, (s) => [u0 + du * hu * 0.3 + du * 0.02 * L * s + off * L, v0 + dv * (hu + 0.05 * L * s)]), w0: 0.006 * L, w1: 0.005 * L, h: 0.18, belly: false })
    for (let f = 0; f < 4; f++) {
      const fa = a + (f - 1.5) * 0.16
      const fu = Math.cos(fa)
      const fv = Math.sin(fa + Math.PI / 2) * side
      add({ pts: polyline(5, (s) => [u0 + du * hu * 0.3 + du * 0.02 * L + fu * 0.012 * L * f * 0.3 + fu * 0.07 * L * s * 0.4, v0 + dv * (hu + 0.05 * L) + fv * 0.08 * L * s]), w0: 0.0035 * L, w1: 0.002 * L, h: 0.12, belly: false })
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
  const pad = WHALE_HALF * L * 1.3 + 0.8
  const tx = w.x + w.dx * L
  const ty = w.y + w.dy * L
  return { whale: w, bones, verts, reach: WHALE_HALF * L + 0.8, box: [Math.min(w.x, tx) - pad, Math.min(w.y, ty) - pad, Math.max(w.x, tx) + pad, Math.max(w.y, ty) + pad] }
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
  const bx = s.box
  if (x < bx[0] || x > bx[2] || y < bx[1] || y > bx[3] || fromWhale(w, x, y) > s.reach) return out
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
    if (Math.abs(u - vt.u) > vt.hl * 1.6 + 0.1) continue
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
    const bx = bn.box
    if (u < bx[0] || u > bx[2] || v < bx[1] || v > bx[3]) continue
    const p = bn.pts
    const n = p.length / 2 - 1
    for (let i = 0; i < n; i++) {
      segDist(u, v, p[i * 2]!, p[i * 2 + 1]!, p[i * 2 + 2]!, p[i * 2 + 3]!)
      const s0 = (i + SEG.t) / n
      const wdt = (bn.w0 + (bn.w1 - bn.w0) * s0) * (bn.belly ? 0.7 + 0.6 * Math.sin(Math.PI * s0) : 1)
      if (SEG.d > wdt) continue
      const q = SEG.d / wdt
      out.kind = 2
      out.h = bn.h * Math.sqrt(1 - q * q)
      out.shade = 0.78 + 0.22 * Math.sqrt(1 - q * q)
      return out
    }
  }
  return out
}

/** 涌泉里 (x, y) 处的样子：离中心占半径多少（0 心 1 边，外面大于 1） */
function seepAt(plan: DeepPlan, x: number, y: number): { k: number; seed: number; sx: number; sy: number } | null {
  for (const s of plan.seeps) {
    const d = Math.hypot(x - s.x, y - s.y)
    const wob = 1 + 0.25 * (valueNoise((x - s.x) * 1.3 + 5, (y - s.y) * 1.3 + 5, s.seed) - 0.5) * 2
    if (d < s.r * wob * 1.35) return { k: d / (s.r * wob), seed: s.seed, sx: s.x, sy: s.y }
  }
  return null
}

/** 撒小东西：每个 cell 见方的格子掷一次签，中了就在格子里放一个，离格边至少 reach（它最远伸到多远），所以只看自己这一格 */
function scatter(x: number, y: number, cell: number, reach: number, seed: number, chance: number, fn: (dx: number, dy: number, r: number) => void): void {
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  if (hash(cx, cy, seed) >= chance) return
  const room = cell - 2 * reach
  const px = cx * cell + reach + room * hash(cx, cy, seed + 1)
  const py = cy * cell + reach + room * hash(cx, cy, seed + 2)
  fn(x - px, y - py, hash(cx, cy, seed + 3))
}

/** 撒密密的小东西：放在格子里任何地方，可能伸进邻格，所以连邻近的八格一起看 */
function sprinkle(x: number, y: number, cell: number, seed: number, chance: number, fn: (dx: number, dy: number, r: number) => void): void {
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i
      const cy = gy + j
      if (hash(cx, cy, seed) >= chance) continue
      fn(x - (cx + hash(cx, cy, seed + 1)) * cell, y - (cy + hash(cx, cy, seed + 2)) * cell, hash(cx, cy, seed + 3))
    }
  }
}

const RE: Reach = { low: 0, high: 0, rubble: 0, lip: 0 }
const LC: Local = { a: 0, b: 0 }
const BH: BoneHit = { kind: 0, h: 0, shade: 1 }

/** 沙纹：浪在沙上推出的一道道波纹，峰与峰隔 RIPPLE_U 格，顺着种子定的方向、被大尺度的噪声扭弯；返回 −1（沟底）到 1（峰顶），峰尖、沟圆 */
const RIPPLE_U = 0.55
function ripple(x: number, y: number, seed: number): number {
  const a = hash(3, 5, seed) * Math.PI
  const u = x * Math.cos(a) + y * Math.sin(a) + 2.4 * fbm(x / 3.2, y / 3.2, seed + 61, 2) + 0.15 * valueNoise(x * 1.7, y * 1.7, seed + 62)
  const ph = ((u / RIPPLE_U) % 1 + 1) % 1
  return ph < 0.35 ? -1 + 2 * (1 - ph / 0.35) ** 2 : -1 + 2 * ((ph - 0.35) / 0.65) ** 2
}

/** 海草从哪长到哪：大片低频噪声高过门槛的一块块，边上稀疏；0 没有，1 长满 */
function grassAt(x: number, y: number, seed: number): number {
  return smooth(0.66, 0.72, fbm(x / 4 + 11, y / 4, seed + 71, 3))
}

/** 珊瑚沙：浅暖的灰白，大片地深浅不匀，细看是一粒粒的，夹着碎贝壳与珊瑚屑 */
function sand(c: Rgb, x: number, y: number, seed: number): void {
  const big = fbm(x / 7, y / 7, seed + 1, 3)
  const mid = fbm(x / 1.7, y / 1.7, seed + 2, 3)
  const grain = valueNoise(x * 11, y * 11, seed + 3)
  c[0] = 0.84 + 0.06 * big
  c[1] = 0.81 + 0.05 * big
  c[2] = 0.73 + 0.04 * big
  scale(c, 0.92 + 0.08 * mid + 0.07 * grain)
  sprinkle(x, y, 0.18, seed + 4, 0.35, (dx, dy, r) => {
    const d = Math.hypot(dx * (1 + r), dy)
    const s = 0.012 + 0.02 * r
    if (d >= s) return
    if (r < 0.55) mixTo(c, 0.97, 0.96, 0.92, 0.8)
    else if (r < 0.8) mixTo(c, 0.62, 0.58, 0.5, 0.6)
    else mixTo(c, 0.95, 0.78, 0.74, 0.7)
  })
}

/** 沙上的小东西：沙纹的峰亮沟暗，几处洞口，散落的贝壳、海星与海参 */
function strand(c: Rgb, x: number, y: number, seed: number, calm: number): void {
  const rp = ripple(x, y, seed)
  scale(c, 1 + 0.035 * rp * calm)
  sprinkle(x, y, 0.7, seed + 13, 0.12, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const hole = 0.03 + 0.03 * r
    if (d < hole) scale(c, 0.7 + 0.25 * (d / hole))
    else if (d < hole * 2.4) scale(c, 1.04)
  })
  // 贝壳：小小的扇形，白、粉、浅橙
  scatter(x, y, 1.3, 0.12, seed + 14, 0.3, (dx, dy, r) => {
    const a = r * 6.28
    const u = dx * Math.cos(a) + dy * Math.sin(a)
    const v = -dx * Math.sin(a) + dy * Math.cos(a)
    const R0 = 0.06 + 0.04 * r
    const d = Math.hypot(u, v)
    if (d > R0 || v < -R0 * 0.2) return
    const tone: Rgb = r < 0.4 ? [0.98, 0.96, 0.92] : r < 0.7 ? [0.97, 0.78, 0.76] : [0.98, 0.8, 0.6]
    const rib = Math.abs(Math.sin(Math.atan2(v, u) * 9)) > 0.75 ? 0.85 : 1
    mixTo(c, tone[0] * rib, tone[1] * rib, tone[2] * rib, 0.9)
  })
  // 海星：五条短腕，橙红或土黄，难得一只
  scatter(x, y, 5.5, 0.32, seed + 15, 0.22, (dx, dy, r) => {
    const d = Math.hypot(dx, dy)
    const arm = 0.18 + 0.1 * r
    if (d > arm) return
    const a = Math.atan2(dy, dx) + r * 6.28
    const k = Math.pow(Math.abs(Math.cos((a * 5) / 2)), 3)
    if (d < arm * (0.28 + 0.72 * k)) {
      const tone: Rgb = r < 0.6 ? [0.93, 0.42, 0.22] : [0.86, 0.66, 0.3]
      mixTo(c, tone[0], tone[1], tone[2], 0.92)
      if (valueNoise(dx * 60, dy * 60, seed) > 0.7) scale(c, 1.12)
    } else if (d < arm * (0.34 + 0.72 * k)) scale(c, 0.85)
  })
  // 海参：一条深褐的软管，难得一只
  scatter(x, y, 6.5, 0.36, seed + 16, 0.2, (dx, dy, r) => {
    const a = r * 6.28
    const u = dx * Math.cos(a) + dy * Math.sin(a)
    const v = -dx * Math.sin(a) + dy * Math.cos(a) - 0.05 * Math.sin(u * 9)
    const e = (u / (0.24 + 0.08 * r)) ** 2 + (v / 0.06) ** 2
    if (e < 1) mixTo(c, 0.22, 0.16, 0.12, 0.9 - 0.25 * e)
    else if (e < 1.5) scale(c, 0.88)
  })
}

/** 海草：一片片细长的草叶顺着水流倒向一边，深浅两种绿，草底下的沙也染成暗绿 */
function seagrass(c: Rgb, x: number, y: number, seed: number, k: number): void {
  if (k <= 0) return
  const a = 0.6 + 0.5 * fbm(x / 4, y / 4, seed + 72, 2)
  const u = x * Math.cos(a) + y * Math.sin(a)
  const v = -x * Math.sin(a) + y * Math.cos(a)
  const dense = k * (0.6 + 0.4 * fbm(x * 1.4, y * 1.4, seed + 74, 2))
  mixTo(c, 0.36, 0.47, 0.28, 0.75 * dense)
  sprinkle(u, v, 0.09, seed + 73, 0.85 * dense, (du, dv, r) => {
    const t = (r - 0.5) * 0.5
    const along = du * Math.cos(t) + dv * Math.sin(t)
    const across = -du * Math.sin(t) + dv * Math.cos(t)
    const len = 0.1 + 0.1 * r
    if (along < -0.02 || along > len || Math.abs(across) > 0.014) return
    const lit = 0.55 + 0.45 * (along / len)
    mixTo(c, 0.22 + 0.2 * lit * r, 0.42 + 0.2 * lit, 0.14 + 0.06 * lit, 0.92)
  })
}

/**
 * 礁：浅灰褐的老珊瑚石上一丛丛活珊瑚，一丛一个圆鼓鼓的头，一丛一个样——脑珊瑚的回纹、鹿角珊瑚的细枝、桌面珊瑚的放射纹、绿褐的藻皮，
 * 零星几小丛橙、粉、紫的；丛与丛之间是暗下去的缝。cover 是顶上铺的珊瑚沙有多厚
 */
function reef(c: Rgb, x: number, y: number, seed: number, cover: number): void {
  const n = fbm(x / 1.3, y / 1.3, seed + 31, 3)
  c[0] = 0.7 + 0.08 * n
  c[1] = 0.66 + 0.07 * n
  c[2] = 0.57 + 0.06 * n
  const cell = cellNearest(x * 1.1, y * 1.1, seed + 32)
  const d = Math.hypot(cell.dx, cell.dy)
  const h = cell.h
  const g = fbm(x * 3, y * 3, seed + 33, 2)
  if (h < 0.3) {
    const groove = Math.abs(Math.sin((cell.dx * 0.8 + cell.dy * 0.5) * 16 + g * 10 + h * 40))
    mixTo(c, 0.84, 0.79, 0.64, 0.8)
    if (groove < 0.32) scale(c, 0.86)
  } else if (h < 0.5) {
    const twig = valueNoise(x * 16, y * 16, seed + 34)
    mixTo(c, 0.78, 0.68, 0.5, 0.75)
    if (twig > 0.64) mixTo(c, 0.93, 0.88, 0.74, 0.6)
    else if (twig < 0.3) scale(c, 0.86)
  } else if (h < 0.7) {
    mixTo(c, 0.58, 0.6, 0.42, 0.65)
    scale(c, 0.92 + 0.14 * g)
  } else if (h < 0.88) {
    mixTo(c, 0.86, 0.83, 0.72, 0.75)
    if (Math.abs(Math.sin(Math.atan2(cell.dy, cell.dx) * 14)) > 0.88) scale(c, 0.9)
  } else {
    // 零星几丛颜色鲜的：只占丛心一小块
    const tone: Rgb = h < 0.93 ? [1, 0.5, 0.26] : h < 0.97 ? [0.98, 0.5, 0.66] : [0.64, 0.46, 0.9]
    mixTo(c, 0.8, 0.76, 0.64, 0.6)
    if (d < 0.42) mixTo(c, tone[0], tone[1], tone[2], 0.9 * (1 - smooth(0.3, 0.42, d)))
  }
  scale(c, 1.06 - 0.3 * Math.max(0, d - 0.35))
  const crack = cellEdge(x * 1.1, y * 1.1, seed + 32)
  if (crack < 0.07) scale(c, 0.72 + 4 * crack)
  mixTo(c, 0.86, 0.83, 0.75, cover * (0.7 + 0.3 * fbm(x * 2, y * 2, seed + 35, 2)))
}

/** 鲸骨四周：沙被骨头挡出一圈浅浅的窝，窝里积着碎贝壳 */
function whaleSurrounds(c: Rgb, s: Skeleton, x: number, y: number): void {
  const bx = s.box
  if (x < bx[0] || x > bx[2] || y < bx[1] || y > bx[3]) return
  const w = s.whale
  const d = fromWhale(w, x, y)
  const halo = 1 - smooth(WHALE_HALF * w.length * 0.5, WHALE_HALF * w.length * 1.2, d)
  if (halo <= 0) return
  scale(c, 1 - 0.08 * halo)
  if (fbm(x / 0.8, y / 0.8, w.seed + 5, 3) > 0.6) mixTo(c, 0.97, 0.96, 0.92, halo * 0.5)
}

/** 晒白的骨头：象牙白，背阴处偏灰，零星长着一点绿藻 */
function boneColor(c: Rgb, hit: BoneHit, x: number, y: number, seed: number): void {
  const grime = fbm(x * 1.8, y * 1.8, seed + 7, 3)
  c[0] = 0.97 - 0.1 * grime
  c[1] = 0.95 - 0.1 * grime
  c[2] = 0.9 - 0.1 * grime
  scale(c, hit.shade)
  const algae = fbm(x * 2.4, y * 2.4, seed + 8, 2)
  if (algae > 0.64) mixTo(c, 0.55, 0.66, 0.4, smooth(0.64, 0.74, algae) * 0.55)
}

/** 涌泉：沙底一个浅浅的漏斗，一圈圈被水推出的细纹，漏斗里的沙更白更细，正中几个冒水的小眼 */
function seepColor(c: Rgb, q: { k: number; seed: number; sx: number; sy: number }, x: number, y: number): void {
  const k = q.k
  const edge = 1 - smooth(0.85, 1.3, k)
  if (edge <= 0) return
  mixTo(c, 0.94, 0.93, 0.88, edge * 0.55)
  const ring = Math.abs(Math.sin(k * 15 + 2 * fbm(x / 0.7, y / 0.7, q.seed + 1, 2)))
  if (ring > 0.86) scale(c, 1 - 0.1 * edge)
  if (k < 0.4) {
    scatter(x, y, 0.3, 0.08, q.seed + 3, 0.6, (dx, dy) => {
      const d = Math.hypot(dx, dy)
      if (d < 0.035) scale(c, 0.6 + 8 * d)
      else if (d < 0.06) scale(c, 1.06)
    })
  }
}

/** 陡坎下的坡：沙被一道道往下淌的沙流拉成条纹，零星几块礁石 */
function slope(c: Rgb, along: number, down: number, seed: number): void {
  const streak = swing(along / 0.9, down / 6, seed + 41, 3)
  scale(c, 0.9 + 0.1 * streak)
  const gully = Math.abs(Math.sin(along * 2.1 + 3 * fbm(along / 3, down / 4, seed + 42, 2)))
  if (gully > 0.92) scale(c, 0.88)
}

/** 画地面的东西：礁湖、生成好的鲸骨形状、一格多少米 */
export interface PaintScene {
  readonly plan: DeepPlan
  readonly skeleton: Skeleton
  readonly meterPerU: number
}

export function paintScene(plan: DeepPlan, meterPerU: number): PaintScene {
  return { plan, skeleton: skeletonOf(plan.whale), meterPerU }
}

/** 沙纹在 (x, y) 处有多显：离礁墙脚、陡坎沿近了，长着海草，都被抹平 */
function calmAt(x: number, y: number, seed: number): number {
  const edge = Math.min(RE.low, RE.high, RE.rubble, RE.lip + 1.5)
  return smooth(0, 1.5, edge) * (1 - grassAt(x, y, seed))
}

/** 地面的固有色写进 out，地图坐标 (x, y) 格；alpha 恒为满 */
function albedoAt(sc: PaintScene, x: number, y: number, c: Rgb): void {
  const plan = sc.plan
  const e = plan.edges
  const seed = plan.seed
  toLocal(plan.frame, x, y, LC)
  reachOf(e, LC.a, LC.b, RE)
  sand(c, x, y, seed)
  const lowT = -RE.low / e.wallU[0]
  const highT = -RE.high / e.wallU[1]
  const wallT = Math.max(lowT, highT)
  const pileT = -RE.rubble / e.rubbleU
  if (wallT > 0 || pileT > 0) {
    // 礁墙：一级级礁台的平处积着沙；礁石堆：一块块珊瑚石，缝里积沙
    const k = wallT * 3
    const ledge = wallT > 0 && wallT < 1 ? (k - Math.floor(k) < 0.5 ? 1 : 0) : 0
    const top = wallT >= 1 ? 1 : 0
    const cover = Math.max(ledge * 0.35, top * 0.15, pileT > 0 && wallT <= 0 ? 0.12 : 0)
    const foot = smooth(0, 0.18, Math.max(wallT, pileT))
    const keep: Rgb = [c[0], c[1], c[2]]
    reef(c, x, y, seed, cover)
    c[0] = keep[0] + (c[0] - keep[0]) * foot
    c[1] = keep[1] + (c[1] - keep[1]) * foot
    c[2] = keep[2] + (c[2] - keep[2]) * foot
  } else {
    strand(c, x, y, seed, calmAt(x, y, seed))
    if (RE.lip < 0) slope(c, LC.a, -RE.lip, seed)
    else seagrass(c, x, y, seed, grassAt(x, y, seed))
    // 礁墙脚、礁石堆脚下一溜珊瑚碎块
    const talus = Math.min(RE.low, RE.high, RE.rubble)
    if (talus < 1.1) {
      scatter(x, y, 0.4, 0.17, seed + 51, 0.7 * (1 - talus / 1.1), (dx, dy, r) => {
        const d = Math.hypot(dx * (1 + r), dy)
        const s = 0.06 + 0.1 * r
        if (d < s) {
          const keep: Rgb = [c[0], c[1], c[2]]
          reef(c, x, y, seed + 3, 0.1)
          mixTo(c, keep[0], keep[1], keep[2], d / s)
        }
      })
    }
  }
  for (const s of plan.boulders) {
    const k = inBoulder(s, x, y)
    if (k > -0.12) {
      if (k > 0) reef(c, x, y, s.seed, smooth(0.6, 0.95, k) * 0.2)
      else scale(c, 0.85 + 0.15 * smooth(0, 0.12, -k))
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

/** 沙纹有多高，米；一丛珊瑚鼓起多高，米 */
const RIPPLE_M = 0.014
const COLONY_M = 0.2

/** 礁上一丛丛珊瑚鼓起来的高（米）：与 reef 画的是同一张细胞网格，丛心最高 */
function colony(x: number, y: number, seed: number): number {
  const cell = cellNearest(x * 1.1, y * 1.1, seed + 32)
  const t = 1 - (Math.hypot(cell.dx, cell.dy) / 0.62) ** 2
  return t > 0 ? COLONY_M * Math.sqrt(t) : 0
}

/** (x, y) 处地面的高（米）：海底的高加上沙纹与骨头 */
export function groundM(sc: PaintScene, x: number, y: number): number {
  const plan = sc.plan
  let z = seabedM(plan, x, y)
  toLocal(plan.frame, x, y, LC)
  reachOf(plan.edges, LC.a, LC.b, RE)
  const calm = calmAt(x, y, plan.seed)
  if (calm > 0) z += RIPPLE_M * calm * ripple(x, y, plan.seed)
  const e = plan.edges
  const reefT = smooth(0, 0.18, Math.max(-RE.low / e.wallU[0], -RE.high / e.wallU[1], -RE.rubble / e.rubbleU))
  if (reefT > 0) z += reefT * colony(x, y, plan.seed)
  for (const s of plan.boulders) {
    const k = inBoulder(s, x, y)
    if (k > 0) z += smooth(0, 0.25, k) * colony(x, y, s.seed)
  }
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
