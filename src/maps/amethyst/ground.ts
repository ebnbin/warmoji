import { UNIT } from '../../util/units'
import { SUN } from '../../data/light'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { roomAt } from '../basin'
import { beamFrame, beamHalf, BIN, binAt, blockM, geodeDepth, hallDepth, heightM, hexNorm, prismFrame, prismHalf, riftDepth, skyAbove, STRIP_PAD_U, tunnelDepth, UPRIGHT } from './layout'
import type { AmethystLayout, Beam, Cluster, Geode, Nodule, Prism } from './layout'

/** 地面贴图与法线贴图每格多少像素 */
export const FACE_PPU = 32
/** 高度图（挡光的高度与开口）每格多少像素 */
export const RELIEF_PPU = 16
/** 开口的边在高度图上柔化的宽度，格：两个半像素，放大了看光斑边上也不起台阶，像阳光的半影 */
const SKY_SOFT_U = 2.5 / RELIEF_PPU
/** 画不到的地方的底色：比最暗的岩体还暗一点的紫黑 */
export const ROCK_BG = [13, 8, 19] as const
/** 晶面的镜面有多尖：越大，晶面要越正对着反射方向才闪 */
export const SHINE = 56
/** 从洞厅进暗道这么深，洞底与洞壁才全换成暗道里的样子，格 */
const TUNNEL_BLEND_U = 2
/** 黄水晶成片地长：每局占洞厅与洞壁的几成，片的大小（格），片里有几成晶体是它，片的边上过渡多宽（按噪声算） */
const GOLD_AREA = 0.22
const GOLD_WAVE_U = 8
const GOLD_SHARE = 0.85
const GOLD_EDGE = 0.05

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function ease(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const frac = (x: number): number => x - Math.floor(x)
/** 整数上的哈希，落在 [0, 1) */
function hash1(n: number, seed: number): number {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 洞壁上出怪的晶缝，像素：口子在洞底边上的位置与朝洞里的单位方向 */
export interface Seam {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/** 一个像素正在画的样子：固有色、表面朝向（单位向量，z 朝上）、有多亮的镜面（晶面接近 1，岩石接近 0） */
interface Px {
  r: number
  g: number
  b: number
  nx: number
  ny: number
  nz: number
  gloss: number
}

function paint(p: Px, r: number, g: number, b: number): void {
  p.r = r
  p.g = g
  p.b = b
}

function blend(p: Px, r: number, g: number, b: number, t: number): void {
  p.r += (r - p.r) * t
  p.g += (g - p.g) * t
  p.b += (b - p.b) * t
}

function dim(p: Px, k: number): void {
  p.r *= k
  p.g *= k
  p.b *= k
}

function face(p: Px, x: number, y: number, z: number): void {
  const l = Math.hypot(x, y, z) || 1
  p.nx = x / l
  p.ny = y / l
  p.nz = z / l
}

function copy(to: Px, from: Px): void {
  to.r = from.r
  to.g = from.g
  to.b = from.b
  to.nx = from.nx
  to.ny = from.ny
  to.nz = from.nz
  to.gloss = from.gloss
}

/** p 按 t 换成 q 的样子：颜色、朝向与镜面一起过渡 */
function mix(p: Px, q: Px, t: number): void {
  blend(p, q.r, q.g, q.b, t)
  face(p, p.nx + (q.nx - p.nx) * t, p.ny + (q.ny - p.ny) * t, p.nz + (q.nz - p.nz) * t)
  p.gloss += (q.gloss - p.gloss) * t
}

const SUN_LEN = Math.hypot(SUN.x, SUN.y, SUN.z)

/** 烘进晶体固有色的光：和画面里的太阳同一个方向，晶面朝着它亮、背着它暗，平光下也看得出棱角 */
function keyed(p: Px): void {
  dim(p, 0.6 + 0.6 * Math.max(0, (p.nx * SUN.x + p.ny * SUN.y + p.nz * SUN.z) / SUN_LEN))
}

/** 紫水晶从根到尖的颜色：根部几乎无色、发白，往尖上越来越紫，最尖处是深紫；deep 是这一块晶体本身的深浅 */
function amethyst(p: Px, t: number, deep: number): void {
  const k = clamp01(t) ** 0.8
  const d = 0.75 + 0.5 * deep
  paint(p, 226 - 108 * k * d, 212 - 158 * k * d, 244 - 40 * k * d)
}

/** 黄水晶从根到尖的颜色：紫水晶受过热就成了它，根部几乎无色，往尖上越来越黄，最尖处是金黄 */
function citrine(p: Px, t: number, deep: number): void {
  const k = clamp01(t) ** 0.8
  const d = 0.75 + 0.5 * deep
  paint(p, 250 - 6 * k * d, 240 - 34 * k * d, 220 - 140 * k * d)
}

function gem(p: Px, t: number, deep: number, gold: boolean): void {
  if (gold) citrine(p, t, deep)
  else amethyst(p, t, deep)
}

function goldNoise(L: AmethystLayout, gx: number, gy: number): number {
  return fbm(gx / GOLD_WAVE_U, gy / GOLD_WAVE_U, L.seed + 211, 2)
}

const GOLD_LEVELS = new WeakMap<AmethystLayout, number>()

/** 黄水晶那几片的门槛：取在洞厅与洞壁里噪声的分位上，片落在哪随种子变，面积每局差不多 */
function goldLevel(L: AmethystLayout): number {
  let level = GOLD_LEVELS.get(L)
  if (level !== undefined) return level
  const f = L.field
  const wall = L.wallU * UNIT
  const vals: number[] = []
  for (let y = f.y; y < f.y + f.h; y += UNIT / 2) {
    for (let x = f.x; x < f.x + f.w; x += UNIT / 2) if (roomAt(L.shell, x, y) > -wall) vals.push(goldNoise(L, x / UNIT, y / UNIT))
  }
  vals.sort((a, b) => a - b)
  level = vals[Math.floor(vals.length * (1 - GOLD_AREA))] ?? 1
  GOLD_LEVELS.set(L, level)
  return level
}

/** 这里的晶体有几成是黄水晶：片外一根也没有 */
function goldShare(L: AmethystLayout, gx: number, gy: number): number {
  const level = goldLevel(L)
  return GOLD_SHARE * ease(level, level + GOLD_EDGE, goldNoise(L, gx, gy))
}

/** 按位置给一样东西掷一次：同一样东西各处取到的一样 */
function rollAt(x: number, y: number, seed: number): number {
  return hash1(Math.round(x) * 4099 + Math.round(y), seed)
}

// ————————————————————————————— 洞壁 —————————————————————————————

/** 洞壁上那一圈：贴着洞底的是一排排朝洞里长的晶体（外面一排小的、里面一排大的），再往外是一层层浅紫与灰紫的玛瑙，最外是玄武岩 */
function lining(p: Px, g: Geode, gi: number, u: number, wx: number, wy: number, gx: number, gy: number, gold: number, seed: number): void {
  const dx = wx - g.x
  const dy = wy - g.y
  const d = Math.hypot(dx, dy) || 1
  const ix = -dx / d
  const iy = -dy / d
  if (u > 0.8) {
    agate(p, u, gx, gy, seed)
    return
  }
  const along = (Math.atan2(dy, dx) * g.r) / UNIT
  // 晶体之间的缝：深紫，越往外越暗
  paint(p, 40 - 14 * u, 18 - 6 * u, 58 - 18 * u)
  p.gloss = 0.08
  crystalRow(p, along, u, 0.17, 0.4, 0.12, 0.84, ix, iy, gold, seed + 300 + gi * 7)
  crystalRow(p, along + 0.11, u, 0.3, 0.0, 0.16, 0.66, ix, iy, gold, seed + 400 + gi * 7)
}

/**
 * 洞壁上的一排晶体：每根宽 width 格、从 u = tip..tip+spread 处的尖往外长到 base 处的根；俯看是一根根尖朝洞里的棱柱，
 * 左右两个侧面与尖上的锥面朝向不同，光扫过去时一面一面地闪；gold 是这里的晶体有几成是黄水晶
 */
function crystalRow(p: Px, along: number, u: number, width: number, tip: number, spread: number, base: number, ix: number, iy: number, gold: number, seed: number): void {
  const k = Math.floor(along / width)
  const a = along / width - k - 0.5
  const h = hash1(k, seed)
  const top = tip + spread * h
  if (u < top || u > base) return
  const half = 0.36 + 0.1 * hash1(k, seed + 1)
  const tipLen = 0.1 + 0.06 * hash1(k, seed + 2)
  const w = u < top + tipLen ? (half * (u - top)) / tipLen : half
  if (Math.abs(a) > w) return
  const t = (u - top) / (base - top)
  gem(p, 1 - t, hash1(k, seed + 3), hash1(k, seed + 4) < gold)
  // 侧面中间一道亮线：晶体里面的反光
  if (Math.abs(a) < w * 0.18) dim(p, 1.12)
  if (Math.abs(a) > w * 0.85) dim(p, 0.78)
  dim(p, 1 - 0.25 * u)
  const tx = -iy
  const ty = ix
  const side = a < 0 ? -1 : 1
  if (u < top + tipLen) face(p, ix * 0.75 + tx * side * 0.35, iy * 0.75 + ty * side * 0.35, 0.56)
  else face(p, ix * 0.45 + tx * side * 0.6, iy * 0.45 + ty * side * 0.6, 0.66)
  keyed(p)
  p.gloss = 0.95
}

/** 玛瑙：顺着洞壁一层层的浅紫与灰紫，层与层之间一道细细的暗线；再往外是玄武岩 */
function agate(p: Px, u: number, gx: number, gy: number, seed: number): void {
  if (u > 1.06) {
    basalt(p, gx, gy, seed)
    return
  }
  const v = ((u - 0.8) / 0.26 + 0.1 * (fbm(gx * 1.4, gy * 1.4, seed + 71, 2) - 0.5)) * 5
  const band = Math.floor(v)
  const tones = [
    [160, 148, 186],
    [134, 118, 166],
    [150, 138, 180],
    [122, 104, 154],
    [140, 124, 172],
    [154, 142, 184],
  ] as const
  const c = tones[((band % tones.length) + tones.length) % tones.length]!
  paint(p, c[0], c[1], c[2])
  if (frac(v) < 0.1) dim(p, 0.88)
  dim(p, 0.92 + 0.1 * valueNoise(gx * 8, gy * 8, seed + 73))
  p.gloss = 0.04
}

/** 玄武岩：暗得发紫的黑，一个个气孔；少数气孔里长着一点白的沸石或细小的紫晶 */
function basalt(p: Px, gx: number, gy: number, seed: number): void {
  const n = fbm(gx * 0.8, gy * 0.8, seed + 77, 3)
  paint(p, 36 + 12 * n, 26 + 8 * n, 50 + 14 * n)
  dim(p, 0.9 + 0.2 * valueNoise(gx * 7, gy * 7, seed + 79))
  p.gloss = 0.05
  const q = cellNearest(gx * 2.8, gy * 2.8, seed + 81)
  const r = 0.08 + 0.1 * q.h
  const d = Math.hypot(q.dx, q.dy) / r
  if (d >= 1) return
  if (q.h > 0.985) {
    amethyst(p, 0.4 + 0.6 * (1 - d), q.h)
    face(p, q.dx, q.dy, 0.6)
    p.gloss = 0.9
  } else if (q.h > 0.975) paint(p, 156, 148, 172)
  else dim(p, 0.7 + 0.25 * d)
}

/** 晶缝：洞壁上从洞底边往岩体里裂进去、越往里越窄的一道缝，缝里黑洞洞的，缝口两边是崩碎的晶面；缝口前的洞底散着崩下来的碎晶 */
function seam(p: Px, sm: Seam, wx: number, wy: number, seed: number): boolean {
  const dx = wx - sm.x
  const dy = wy - sm.y
  const depth = -(dx * sm.nx + dy * sm.ny) / UNIT
  const across = (-dx * sm.ny + dy * sm.nx) / UNIT
  if (depth < -0.7 || depth > 1.9 || Math.abs(across) > 0.8) return false
  if (depth < 0) {
    const s = cellNearest(wx / UNIT * 6, wy / UNIT * 6, seed + 181)
    if (s.h > 0.5 + 0.5 * (-depth / 0.7) && Math.hypot(s.dx, s.dy) < 0.32) {
      amethyst(p, 0.7, s.h)
      face(p, s.dx, s.dy, 0.7)
      keyed(p)
      p.gloss = 0.9
      return true
    }
    return false
  }
  const half = 0.3 * (1 - depth / 1.9) ** 0.8 + 0.08 * (fbm(depth * 3, across * 2 + sm.x, seed + 171, 2) - 0.5)
  const a = Math.abs(across)
  if (a < half) {
    paint(p, 26 - 10 * (depth / 1.9), 12, 38 - 14 * (depth / 1.9))
    face(p, 0, 0, 1)
    p.gloss = 0.03
    return true
  }
  if (a < half + 0.13) {
    amethyst(p, 0.55 + 0.45 * (1 - depth / 1.9), 0.6)
    const side = across < 0 ? 1 : -1
    face(p, -sm.ny * side * 0.7, sm.nx * side * 0.7, 0.7)
    keyed(p)
    p.gloss = 0.92
    return true
  }
  return false
}

// ————————————————————————————— 洞底 —————————————————————————————

/**
 * 洞底：紫色的细晶砂，大片的明暗起伏，一块块玄武岩碎砾；砂里混着闪亮的晶粒；有几片长着一层细密的晶簇壳；
 * 洞壁脚下散着从壁上掉下的碎晶、湿暗；偶尔一颗磨圆的玉髓卵石；暗道里是暗沉的玄武岩碎砾，tunnel 是进暗道有多深（0 是洞厅，1 是整个进了暗道）
 */
function floor(p: Px, gx: number, gy: number, wallU: number, tunnel: number, seed: number): void {
  const big = fbm(gx / 5, gy / 5, seed + 3, 3)
  paint(p, 100 + 30 * big, 58 + 18 * big, 126 + 34 * big)
  blend(p, 62, 42, 90, 0.8 * ease(0.56, 0.72, fbm(gx / 3.2, gy / 3.2, seed + 21, 2)))
  dim(p, 0.92 + 0.08 * valueNoise(gx * 7, gy * 7, seed + 9) + 0.08 * valueNoise(gx * 9, gy * 9, seed + 11))
  blend(p, 50, 36, 70, 0.8 * tunnel)
  p.gloss = 0.04
  // 晶粒
  const g = cellNearest(gx * 8, gy * 8, seed + 61)
  if (g.h > 0.93 && Math.hypot(g.dx, g.dy) < 0.2) {
    blend(p, 196, 172, 236, 0.75)
    face(p, (frac(g.h * 37.1) - 0.5) * 1.6, (frac(g.h * 91.7) - 0.5) * 1.6, 1)
    p.gloss = 0.9
    return
  }
  const near = 1 - ease(0.2, 1.6, wallU)
  if (tunnel < 1) {
    // 晶簇壳：一层细密的小晶尖，每颗的晶面朝向都不一样，光一扫满片闪；从洞壁往洞里长，越靠壁越多
    const lift = 0.08 * (1 - ease(0.4, 3, wallU))
    const crust = ease(0.7 - lift, 0.78 - lift, fbm(gx / 2.4, gy / 2.4, seed + 41, 2)) * (1 - tunnel)
    if (crust > 0) {
      const q = cellNearest(gx * 7, gy * 7, seed + 43)
      if (q.h > 1 - 1.6 * crust) {
        amethyst(p, 0.62 + 0.38 * frac(q.h * 7.9), frac(q.h * 13.1))
        face(p, (frac(q.h * 31.7) - 0.5) * 1.8, (frac(q.h * 57.3) - 0.5) * 1.8, 1)
        keyed(p)
        if (Math.hypot(q.dx, q.dy) > 0.4) dim(p, 0.55)
        p.gloss = 0.9
        return
      }
      if (crust > 0.5) blend(p, 50, 30, 78, 0.5)
    }
  }
  // 洞壁脚下：碎晶，越贴着壁越多
  const s = cellNearest(gx * 3.4, gy * 3.4, seed + 47)
  if (s.h > 1 - (0.55 * near + 0.04) * (1 - tunnel)) {
    const ang = s.h * 17.3
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const a = s.dx * c + s.dy * sn
    const b = -s.dx * sn + s.dy * c
    const len = 0.22 + 0.16 * frac(s.h * 13.7)
    const w = 0.07 * (1 - Math.abs(a) / len)
    if (Math.abs(a) < len && Math.abs(b) < w) {
      amethyst(p, 0.4 + 0.6 * (a / len + 0.5), frac(s.h * 5.3))
      face(p, -sn * Math.sign(b) * 0.7, c * Math.sign(b) * 0.7, 1)
      p.gloss = 0.9
      return
    }
    if (Math.abs(a) < len * 1.1 && Math.abs(b) < w + 0.05) dim(p, 0.7)
  }
  // 玉髓卵石：磨圆的白里透紫
  const q = cellNearest(gx * 1.6, gy * 1.6, seed + 53)
  if (q.h > 0.975) {
    const r = 0.09 + 0.08 * frac(q.h * 31.3)
    const d = Math.hypot(q.dx, q.dy) / (r * 1.6)
    if (d < 1) {
      const k = 0.85 + 0.15 * (1 - d)
      paint(p, 206 * k, 198 * k, 228 * k)
      face(p, q.dx, q.dy, Math.sqrt(Math.max(0.05, 1 - d * d)) * r * 1.6)
      p.gloss = 0.35
      return
    }
    if (d < 1.25) dim(p, 0.75 + 0.2 * (d - 1) * 4)
  }
  // 洞壁脚下湿暗
  dim(p, 1 - 0.32 * near)
}

/**
 * 塌下来的东西：洞顶的岩粉铺了一层，上面散着从洞顶掉下的碎晶；塌顶下还压着一块块碎石，多是玄武岩、夹着几块玛瑙与紫晶（gold 是晶块有几成是黄水晶），
 * 每块中间一道棱、两边斜下去，块与块之间是暗缝。w 是盖上去的分量；盖住了这一点（画成了碎晶或石块）返回 true
 */
function rubble(p: Px, gx: number, gy: number, w: number, blocks: boolean, gold: number, seed: number): boolean {
  blend(p, 120, 90, 156, (blocks ? 0.55 : 0.3) * w)
  const s = cellNearest(gx * 4.5, gy * 4.5, seed + 107)
  if (s.h > (blocks ? 0.45 : 0.6) && w > 0.35) {
    const ang = s.h * 23.1
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const a = s.dx * c + s.dy * sn
    const b = -s.dx * sn + s.dy * c
    const len = 0.32 + 0.16 * frac(s.h * 7.7)
    if (Math.abs(a) < len && Math.abs(b) < 0.13 * (1 - Math.abs(a) / len)) {
      amethyst(p, 0.45 + 0.55 * (a / len + 0.5), frac(s.h * 3.1))
      if (Math.abs(b) < 0.02) dim(p, 1.12)
      face(p, -sn * Math.sign(b) * 0.75, c * Math.sign(b) * 0.75, 1)
      p.gloss = 0.92
      return true
    }
  }
  if (!blocks) return false
  const q = cellNearest(gx * 2.2, gy * 2.2, seed + 101)
  const edge = cellEdge(gx * 2.2, gy * 2.2, seed + 101)
  if (q.h < 0.3 || w < 0.3) return false
  if (edge < 0.07) {
    dim(p, 1 - 0.5 * w)
    return false
  }
  const kind = frac(q.h * 7.3)
  const k = Math.min(1, w * 1.4)
  if (kind < 0.62) blend(p, 66 + 40 * kind, 50 + 24 * kind, 92 + 40 * kind, k)
  else if (kind < 0.86) blend(p, 184, 170, 212, k)
  else gem(p, 0.6, frac(q.h * 3.9), frac(q.h * 11.3) < gold)
  const ridge = q.h * 29.7
  const side = q.dx * Math.cos(ridge) + q.dy * Math.sin(ridge) > 0 ? 0.75 : -0.75
  face(p, Math.cos(ridge) * side + q.dx * 0.6, Math.sin(ridge) * side + q.dy * 0.6, 1)
  keyed(p)
  dim(p, 0.9 + 0.12 * valueNoise(gx * 7, gy * 7, seed + 103))
  p.gloss = kind < 0.86 ? 0.08 : 0.9
  return true
}

/** 地上半埋的一颗晶洞：外面一圈粗糙的壳，里面一圈圈玛瑙，再往里是一圈朝中心长的紫晶（黄水晶那几片里是黄晶），正中黑洞洞的 */
function nodule(p: Px, n: Nodule, wx: number, wy: number, gx: number, gy: number, L: AmethystLayout, seed: number): boolean {
  const dx = wx - n.x
  const dy = wy - n.y
  const d = Math.hypot(dx, dy) / n.r
  if (d >= 1.25) return false
  if (d >= 1) {
    dim(p, 0.65 + 0.35 * ((d - 1) / 0.25))
    return false
  }
  if (d > 0.8) {
    const k = 0.75 + 0.35 * fbm(gx * 6, gy * 6, seed + 131, 2)
    paint(p, 90 * k, 72 * k, 108 * k)
    p.gloss = 0.05
    return true
  }
  if (d > 0.62) {
    const v = ((0.8 - d) / 0.18) * 4 + 0.3 * fbm(gx * 3, gy * 3, seed + 133, 2)
    const b = Math.floor(v) % 3
    if (b === 0) paint(p, 222, 214, 236)
    else if (b === 1) paint(p, 150, 132, 186)
    else paint(p, 196, 186, 222)
    if (frac(v) < 0.12) dim(p, 0.75)
    p.gloss = 0.3
    return true
  }
  const ix = -dx / (Math.hypot(dx, dy) || 1)
  const iy = -dy / (Math.hypot(dx, dy) || 1)
  const count = 16
  const turn = ((((Math.atan2(dy, dx) + n.turn) / (Math.PI * 2)) % 1) + 1) % 1
  const k = Math.floor(turn * count)
  const a = turn * count - k - 0.5
  const tip = 0.12 + 0.2 * hash1(k, seed + 137)
  paint(p, 34, 12, 52)
  p.gloss = 0.05
  if (d < tip) return true
  const t = (d - tip) / (0.62 - tip)
  const w = Math.min(0.42, t * 1.8)
  if (Math.abs(a) > w) {
    dim(p, 0.8 + 0.4 * t)
    return true
  }
  gem(p, 1 - t, hash1(k, seed + 139), rollAt(n.x, n.y, seed + 141) < goldShare(L, n.x / UNIT, n.y / UNIT))
  const tx = -iy
  const ty = ix
  const side = a < 0 ? -1 : 1
  face(p, ix * 0.6 + tx * side * 0.45, iy * 0.6 + ty * side * 0.45, 0.62)
  keyed(p)
  p.gloss = 0.95
  return true
}

// ————————————————————————————— 晶体 —————————————————————————————

/**
 * 一根晶体俯看的样子：直立的是个正六边形，看到的是尖上的六个锥面；斜着长的是一根尖朝外的棱柱，朝上的那个侧面在中间、左右两个侧面在两边，
 * 尖上是收拢的锥面。颜色从根到尖由白转紫（黄水晶转金黄），侧面中间一道亮线是晶体里的反光，边上一道暗线收住轮廓
 */
function prism(p: Px, q: Prism, wx: number, wy: number, L: AmethystLayout): boolean {
  const gold = (): boolean => rollAt(q.x, q.y, L.seed + 5) < goldShare(L, q.x / UNIT, q.y / UNIT)
  if (q.reach < q.r * UPRIGHT) {
    const dx = wx - q.x
    const dy = wy - q.y
    const d = hexNorm(dx, dy, q.dir) / q.r
    if (d >= 1) return false
    const ang = Math.atan2(dy, dx) - q.dir
    const sector = Math.floor((((ang / (Math.PI / 3)) % 6) + 6) % 6)
    const mid = q.dir + (sector + 0.5) * (Math.PI / 3)
    gem(p, 0.45 + 0.55 * (1 - d), q.tone, gold())
    face(p, Math.cos(mid) * 0.62, Math.sin(mid) * 0.62, 0.79)
    keyed(p)
    if (d > 0.84) dim(p, 0.6)
    p.gloss = 0.95
    return true
  }
  const { s, u } = prismFrame(q, wx, wy)
  const w = prismHalf(q, s)
  if (w <= 0 || Math.abs(u) > w) return false
  const tau = Math.atan2(q.reach, q.top * UNIT)
  const c = Math.cos(q.dir)
  const sn = Math.sin(q.dir)
  // 朝上的侧面法线 (−cosτ·d, sinτ)，左右两个侧面绕晶轴转 ±60°；尖上的锥面再朝晶轴方向倒 52°
  const upx = -Math.cos(tau) * c
  const upy = -Math.cos(tau) * sn
  const upz = Math.sin(tau)
  const ux = -sn
  const uy = c
  const qn = u / w
  const side = qn < -1 / 3 ? -1 : qn > 1 / 3 ? 1 : 0
  let nx = upx * (side === 0 ? 1 : 0.5) + ux * side * 0.866
  let ny = upy * (side === 0 ? 1 : 0.5) + uy * side * 0.866
  let nz = upz * (side === 0 ? 1 : 0.5)
  const end = q.reach + q.r * 0.6
  const tipLen = Math.min(q.reach + q.r, Math.max(q.r * 1.4, (q.reach + q.r) * 0.32))
  if (s > end - tipLen) {
    const ax = Math.sin(tau) * c
    const ay = Math.sin(tau) * sn
    const az = Math.cos(tau)
    nx = ax * 0.62 + nx * 0.79
    ny = ay * 0.62 + ny * 0.79
    nz = az * 0.62 + nz * 0.79
  }
  face(p, nx, ny, Math.max(0.08, nz))
  gem(p, clamp01((s + q.r) / (end + q.r)), q.tone, gold())
  keyed(p)
  if (Math.abs(qn) < 0.12) dim(p, 1.12)
  if (Math.abs(qn) > 0.8) dim(p, 0.6)
  p.gloss = 0.95
  return true
}

/** 一丛晶体里盖住这一点的最高的一根 */
function cluster(p: Px, k: Cluster, wx: number, wy: number, L: AmethystLayout): boolean {
  let hit = false
  for (const q of k.prisms) if (prism(p, q, wx, wy, L)) hit = true
  return hit
}

/**
 * 巨晶：一面着地躺着的一根六棱柱，俯看中间是顶面、两边是斜着的侧面，尖端收成锥；顶面顺着根部抬起的坡朝尖那头倒一点。
 * 深紫，一道道生长纹，棱上一道亮线；根部埋进洞壁
 */
function beam(p: Px, b: Beam, wx: number, wy: number): boolean {
  const { s, u, len } = beamFrame(b, wx, wy)
  const w = beamHalf(b, s, len)
  if (w <= 0 || Math.abs(u) > w) return false
  const ax = (b.tip.x - b.root.x) / len
  const ay = (b.tip.y - b.root.y) / len
  const ux = -ay
  const uy = ax
  const slope = Math.atan(b.lift / (len / UNIT))
  const tx = ax * Math.sin(slope)
  const ty = ay * Math.sin(slope)
  const tz = Math.cos(slope)
  const q = u / w
  let nx = tx
  let ny = ty
  let nz = tz
  if (Math.abs(q) > 0.5) {
    const side = q < 0 ? -1 : 1
    nx = ux * side * 0.866 + tx * 0.5
    ny = uy * side * 0.866 + ty * 0.5
    nz = tz * 0.5
  }
  const tip = b.r * 1.15
  if (s > len - tip) {
    nx = ax * 0.6 + nx * 0.8
    ny = ay * 0.6 + ny * 0.8
    nz = nz * 0.8
  }
  face(p, nx, ny, Math.max(0.1, nz))
  const deep = 0.5 + 0.5 * b.tone
  const band = 1 + 0.07 * Math.sin((s / UNIT) * 9 + (u / UNIT) * 2)
  if (Math.abs(q) <= 0.5) amethyst(p, 0.75 + 0.25 * (s / len), deep)
  else amethyst(p, 0.62 + 0.3 * (s / len), deep)
  dim(p, band)
  keyed(p)
  if (Math.abs(Math.abs(q) - 0.5) < 0.04) blend(p, 214, 190, 250, 0.7)
  if (Math.abs(q) > 0.93) dim(p, 0.6)
  p.gloss = 0.95
  return true
}

// ————————————————————————————— 整张图 —————————————————————————————

/** 一个贴图像素和相邻的差过这些就算在边上：颜色（0 到 255）、法线的 x 与 y 之和、镜面 */
const EDGE_RGB = 24
const EDGE_NORMAL = 0.45
const EDGE_GLOSS = 0.3
/** 边上的像素在中心之外再画这几处（以像素为单位、相对像素中心），连中心一起取平均 */
const AA = [
  [0, -0.3],
  [-0.26, 0.15],
  [0.26, 0.15],
] as const

/** 地面上一点的样子：先放好按高度场求的朝向，再按这一点落在洞壁还是洞底画上去，画到边上淡进底色 */
function sample(p: Px, L: AmethystLayout, seams: readonly Seam[], wx: number, wy: number, nx: number, ny: number, nz: number): void {
  p.nx = nx
  p.ny = ny
  p.nz = nz
  p.gloss = 0
  const f = L.field
  const gx = wx / UNIT
  const gy = wy / UNIT
  const wallPx = L.wallU * UNIT
  const shell = roomAt(L.shell, wx, wy)
  if (shell < 0) rock(p, L, wx, wy, gx, gy, -shell / wallPx, L.seed)
  else ground(p, L, wx, wy, gx, gy, shell / UNIT, L.seed)
  if (shell > -wallPx && shell < UNIT) for (const sm of seams) if (Math.abs(wx - sm.x) < 2 * UNIT && Math.abs(wy - sm.y) < 2 * UNIT && seam(p, sm, wx, wy, L.seed)) break
  const edge = Math.min(wx - f.x, f.x + f.w - wx, wy - f.y, f.y + f.h - wy) / UNIT
  if (edge < 1.5) blend(p, ROCK_BG[0], ROCK_BG[1], ROCK_BG[2], 1 - edge / 1.5)
}

/**
 * 画第 r0 到 r1 行（每格 ppu 像素）的地面固有色与表面朝向，洞壁上画出晶缝：albedo 是 RGBA 的颜色，face 的 R、G 是法线的 x、y（按 0.5 偏移）、B 是镜面的强弱，
 * 都要满 alpha（画布会按透明度预乘）。不含光，光照在着色器里随太阳、月亮与火把实时算；表面朝向先按高度场求，晶体、碎石与卵石换成它们自己的晶面。
 * 每个像素先在中心画一次，和上下左右差得多的（东西的边上）再在 AA 的几处补画、连中心一起取平均，放大了看边上不起台阶；
 * 镜面则按各处的朝向偏离平均朝向多少打折，免得混出来的朝向谁也不朝着却照样闪
 */
export function paintRows(L: AmethystLayout, seams: readonly Seam[], ppu: number, r0: number, r1: number, albedo: Uint8ClampedArray, normal: Uint8ClampedArray): void {
  const f = L.field
  const W = Math.round((f.w / UNIT) * ppu)
  const step = UNIT / ppu
  const meter = step / UNIT
  // 先画的一遍多画上下各一行，好和相邻的比；高度再各多一行，好按高度差求法线
  const rows = r1 - r0 + 2
  const hs = new Float32Array((rows + 2) * W)
  for (let j = 0; j < rows + 2; j++) {
    const wy = f.y + (r0 - 2 + j + 0.5) * step
    for (let i = 0; i < W; i++) hs[j * W + i] = heightM(L, f.x + (i + 0.5) * step, wy)
  }
  const n = rows * W
  const base = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const gloss = new Float32Array(n)
  const p: Px = { r: 0, g: 0, b: 0, nx: 0, ny: 0, nz: 1, gloss: 0 }
  for (let j = 0; j < rows; j++) {
    const wy = f.y + (r0 - 1 + j + 0.5) * step
    const h = j + 1
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      const hx = (hs[h * W + Math.min(W - 1, i + 1)]! - hs[h * W + Math.max(0, i - 1)]!) / (2 * meter)
      const hy = (hs[(h + 1) * W + i]! - hs[(h - 1) * W + i]!) / (2 * meter)
      face(p, -hx, -hy, 1)
      base[k * 3] = p.nx
      base[k * 3 + 1] = p.ny
      base[k * 3 + 2] = p.nz
      sample(p, L, seams, f.x + (i + 0.5) * step, wy, p.nx, p.ny, p.nz)
      col[k * 3] = p.r
      col[k * 3 + 1] = p.g
      col[k * 3 + 2] = p.b
      nor[k * 3] = p.nx
      nor[k * 3 + 1] = p.ny
      nor[k * 3 + 2] = p.nz
      gloss[k] = p.gloss
    }
  }
  const differs = (a: number, b: number): boolean =>
    Math.max(Math.abs(col[a * 3]! - col[b * 3]!), Math.abs(col[a * 3 + 1]! - col[b * 3 + 1]!), Math.abs(col[a * 3 + 2]! - col[b * 3 + 2]!)) > EDGE_RGB ||
    Math.abs(nor[a * 3]! - nor[b * 3]!) + Math.abs(nor[a * 3 + 1]! - nor[b * 3 + 1]!) > EDGE_NORMAL ||
    Math.abs(gloss[a]! - gloss[b]!) > EDGE_GLOSS
  const taps = new Float32Array((AA.length + 1) * 4)
  for (let py = r0; py < r1; py++) {
    const j = py - r0 + 1
    const wy = f.y + (py + 0.5) * step
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      let r = col[k * 3]!
      let g = col[k * 3 + 1]!
      let b = col[k * 3 + 2]!
      let nx = nor[k * 3]!
      let ny = nor[k * 3 + 1]!
      let nz = nor[k * 3 + 2]!
      let gl = gloss[k]!
      if ((i > 0 && differs(k, k - 1)) || (i < W - 1 && differs(k, k + 1)) || differs(k, k - W) || differs(k, k + W)) {
        taps[0] = nx
        taps[1] = ny
        taps[2] = nz
        taps[3] = gl
        for (let s = 1; s <= AA.length; s++) {
          const [ox, oy] = AA[s - 1]!
          sample(p, L, seams, f.x + (i + 0.5 + ox) * step, wy + oy * step, base[k * 3]!, base[k * 3 + 1]!, base[k * 3 + 2]!)
          r += p.r
          g += p.g
          b += p.b
          nx += p.nx
          ny += p.ny
          nz += p.nz
          taps[s * 4] = p.nx
          taps[s * 4 + 1] = p.ny
          taps[s * 4 + 2] = p.nz
          taps[s * 4 + 3] = p.gloss
        }
        r /= AA.length + 1
        g /= AA.length + 1
        b /= AA.length + 1
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l
        ny /= l
        nz /= l
        gl = 0
        for (let s = 0; s <= AA.length; s++) gl += taps[s * 4 + 3]! * Math.max(0, taps[s * 4]! * nx + taps[s * 4 + 1]! * ny + taps[s * 4 + 2]! * nz) ** SHINE
        gl /= AA.length + 1
      }
      const o = ((py - r0) * W + i) * 4
      albedo[o] = r
      albedo[o + 1] = g
      albedo[o + 2] = b
      albedo[o + 3] = 255
      normal[o] = (nx * 0.5 + 0.5) * 255
      normal[o + 1] = (ny * 0.5 + 0.5) * 255
      normal[o + 2] = gl * 255
      normal[o + 3] = 255
    }
  }
}

/** 洞壁与岩体：晶洞的洞壁上长满晶体（暗道的洞壁是在玄武岩里凿的，只在贴着洞底的地方长一溜小晶体）；根部埋进洞壁的巨晶 */
/** 进暗道有多深：洞厅里为 0，进去 TUNNEL_BLEND_U 格以后为 1 */
function intoTunnel(L: AmethystLayout, wx: number, wy: number, seed: number): number {
  let tunnel = -Infinity
  for (const t of L.tunnels) tunnel = Math.max(tunnel, tunnelDepth(t, seed, wx, wy))
  return ease(0, TUNNEL_BLEND_U * UNIT, tunnel - hallDepth(L, wx, wy))
}

/** 暗道的壁：玄武岩，贴着洞底一溜小晶体 */
function tunnelWall(p: Px, gx: number, gy: number, u: number, seed: number): void {
  basalt(p, gx, gy, seed)
  if (u >= 0.22) return
  const g = cellNearest(gx * 6, gy * 6, seed + 151)
  if (g.h > 0.45 && Math.hypot(g.dx, g.dy) < 0.4) {
    amethyst(p, 0.6 + 0.4 * (1 - u / 0.22), g.h)
    face(p, g.dx, g.dy, 0.5)
    p.gloss = 0.9
  }
}

/** 暗道的壁与洞厅的晶壁按比例混的时候，暗道那一边先画在这里 */
const WALL: Px = { r: 0, g: 0, b: 0, nx: 0, ny: 0, nz: 1, gloss: 0 }

function rock(p: Px, L: AmethystLayout, wx: number, wy: number, gx: number, gy: number, u: number, seed: number): void {
  let best = Infinity
  let geode: Geode | null = null
  let gi = 0
  let pocket = false
  const geodes = [...L.chambers, ...L.pockets]
  for (let i = 0; i < geodes.length; i++) {
    const d = -geodeDepth(geodes[i]!, wx, wy)
    if (d >= best) continue
    best = d
    geode = geodes[i]!
    gi = i
    pocket = i >= L.chambers.length
  }
  // 从洞厅的晶壁进暗道，按进去多深换成玄武岩的壁
  const into = pocket ? 0 : intoTunnel(L, wx, wy, seed)
  const gold = goldShare(L, gx, gy)
  if (!geode || into >= 1) tunnelWall(p, gx, gy, u, seed)
  else if (into <= 0) lining(p, geode, gi, u, wx, wy, gx, gy, gold, seed)
  else {
    copy(WALL, p)
    lining(p, geode, gi, u, wx, wy, gx, gy, gold, seed)
    tunnelWall(WALL, gx, gy, u, seed)
    mix(p, WALL, into)
  }
  // 巨晶的根部埋进洞壁
  if (u < 0.45) {
    const { from, to } = binAt(L.bins, wx, wy)
    for (let k = from; k < to; k++) {
      const code = L.bins.items[k]!
      if (code >> 16 !== BIN.beam) continue
      if (beam(p, L.beams[code & 0xffff]!, wx, wy)) blend(p, 40, 18, 58, ease(0.25, 0.45, u))
    }
  }
}

/** 洞底：先画细晶砂，再按附近的东西盖上碎晶坡、地上的晶洞、矮晶丛、晶簇与巨晶，晶体脚下压一圈暗 */
function ground(p: Px, L: AmethystLayout, wx: number, wy: number, gx: number, gy: number, wallU: number, seed: number): void {
  floor(p, gx, gy, wallU, intoTunnel(L, wx, wy, seed), seed)
  const { from, to } = binAt(L.bins, wx, wy)
  let ao = 0
  let debris = 0
  let blocks = false
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    const idx = code & 0xffff
    if (kind === BIN.mound) {
      const m = L.mounds[idx]!
      const d = Math.hypot(wx - m.x, wy - m.y) / m.r + 0.16 * (fbm(gx * 1.25, gy * 1.25, seed + 23, 2) - 0.5)
      const w = ease(1.02, 0.86, d)
      if (w > debris) blocks = true
      debris = Math.max(debris, w)
    } else if (kind === BIN.rift) {
      const d = riftDepth(L.rifts[idx]!, wx, wy) + STRIP_PAD_U * UNIT + 0.2 * UNIT * (fbm(gx * 2, gy * 2, seed + 29, 2) - 0.5)
      debris = Math.max(debris, 0.85 * ease(-0.05 * UNIT, 0.08 * UNIT, d))
    } else if (kind === BIN.cluster || kind === BIN.druse) {
      const c = kind === BIN.cluster ? L.clusters[idx]! : L.druse[idx]!
      const d = Math.hypot(wx - c.x, wy - c.y)
      ao = Math.max(ao, (kind === BIN.cluster ? 0.42 : 0.3) * ease(c.r + (kind === BIN.cluster ? 0.5 : 0.18) * UNIT, c.r * 0.85, d))
    } else if (kind === BIN.beam) {
      const b = L.beams[idx]!
      const { s, u, len } = beamFrame(b, wx, wy)
      const along = Math.max(0, -s, s - len)
      const across = Math.max(0, Math.abs(u) - beamHalf(b, Math.min(len, Math.max(0, s)), len))
      ao = Math.max(ao, 0.4 * ease(0.4 * UNIT, 0, Math.hypot(along, across)))
    }
  }
  if (debris > 0.02 && rubble(p, gx, gy, debris, blocks, goldShare(L, gx, gy), seed)) return
  dim(p, 1 - ao)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    const idx = code & 0xffff
    if (kind === BIN.nodule && nodule(p, L.nodules[idx]!, wx, wy, gx, gy, L, seed)) return
  }
  // 晶体按从矮到高盖：矮晶丛、晶簇、巨晶
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    if (code >> 16 === BIN.druse) cluster(p, L.druse[code & 0xffff]!, wx, wy, L)
  }
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    if (code >> 16 === BIN.cluster) cluster(p, L.clusters[code & 0xffff]!, wx, wy, L)
  }
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    if (code >> 16 === BIN.beam) beam(p, L.beams[code & 0xffff]!, wx, wy)
  }
}

/** 高度图按 16 位存，范围从洞底以下半米到洞顶以上半米 */
export function heightSpan(L: AmethystLayout): { lo: number; span: number } {
  return { lo: -0.5, span: L.ceilingM + 1 }
}

/** 着色器用的高度图：R、G 是 16 位的挡光高度（见 blockM），B 是正上方有多少是天；每格 RELIEF_PPU 像素 */
export function paintRelief(L: AmethystLayout, out: Uint8ClampedArray): void {
  const f = L.field
  const W = Math.round((f.w / UNIT) * RELIEF_PPU)
  const H = Math.round((f.h / UNIT) * RELIEF_PPU)
  const { lo, span } = heightSpan(L)
  for (let py = 0; py < H; py++) {
    const wy = f.y + ((py + 0.5) / RELIEF_PPU) * UNIT
    for (let px = 0; px < W; px++) {
      const wx = f.x + ((px + 0.5) / RELIEF_PPU) * UNIT
      const v = Math.round(clamp01((blockM(L, wx, wy) - lo) / span) * 65535)
      const o = (py * W + px) * 4
      out[o] = v >> 8
      out[o + 1] = v & 255
      out[o + 2] = skyAbove(L, wx, wy, SKY_SOFT_U * UNIT) * 255
      out[o + 3] = 255
    }
  }
}
