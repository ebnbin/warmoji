import { SUN } from '../data/light'
import { GROUND_PPU } from '../data/texel'
import { BLADE, BLADE_REACH, bladeDist } from './blade'
import { bucketOf, crownHeight, leafColor } from './crown'
import type { Crowns } from './crown'

/** 枫树的树冠与落叶：画在秋天的地图上，树冠一片片掌状的叶子叠出来，地上一片片落叶撒开 */

/** 树冠贴图每格多少像素：一片片枫叶要看得出 */
export const CANOPY_PPU = 36
/** 整张画面往暖里调：秋天午后斜照的阳光，偏橙黄 */
export const GRADE = { r: 1.05, g: 1.0, b: 0.9 } as const

const LX = SUN.x
const LY = SUN.y
const LZ = SUN.z
const SUN_LEN = Math.hypot(LX, LY)
const TO_SUN = { x: LX / SUN_LEN, y: LY / SUN_LEN }
const SUN_3D = Math.hypot(LX, LY, LZ)

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)
/** 整数格点上的哈希，落在 [0, 1) */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 点到线段的距离与线段上的比例 */
const SEG = { d: 0, t: 0 }
function segDist(ax: number, ay: number, bx: number, by: number, x: number, y: number): typeof SEG {
  const ex = bx - ax
  const ey = by - ay
  const t = clamp01(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1e-12))
  SEG.t = t
  SEG.d = len(x - ax - ex * t, y - ay - ey * t)
  return SEG
}

/** 落了几天的叶子：橙褐、赭黄、枯褐 */
const OLD = [
  [200, 120, 50],
  [184, 132, 66],
  [176, 142, 88],
] as const
/** 落叶铺厚了，底下透出来的那层：半烂的叶子，橙褐 */
export const MULCH = [180, 122, 62] as const
/** 落在地上的叶子干了、沾了土，比树上的暗这么多 */
const FALLEN = 0.94
/** 地上的一片落叶边缘柔和多宽（格）：半个像素 */
const LITTER_AA_U = 0.6 / GROUND_PPU

/** litterAt 盖住的那片叶子的颜色 */
export const LIT = [0, 0, 0]

/**
 * 一层落叶：按 scale 的格子撒（每格多少片），一格里有没有一片按 dens 定；一片叶子落在格子里随便一处、朝哪都有、大小不一，
 * 能伸进相邻的格子，叠在一起时哈希大的压着小的。颜色多半是挨着的那棵树 owner 的叶色（palettes 是每棵树用哪种叶色），新落的鲜、放了几天的发褐，
 * 叶缘微微卷起、暗一点，叶脉一道道浅浅地凹下去。有就把颜色写进 LIT，返回盖住了多少
 */
export function litterAt(x: number, y: number, scale: number, seed: number, dens: number, owner: number, palettes: Int32Array, small: number): number {
  const sx = x * scale
  const sy = y * scale
  const ix = Math.floor(sx)
  const iy = Math.floor(sy)
  let top = -1
  let alpha = 0
  let hx = 0
  let hy = 0
  let lobe = -1
  let axis = 0
  let along = 0
  let edge = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      if (hash2(cx, cy, seed) >= dens) continue
      const size = small * (0.72 + 0.56 * hash2(cx, cy, seed + 3))
      const dx = sx - cx - hash2(cx, cy, seed + 1)
      const dy = sy - cy - hash2(cx, cy, seed + 2)
      const reach = size * BLADE_REACH
      if (dx * dx + dy * dy > reach * reach) continue
      const order = hash2(cx, cy, seed + 6)
      if (order < top) continue
      const ang = hash2(cx, cy, seed + 4) * Math.PI * 2
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const d = (bladeDist((dx * ca + dy * sa) / size, (dy * ca - dx * sa) / size, hash2(cx, cy, seed + 5) < 0.82 ? 7 : 5, 0) * size) / scale
      const a = smooth(LITTER_AA_U, -LITTER_AA_U, d)
      if (a <= 0) continue
      top = order
      alpha = a
      hx = cx
      hy = cy
      lobe = BLADE.lobe
      axis = BLADE.axis
      along = BLADE.along
      edge = d
    }
  }
  if (top < 0) return 0
  const pick = hash2(hx, hy, seed + 7)
  const pal = owner >= 0 && pick < 0.78 ? palettes[owner]! : Math.floor(hash2(hx, hy, seed + 8) * 4)
  leafColor(pal, 0.15 + 0.75 * hash2(hx, hy, seed + 9), LIT)
  const age = hash2(hx, hy, seed + 10)
  if (age > 0.5) {
    const o = OLD[Math.floor(hash2(hx, hy, seed + 11) * OLD.length)]!
    const k = smooth(0.5, 0.95, age) * 0.85
    LIT[0] = LIT[0]! + (o[0] - LIT[0]!) * k
    LIT[1] = LIT[1]! + (o[1] - LIT[1]!) * k
    LIT[2] = LIT[2]! + (o[2] - LIT[2]!) * k
  }
  const vary = (0.8 + 0.2 * hash2(hx, hy, seed + 12)) * FALLEN
  const vein = lobe >= 0 && axis < 0.05 ? (1 - axis / 0.05) * 0.16 * (1 - along) : 0
  const curl = smooth(-0.025, -0.004, edge) * 0.2
  const k = vary * (1 - vein) * (1 - curl)
  LIT[0] = LIT[0]! * k
  LIT[1] = LIT[1]! * k
  LIT[2] = LIT[2]! * k
  return alpha
}

/** 树冠里叶子的边柔和多宽（格）：半个多像素 */
const LEAF_AA_U = 0.6 / CANOPY_PPU
/** 树皮：灰褐，嫩枝带一点红 */
const BARK = [112, 90, 80] as const

/** leafShade 与 twigAt 写出来的颜色 */
const LS = [0, 0, 0]

/** 树冠里找挡太阳的叶子：往太阳那边每走一步看一眼高度图，最远走多远（格）；光线每往太阳那边走一格升多高（米）——比真的陡，树冠里的影子短一些 */
const SELF_STEP_U = 0.06
const SELF_REACH_U = 0.6
const SELF_RISE_M = 1.1
/** 被上面的叶子遮住的叶子还剩多少直射的光；四周的叶子比它高过这么多（米）就整个闷在树冠里 */
const SELF_SHADE = 0.42
const BURIED_M = 0.7

/** 第 i 片叶子在本地坐标里的 (u, v)：顺着正中那片裂片量、横着量，按叶子的大小量 */
const UV = { u: 0, v: 0 }
function leafLocal(c: Crowns, i: number, x: number, y: number): typeof UV {
  const dx = x - c.x[i]!
  const dy = y - c.y[i]!
  const s = c.size[i]!
  UV.u = (dx * c.cos[i]! + dy * c.sin[i]!) / (s * c.squash[i]!)
  UV.v = (dy * c.cos[i]! - dx * c.sin[i]!) / s
  return UV
}

/**
 * 树冠里第 i 片叶子在这一点 (x, y) 的颜色，写进 LS：叶心与中脉的根浅一点、偏橙，裂片的尖深一点；中脉一道细细的浅线；
 * 叶面朝着太阳的亮；往太阳那边有更高的叶子挡着就落在影子里，四周的叶子都比它高就闷在树冠里，更暗；叶缘一圈暗一点，一片片分得开。
 * d 是离叶缘多远（格，叶片里为负），lobe、axis、along 是 BLADE 里记下的最近的裂片
 */
function leafShade(c: Crowns, i: number, x: number, y: number, d: number, lobe: number, axis: number, along: number): void {
  let r = c.r[i]!
  let g = c.g[i]!
  let b = c.b[i]!
  const heart = lobe < 0 ? 1 : smooth(0.32, 0, along)
  r += (Math.min(255, r * 1.04 + 8) - r) * heart * 0.5
  g += (Math.min(255, g * 1.22 + 18) - g) * heart * 0.5
  b += (Math.min(255, b * 1.1 + 6) - b) * heart * 0.5
  const tip = lobe >= 0 ? smooth(0.55, 1, along) : 0
  r *= 1 - 0.07 * tip
  g *= 1 - 0.16 * tip
  b *= 1 - 0.1 * tip
  if (lobe >= 0 && axis < 0.05) {
    const k = (1 - axis / 0.05) * 0.2 * smooth(0.04, 0.2, along) * (1 - along)
    r += (255 - r) * k * 0.3
    g += (206 - g) * k
    b += (128 - b) * k * 0.6
  }
  const z = c.z[i]!
  let shadow = 0
  for (let s = SELF_STEP_U; s <= SELF_REACH_U && shadow < 1; s += SELF_STEP_U) {
    const over = crownHeight(c, x + TO_SUN.x * s, y + TO_SUN.y * s) - z - s * SELF_RISE_M
    if (over > 0) shadow = Math.max(shadow, smooth(0, 0.12, over))
  }
  const q = 0.16
  const around = Math.max(crownHeight(c, x + q, y), crownHeight(c, x - q, y), crownHeight(c, x, y + q), crownHeight(c, x, y - q))
  const buried = smooth(0.05, BURIED_M, around - z)
  const nx = c.nx[i]!
  const ny = c.ny[i]!
  const lam = Math.max(0, (nx * LX + ny * LY + LZ) / (Math.sqrt(nx * nx + ny * ny + 1) * SUN_3D))
  // 晒到的直射光；背阴的叶子透过上面的叶子透下来的光是橙的：越背阴，绿与蓝压得越低，暗处是饱满的深橙、不发褐
  const direct = lam * (1 - SELF_SHADE * shadow) * (1 - 0.5 * buried)
  const k = (0.62 + 0.7 * direct) * (1 - 0.16 * smooth(-0.02, -0.002, d))
  const dim = 1 - Math.min(1, direct / 0.75)
  LS[0] = r * k * GRADE.r
  LS[1] = g * k * (1 - 0.15 * dim) * GRADE.g
  LS[2] = b * k * (1 - 0.25 * dim) * GRADE.b
}

/** 叶缝里露出来的枝条：这一桶里罩住这一点最高的那段，朝太阳的一侧亮；颜色写进 LS，返回盖住了多少 */
function twigAt(c: Crowns, bk: number, x: number, y: number): number {
  for (let p = c.twigStart[bk]!; p < c.twigStart[bk + 1]!; p++) {
    const tw = c.twigs[c.twigItems[p]!]!
    const s = segDist(tw.ax, tw.ay, tw.bx, tw.by, x, y)
    const half = (tw.w0 + (tw.w1 - tw.w0) * s.t) / 2
    const a = smooth(half + LEAF_AA_U, half - LEAF_AA_U, s.d)
    if (a <= 0) continue
    const ex = tw.bx - tw.ax
    const ey = tw.by - tw.ay
    const el = len(ex, ey) || 1
    const side = ((x - tw.ax) * -ey + (y - tw.ay) * ex) / el / Math.max(1e-3, half)
    const facing = side * ((-ey * TO_SUN.x + ex * TO_SUN.y) / el)
    const k = 0.66 + 0.34 * clamp01(0.5 + facing * 0.6)
    LS[0] = BARK[0] * k * GRADE.r
    LS[1] = BARK[1] * k * GRADE.g
    LS[2] = BARK[2] * k * GRADE.b
    return a
  }
  return 0
}

/** 颜色 (r, g, b) 按透明度 a 叠在底下的 (ur, ug, ub, ua) 上，写进 out[o..o+3]：贴图按不预乘的透明度存 */
export function over(out: Uint8ClampedArray, o: number, r: number, g: number, b: number, a: number, ur: number, ug: number, ub: number, ua: number): void {
  const oa = a + ua * (1 - a)
  if (oa <= 0) {
    out[o + 3] = 0
    return
  }
  out[o] = (r * a + ur * ua * (1 - a)) / oa
  out[o + 1] = (g * a + ug * ua * (1 - a)) / oa
  out[o + 2] = (b * a + ub * ua * (1 - a)) / oa
  out[o + 3] = oa * 255
}

/**
 * 树冠在 (x, y) 格处盖住的东西，叠在底色 (ur, ug, ub, ua) 上写进 out[o..o+3]：每一点取最高的那片叶子，它的边上透出底下那片叶子，
 * 再底下是叶缝里的枝条，什么都没有就只剩底色。按太阳打光，边缘柔和
 */
export function coverLeaves(c: Crowns, x: number, y: number, out: Uint8ClampedArray, o: number, ur: number, ug: number, ub: number, ua: number): void {
  const bk = bucketOf(c, x, y)
  if (bk < 0 || c.start[bk] === c.start[bk + 1]) {
    over(out, o, 0, 0, 0, 0, ur, ug, ub, ua)
    return
  }
  // 从高到低找盖住这一点的叶子：最上面那片，它边上透出来的下一片
  const p0 = c.start[bk]!
  const p1 = c.start[bk + 1]!
  let first = -1
  let a1 = 0
  let d1 = 0
  let lobe1 = -1
  let axis1 = 0
  let along1 = 0
  let second = -1
  let a2 = 0
  let d2 = 0
  let lobe2 = -1
  let axis2 = 0
  let along2 = 0
  for (let p = p0; p < p1; p++) {
    const i = c.items[p]!
    const dx = x - c.x[i]!
    const dy = y - c.y[i]!
    const reach = c.size[i]! * BLADE_REACH + LEAF_AA_U
    if (dx * dx + dy * dy > reach * reach) continue
    const l = leafLocal(c, i, x, y)
    const d = bladeDist(l.u, l.v, c.lobes[i]!, 0) * c.size[i]!
    const a = smooth(LEAF_AA_U, -LEAF_AA_U, d)
    if (a <= 0) continue
    if (first < 0) {
      first = i
      a1 = a
      d1 = d
      lobe1 = BLADE.lobe
      axis1 = BLADE.axis
      along1 = BLADE.along
      if (a >= 0.999) break
      continue
    }
    second = i
    a2 = a
    d2 = d
    lobe2 = BLADE.lobe
    axis2 = BLADE.axis
    along2 = BLADE.along
    break
  }
  // 底下：下一片叶子，没有就是叶缝里的枝条
  let br = 0
  let bg = 0
  let bb = 0
  let ba = 0
  if (a1 < 0.999) {
    if (second >= 0) {
      leafShade(c, second, x, y, d2, lobe2, axis2, along2)
      // 压在上面那片叶子的边底下，暗一点
      const k = 1 - 0.3 * a1
      br = LS[0]! * k
      bg = LS[1]! * k
      bb = LS[2]! * k
      ba = a2
    } else {
      const ta = twigAt(c, bk, x, y)
      if (ta > 0) {
        br = LS[0]!
        bg = LS[1]!
        bb = LS[2]!
        ba = ta
      }
    }
  }
  if (first < 0) {
    over(out, o, br, bg, bb, ba, ur, ug, ub, ua)
    return
  }
  leafShade(c, first, x, y, d1, lobe1, axis1, along1)
  // 先把底下那层叠在底色上，再把最上面那片叶子叠上去
  const la = ba + ua * (1 - ba)
  const lr = la > 0 ? (br * ba + ur * ua * (1 - ba)) / la : 0
  const lg = la > 0 ? (bg * ba + ug * ua * (1 - ba)) / la : 0
  const lb = la > 0 ? (bb * ba + ub * ua * (1 - ba)) / la : 0
  over(out, o, LS[0]!, LS[1]!, LS[2]!, a1, lr, lg, lb, la)
}
