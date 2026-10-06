import { SUN } from '../../data/light'
import { cellNearest, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import type { Acacia, Lump, SavannaPlan } from './layout'

const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 金合欢树冠的一层：平平的一片叶，圆心与半径（格），越往后的层越高 */
export interface Plate {
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 一棵金合欢的树冠由几层平顶的叶片摞成：大的一层在底下，小的几层偏开一点摞在上面；按树的种子定，每次都一样 */
export function platesOf(a: Acacia, seed: number): Plate[] {
  const rng = new Rng(seed ^ 0xacac1a)
  const cx = a.x + a.ox
  const cy = a.y + a.oy
  const out: Plate[] = [{ x: cx, y: cy, r: a.crown * 0.82 }]
  const n = rng.int(3, 5)
  for (let i = 0; i < n; i++) {
    const ang = rng.next() * Math.PI * 2
    const d = a.crown * (0.25 + 0.3 * rng.next())
    out.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r: a.crown * (0.38 + 0.22 * rng.next()) })
  }
  return out
}

/** 树冠在 (x, y) 格处：盖住多少（0 到 1），最上面那层是第几层、离那层的中心多远（相对半径）、往哪边 */
export const CROWN = { cover: 0, top: -1, d: 0, dx: 0, dy: 0 }

/** 一片叶的边是一簇簇羽状的小叶：按噪声参差 */
function plateEdge(p: Plate, seed: number, x: number, y: number): number {
  const dx = x - p.x
  const dy = y - p.y
  const d = Math.hypot(dx, dy) / p.r
  const frill = (valueNoise(x * 5.5, y * 5.5, seed + 3) - 0.5) * 0.22 + (valueNoise(x * 13, y * 13, seed + 5) - 0.5) * 0.08
  return d + frill
}

/** 树冠在 (x, y) 格处盖住多少，最上面一层是哪层，写进 CROWN；叶片之间与中间漏几处天窗 */
export function crownAt(plates: readonly Plate[], seed: number, x: number, y: number): number {
  let cover = 0
  let top = -1
  for (let i = 0; i < plates.length; i++) {
    const p = plates[i]!
    const e = plateEdge(p, seed + i * 7, x, y)
    const c = smooth(1.02, 0.86, e)
    if (c > 0.02) top = i
    cover = Math.max(cover, c)
  }
  const holes = smooth(0.7, 0.76, fbm(x * 1.6, y * 1.6, seed + 9, 2)) * 0.8
  const speck = smooth(0.84, 0.9, valueNoise(x * 9, y * 9, seed + 11)) * 0.5
  cover = clamp01(cover - holes - speck * cover * 0.6)
  CROWN.cover = cover
  CROWN.top = top
  if (top >= 0) {
    const p = plates[top]!
    CROWN.dx = (x - p.x) / p.r
    CROWN.dy = (y - p.y) / p.r
    CROWN.d = Math.hypot(CROWN.dx, CROWN.dy)
  }
  return cover
}

/**
 * 树冠一点的颜色（0 到 1），写进 out；一片片平顶的叶迎光的边暖亮，背光的边与被上一层挡着的地方暗下去透着紫，
 * 叶面是一粒粒细碎的小叶
 */
export function crownColor(plates: readonly Plate[], seed: number, x: number, y: number, out: number[]): number {
  const cover = crownAt(plates, seed, x, y)
  if (cover <= 0) return 0
  const top = CROWN.top
  const facing = (CROWN.dx * L.x + CROWN.dy * L.y) / Math.hypot(L.x, L.y)
  const rim = smooth(0.5, 0.95, CROWN.d) * facing
  // 上面那层投下的影：朝太阳那边挪一点还被更高的层盖着，就在影子里
  let shade = 0
  for (let i = top + 1; i < plates.length; i++) {
    const p = plates[i]!
    const sx = x + L.x * 0.35
    const sy = y + L.y * 0.35
    if (Math.hypot(sx - p.x, sy - p.y) < p.r * 0.92) shade = Math.max(shade, 0.65)
  }
  const q = cellNearest(x * 4.5, y * 4.5, seed + 13)
  const clump = clamp01(0.5 + (q.dx * L.x + q.dy * L.y) * 1.6)
  const feather = valueNoise(x * 24, y * 24, seed + 17) * 0.6 + valueNoise(x * 11, y * 11, seed + 19) * 0.4
  const gap = smooth(0.3, 0.18, feather)
  const leaf = (0.84 + 0.16 * clump) * (0.8 + 0.34 * feather) * (1 - 0.3 * gap)
  const tier = top / Math.max(1, plates.length - 1)
  const lit = clamp01((0.5 + 0.35 * rim + 0.15 * tier) * (1 - shade))
  out[0] = (0.22 + 0.38 * lit + 0.09 * smooth(0.62, 1, lit)) * leaf
  out[1] = (0.26 + 0.36 * lit + 0.04 * smooth(0.62, 1, lit)) * leaf
  out[2] = (0.24 + 0.1 * lit) * leaf
  return cover
}

/** 蚁丘的一座尖塔：中心、底半径（格）与高（米） */
export function spiresOf(plan: SavannaPlan): Lump[] {
  const out: Lump[] = []
  plan.mounds.forEach((m, i) => {
    const rng = new Rng(plan.seed ^ (0x7e7 + i * 131))
    out.push({ x: m.x, y: m.y, r: m.r, h: m.h })
    const n = rng.int(3, 4)
    for (let k = 0; k < n; k++) {
      const ang = rng.next() * Math.PI * 2
      const d = m.r * (0.3 + 0.35 * rng.next())
      out.push({ x: m.x + Math.cos(ang) * d, y: m.y + Math.sin(ang) * d, r: m.r * (0.4 + 0.25 * rng.next()), h: m.h * (0.45 + 0.35 * rng.next()) })
    }
  })
  return out
}

/** 一段枯枝：两头的位置（格）与离地多高（米），粗细（格） */
export interface Twig {
  readonly ax: number
  readonly ay: number
  readonly az: number
  readonly bx: number
  readonly by: number
  readonly bz: number
  readonly w: number
}

/** 枯树：从树干往四周伸出几根粗枝，往外一回回分叉，越分越细；从上往下看是一只张开的手。每个线程按同一个种子各长一遍 */
export function snagTwigs(plan: SavannaPlan): Twig[] {
  const out: Twig[] = []
  plan.snags.forEach((s, i) => {
    const rng = new Rng(plan.seed ^ (0x5a9 + i * 977))
    const grow = (x: number, y: number, z: number, ang: number, len: number, w: number, depth: number): void => {
      const bx = x + Math.cos(ang) * len
      const by = y + Math.sin(ang) * len
      const bz = z + len * (0.5 + 0.5 * rng.next())
      out.push({ ax: x, ay: y, az: z, bx, by, bz, w })
      if (depth <= 0 || w < 0.025) return
      const n = rng.int(2, 3)
      for (let k = 0; k < n; k++) {
        const spread = (k / Math.max(1, n - 1) - 0.5) * 1.2 + (rng.next() - 0.5) * 0.5
        grow(bx, by, bz, ang + spread, len * (0.55 + rng.next() * 0.25), w * 0.6, depth - 1)
      }
    }
    const arms = rng.int(3, 4)
    const a0 = rng.next() * Math.PI * 2
    for (let k = 0; k < arms; k++) grow(s.x, s.y, s.h * 0.55, a0 + (k / arms) * Math.PI * 2 + (rng.next() - 0.5) * 0.8, 0.65 + rng.next() * 0.4, s.r * 0.7, 3)
  })
  return out
}
