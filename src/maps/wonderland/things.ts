import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units.ts'
import { cellNearest, fbm, valueNoise } from '../../util/noise.ts'
import { boundsOf, lawnSdf, sdf, teapotParts } from './layout.ts'
import type { Shape, WonderPlan } from './layout'
import type { WonderlandConfig } from '../../types/maps'

/** 离地一米在画面上往上抬多少格 */
export const LIFT_U = LIFT_PER_M / UNIT
/** 找视线落点时往下走的步长，米：比画面上一个像素还细 */
const DZ = 0.05
/** 落点再二分几次 */
const REFINE = 6

/** 一点上实心的那一段：离地从 lo 到 hi 米 */
export interface Span {
  lo: number
  hi: number
}

/** 视线落在一样东西上的那一点：地上的 (x, y)（格）、离地 z 米；落在顶面还是侧面，那里的法线 */
export interface Hit {
  x: number
  y: number
  z: number
  top: boolean
  nx: number
  ny: number
  nz: number
}

/** 一点的质地：底色（0 到 1），高光多强、多尖，自己发多少光（0 到 1） */
export interface Surf {
  r: number
  g: number
  b: number
  spec: number
  shine: number
  er: number
  eg: number
  eb: number
}

/**
 * 花园里立着的一样东西，格：地上占的外接框、最高多高（米），画在挡人的那一层（occ）还是地面那一层；
 * over 是跨得过它要多高（米）：跨得过的身体站在它上面也不被它挡住
 */
export abstract class Thing {
  x0 = 0
  y0 = 0
  x1 = 0
  y1 = 0
  hmax = 0
  occ = true
  over = Infinity

  protected box(s: Shape, pad = 0): void {
    const [x0, y0, x1, y1] = boundsOf(s)
    this.x0 = x0 - pad
    this.y0 = y0 - pad
    this.x1 = x1 + pad
    this.y1 = y1 + pad
  }

  /** (x, y) 处实心的那一段，没有就是 false */
  abstract span(x: number, y: number, s: Span): boolean
  /** 视线落在 h 的质地 */
  abstract paint(h: Hit, o: Surf): void
}

const sp: Span = { lo: 0, hi: 0 }

/** 屏幕上地面坐标 (x, sy)（格）看过去，视线先碰到这样东西的哪里：离地多高（米），没碰到为 -1 */
export function sightZ(t: Thing, x: number, sy: number): number {
  if (x < t.x0 || x > t.x1) return -1
  const zTop = Math.min(t.hmax, (t.y1 - sy) / LIFT_U)
  const zBot = Math.max(0, (t.y0 - sy) / LIFT_U)
  if (zTop < zBot) return -1
  const inside = (z: number): boolean => t.span(x, sy + z * LIFT_U, sp) && z >= sp.lo && z <= sp.hi
  let z = zTop
  if (inside(z)) return z
  for (z = zTop - DZ; z >= zBot - 1e-9; z -= DZ) {
    if (!inside(Math.max(0, z))) continue
    let a = Math.max(0, z)
    let b = Math.min(zTop, z + DZ)
    for (let k = 0; k < REFINE; k++) {
      const m = (a + b) / 2
      if (inside(m)) a = m
      else b = m
    }
    return a
  }
  return -1
}

/** 视线落在 t 上 z 米处：算出落点与法线写进 h；meterPerU 换算地上的格与米 */
export function hitOf(t: Thing, x: number, sy: number, z: number, mpu: number, h: Hit): Hit {
  const gy = sy + z * LIFT_U
  h.x = x
  h.y = gy
  h.z = z
  t.span(x, gy, sp)
  const hi = sp.hi
  const e = 0.035
  if (z >= hi - 0.06) {
    const at = (px: number, py: number): number => (t.span(px, py, sp) ? sp.hi : hi)
    const gx = (at(x + e, gy) - at(x - e, gy)) / (2 * e * mpu)
    const gyy = (at(x, gy + e) - at(x, gy - e)) / (2 * e * mpu)
    const len = Math.hypot(gx, gyy, 1)
    h.top = true
    h.nx = -gx / len
    h.ny = -gyy / len
    h.nz = 1 / len
    return h
  }
  const at = (px: number, py: number): number => (t.span(px, py, sp) && sp.lo <= z + 0.02 ? sp.hi : 0)
  let gx = at(x + e, gy) - at(x - e, gy)
  let g2 = at(x, gy + e) - at(x, gy - e)
  let len = Math.hypot(gx, g2)
  if (len < 1e-6) {
    gx = 0
    g2 = -1
    len = 1
  }
  h.top = false
  h.nx = -gx / len
  h.ny = -g2 / len
  h.nz = 0
  return h
}

// ————————————————————————————— 小工具 —————————————————————————————

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
export function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function set(o: Surf, r: number, g: number, b: number, spec = 0, shine = 8): void {
  o.r = r
  o.g = g
  o.b = b
  o.spec = spec
  o.shine = shine
  o.er = 0
  o.eg = 0
  o.eb = 0
}
function mix(o: Surf, r: number, g: number, b: number, t: number): void {
  o.r += (r - o.r) * t
  o.g += (g - o.g) * t
  o.b += (b - o.b) * t
}

/** 色相 h（0 到 1）、饱和度 s、亮度 l 的颜色，写进 o 的底色 */
function hsl(o: Surf, h: number, s: number, l: number): void {
  const k = (n: number): number => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  o.r = f(0)
  o.g = f(8)
  o.b = f(4)
}

/** 瓷器的釉色：各只茶具从这几样里挑，暮色里饱和但不甜腻 */
const GLAZES: readonly (readonly [number, number, number])[] = [
  [0.36, 0.55, 0.7],
  [0.86, 0.5, 0.42],
  [0.42, 0.62, 0.5],
  [0.94, 0.78, 0.46],
  [0.58, 0.46, 0.72],
  [0.9, 0.86, 0.8],
]
const GOLD = [0.92, 0.72, 0.32] as const

/** 一片玫瑰：花心 (dx, dy)（格）离点多远、半径 r；按旋开的花瓣画，kind 0 红、1 白、2 刷了一半红漆的白 */
function rose(o: Surf, dx: number, dy: number, r: number, kind: number, k: number): boolean {
  const d = Math.hypot(dx, dy)
  if (d > r) return false
  const a = Math.atan2(dy, dx)
  const t = d / r
  const petal = 0.5 + 0.5 * Math.sin(a * 5 + t * 9 + k * 6)
  const fold = 0.62 + 0.38 * smooth(0.05, 0.9, t) * (0.55 + 0.45 * petal) - 0.25 * smooth(0.82, 1, t)
  let red = kind === 0
  if (kind === 2) {
    // 刷漆的那一半：沿一条歪的线，线上挂着几道往下淌的漆
    const cut = Math.cos(k * 6.28) * dx + Math.sin(k * 6.28) * dy + (valueNoise(dx * 18, dy * 18, 7) - 0.5) * r * 0.5
    red = cut > 0
  }
  if (red) set(o, (0.72 + 0.2 * petal) * fold, 0.08 * fold, 0.14 * fold, 0.25, 16)
  else set(o, 0.94 * fold, 0.91 * fold, 0.84 * fold, 0.2, 14)
  return true
}

/** 一点上的叶子：细碎的叶片明暗与叶缝 */
function leaves(o: Surf, x: number, y: number, z: number, scale: number, base: readonly [number, number, number], seed: number): void {
  const c = cellNearest(x * scale, (y + z * 0.8) * scale, seed)
  const leaf = Math.hypot(c.dx, c.dy)
  const vein = smooth(0.1, 0.5, leaf)
  // 每片叶子朝向不同：有的翻出浅色的叶背，叶缝里是暗的
  const lit = 0.62 + 0.62 * c.h - 0.42 * vein
  const tone = fbm(x * 0.6, y * 0.6, seed + 3, 2)
  const warm = c.h > 0.85 ? 0.12 : 0
  set(o, base[0] * lit * (0.85 + 0.3 * tone) + warm * 0.6, base[1] * lit * (0.9 + 0.2 * tone) + warm * 0.5, base[2] * lit, 0.14, 12)
}

// ————————————————————————————— 四围的玫瑰树篱 —————————————————————————————

/** 草坪边的一道细格子：每格离草坪边多远（格），四围树篱的顶高（米）；画之前一次算好，都靠插值取 */
export interface Grids {
  readonly n: number
  readonly cell: number
  readonly lawn: Float32Array
  readonly edge: Float32Array
  readonly hedge: Float32Array
}

const GRID_U = 1 / 16
/** 树篱顶上叶簇的密度：每格几个 */
const CLUMP = 1.8

export function makeGrids(plan: WonderPlan, cfg: WonderlandConfig): Grids {
  const n = Math.round(FRAME_U / GRID_U)
  const lawn = new Float32Array(n * n)
  const edge = new Float32Array(n * n)
  const hedge = new Float32Array(n * n)
  const H = cfg.lawn.hedgeM
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * GRID_U
      const y = (j + 0.5) * GRID_U
      const d = lawnSdf(plan, x, y)
      lawn[j * n + i] = d
      // 叶团的边毛毛的，不是一刀切的
      edge[j * n + i] = d + (valueNoise(x * 5, y * 5, 31) - 0.5) * 0.18
      // 顶上一簇簇鼓起来的叶团：大的起伏上叠着一个个圆鼓鼓的叶簇，靠草坪的边往下圆
      const lump = (fbm(x * 0.4, y * 0.4, plan.seed ^ 0x51, 3) - 0.5) * 1.1
      const q = cellNearest(x * CLUMP, y * CLUMP, plan.seed ^ 0x77)
      const cd = Math.hypot(q.dx, q.dy)
      const clump = 0.32 * Math.sqrt(Math.max(0, 1 - cd * cd * 1.6))
      const round = d < 0.8 ? 1.1 * (1 - d / 0.8) ** 2 : 0
      hedge[j * n + i] = H + lump + clump - round
    }
  }
  return { n, cell: GRID_U, lawn, edge, hedge }
}

export function sampleGrid(g: Grids, a: Float32Array, x: number, y: number): number {
  const u = Math.min(g.n - 1.001, Math.max(0, x / g.cell - 0.5))
  const v = Math.min(g.n - 1.001, Math.max(0, y / g.cell - 0.5))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fx = u - i
  const fy = v - j
  const k = j * g.n + i
  const p = a[k]!
  const q = a[k + 1]!
  const r = a[k + g.n]!
  const s = a[k + g.n + 1]!
  return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy
}

/** 四围的玫瑰树篱：深绿的叶团里开着红玫瑰、白玫瑰，还有刷了一半红漆的白玫瑰；兔子洞开在它脚下 */
class Hedge extends Thing {
  readonly g: Grids
  readonly plan: WonderPlan
  readonly H: number

  constructor(g: Grids, plan: WonderPlan, H: number) {
    super()
    this.g = g
    this.plan = plan
    this.H = H
    this.x0 = 0
    this.y0 = 0
    this.x1 = FRAME_U
    this.y1 = FRAME_U
    this.hmax = H + 0.7
  }

  span(x: number, y: number, s: Span): boolean {
    if (sampleGrid(this.g, this.g.edge, x, y) < 0) return false
    s.lo = 0
    s.hi = sampleGrid(this.g, this.g.hedge, x, y)
    const h = this.plan.hole
    const hd = Math.hypot(x - h.x, y - h.y)
    if (hd < 0.95) s.lo = Math.max(0, 1.25 * Math.sqrt(Math.max(0, 1 - (hd / 0.95) ** 2)) * smooth(-0.2, 0.6, (x - h.x) * h.nx + (y - h.y) * h.ny + 0.6))
    return true
  }

  paint(h: Hit, o: Surf): void {
    // 侧面的纹理坐标：画面上竖着走一格就是抬高两米，玫瑰才是圆的
    const vy = h.y - h.z * LIFT_U
    leaves(o, h.x, vy, 0, 9, [0.12, 0.27, 0.15], 41)
    const low = smooth(1.8, 0, h.z)
    o.r *= 1 - 0.4 * low
    o.g *= 1 - 0.32 * low
    o.b *= 1 - 0.2 * low
    // 玫瑰一片片地开：疏密跟着一层大的起伏
    const patch = fbm(h.x * 0.35, vy * 0.35, 191, 2)
    const q = cellNearest(h.x * 1.25, vy * 1.25, 97)
    if (q.h < 0.08 + 0.42 * smooth(0.42, 0.7, patch)) {
      const r = (0.24 + 0.14 * hash(Math.floor(q.h * 1e6), 1, 3)) * 1.25
      const kh = (q.h * 13.7) % 1
      const kind = kh < 0.58 ? 0 : kh < 0.82 ? 1 : 2
      if (rose(o, q.dx, q.dy, r, kind, q.h * 7.3) && h.top) o.spec = 0.3
    }
    const hole = this.plan.hole
    const hd = Math.hypot(h.x - hole.x, h.y - hole.y)
    if (hd < 1.1 && h.z < 1.4) {
      // 洞口里黑洞洞的，边上露着土
      const deep = smooth(1.05, 0.6, hd) * smooth(1.4, 0.4, h.z)
      mix(o, 0.05, 0.035, 0.03, deep)
    }
  }
}

// ————————————————————————————— 茶桌、桌上的东西与椅子 —————————————————————————————

/** 桌面离桌边多宽是一圈花边，格 */
const TABLE_BORDER_U = 0.38
/** 桌布垂下来那一圈多厚，格 */
const SKIRT_U = 0.12

class Table extends Thing {
  readonly s: Shape
  readonly hu: number
  readonly hv: number
  readonly plan: WonderPlan
  readonly H: number
  readonly gap: number

  constructor(plan: WonderPlan, H: number, gap: number) {
    super()
    this.plan = plan
    this.H = H
    this.gap = gap
    const t = plan.table
    this.hu = t.len / 2
    this.hv = t.wid / 2
    this.s = { kind: 'box', x: t.x, y: t.y, hx: t.horiz ? this.hu : this.hv, hy: t.horiz ? this.hv : this.hu, a: 0, round: 0.25 }
    this.box(this.s)
    this.hmax = H
    this.over = H
  }

  /** 沿桌长 u、沿桌宽 v，格 */
  private local(x: number, y: number): { u: number; v: number } {
    const t = this.plan.table
    return t.horiz ? { u: x - t.x, v: y - t.y } : { u: y - t.y, v: x - t.x }
  }

  span(x: number, y: number, s: Span): boolean {
    const d = sdf(this.s, x, y)
    if (d > 0) return false
    const { u, v } = this.local(x, y)
    if (d > -SKIRT_U) {
      // 桌布的下摆一弯一弯的
      const along = Math.abs(v) > this.hv - 0.3 ? u : v
      s.lo = this.gap + 0.09 * Math.abs(Math.sin(along * Math.PI * 1.6))
      s.hi = this.H
      return true
    }
    // 四条桌腿藏在桌布里
    const lu = this.hu - 0.55
    const lv = this.hv - 0.45
    if (Math.hypot(Math.abs(u) - lu, Math.abs(v) - lv) < 0.17) {
      s.lo = 0
      s.hi = this.H
      return true
    }
    s.lo = this.H - 0.08
    s.hi = this.H
    return true
  }

  paint(h: Hit, o: Surf): void {
    const { u, v } = this.local(h.x, h.y)
    if (!h.top) {
      // 垂下来的桌布：一道道竖褶，下摆一圈玫瑰色的花边
      const along = Math.abs(v) > this.hv - 0.3 ? u : v
      const fold = 0.86 + 0.14 * Math.sin(along * Math.PI * 3.2)
      set(o, 0.95 * fold, 0.92 * fold, 0.86 * fold, 0.05, 6)
      const fromHem = h.z - this.gap
      if (fromHem < 0.22) mix(o, 0.78, 0.36, 0.44, 0.85)
      else if (fromHem < 0.3) mix(o, 0.98, 0.95, 0.9, 0.7)
      if (h.z < this.gap + 0.02) set(o, 0.3, 0.22, 0.16, 0.1, 10)
      return
    }
    // 桌面：白桌布，桌边一圈花边与两道细条纹，中间织着淡淡的方格暗纹
    set(o, 0.96, 0.94, 0.88, 0.06, 8)
    const inU = this.hu - Math.abs(u)
    const inV = this.hv - Math.abs(v)
    const edge = Math.min(inU, inV)
    if (edge < TABLE_BORDER_U) {
      const band = Math.floor((edge / TABLE_BORDER_U) * 5)
      if (band === 1 || band === 3) mix(o, 0.78, 0.36, 0.44, 0.8)
    } else {
      const damask = (Math.sin(u * 7) * Math.sin(v * 7) > 0.6 ? 1 : 0) * 0.04
      o.r -= damask
      o.g -= damask
      o.b -= damask
    }
    const wear = (fbm(u * 1.5, v * 1.5, 12, 2) - 0.5) * 0.06
    o.r += wear
    o.g += wear
    o.b += wear
  }
}

/** 点心盘上的三只馅饼：(dx, dy) 离最近的那只的中心多远（占馅饼半径的比例），不在馅饼上为 -1 */
function tartAt(dx: number, dy: number, r: number, k: number): number {
  for (let i = 0; i < 3; i++) {
    const a = k * 6.28 + (i * Math.PI * 2) / 3
    const d = Math.hypot(dx - Math.cos(a) * r * 0.42, dy - Math.sin(a) * r * 0.42) / (r * 0.34)
    if (d < 1) return d
  }
  return -1
}

/** 桌上的一样茶具：坐在桌面上，离地 base 米起 */
class TableItem extends Thing {
  readonly cx: number
  readonly cy: number
  readonly item: WonderPlan['items'][number]
  readonly base: number

  constructor(item: WonderPlan['items'][number], plan: WonderPlan, base: number) {
    super()
    this.item = item
    this.base = base
    const t = plan.table
    this.cx = t.horiz ? t.x + item.u : t.x + item.v
    this.cy = t.horiz ? t.y + item.v : t.y + item.u
    const r = item.r * (item.kind === 'hat' ? 1.05 : 1)
    this.x0 = this.cx - r
    this.x1 = this.cx + r
    this.y0 = this.cy - r
    this.y1 = this.cy + r
    this.hmax = base + this.height()
  }

  height(): number {
    switch (this.item.kind) {
      case 'pot':
        return 0.62
      case 'cup':
        return 0.26
      case 'plate':
        return 0.09
      case 'stand':
        return 0.85
      case 'candle':
        return 0.82
      case 'jar':
        return 0.3
      case 'hat':
        return 0.78
    }
  }

  span(x: number, y: number, s: Span): boolean {
    const dx = x - this.cx
    const dy = y - this.cy
    const d = Math.hypot(dx, dy)
    const r = this.item.r
    if (d > r) return false
    const b = this.base
    s.lo = b
    const t = d / r
    switch (this.item.kind) {
      case 'pot': {
        // 圆鼓鼓的小茶壶，顶上一个壶盖钮；壶嘴与壶把各朝一边伸出去
        const a = this.item.k * 6.28
        const along = (dx * Math.cos(a) + dy * Math.sin(a)) / r
        const across = (-dx * Math.sin(a) + dy * Math.cos(a)) / r
        if (t < 0.7) {
          const q = t / 0.7
          s.hi = b + 0.5 * Math.sqrt(Math.max(0, 1 - q ** 2.2)) + (q < 0.18 ? 0.12 : 0)
          return true
        }
        if (along > 0.6 && Math.abs(across) < 0.12) {
          s.lo = b + 0.12 + (along - 0.6) * 0.5
          s.hi = s.lo + 0.12
          return true
        }
        if (along < -0.6 && Math.abs(across) < 0.08) {
          s.lo = b + 0.12
          s.hi = b + 0.4
          return true
        }
        return false
      }
      case 'cup':
        if (t > 0.62) {
          s.hi = b + 0.03
          return true
        }
        s.hi = b + (t > 0.5 ? 0.26 : 0.18)
        return true
      case 'plate':
        s.hi = b + (t > 0.85 ? 0.05 : 0.03) + (tartAt(dx, dy, r, this.item.k) >= 0 ? 0.05 : 0)
        return true
      case 'stand': {
        // 三层的点心架：一层比一层小，中间一根杆
        if (t < 0.08) {
          s.hi = b + 0.85
          return true
        }
        s.hi = t < 0.4 ? b + 0.62 : t < 0.7 ? b + 0.36 : b + 0.1
        return true
      }
      case 'candle':
        if (t < 0.22) {
          s.hi = b + 0.82
          return true
        }
        s.hi = b + 0.06
        return true
      case 'jar':
        s.hi = b + (t > 0.8 ? 0.26 : 0.3)
        return true
      case 'hat':
        // 疯帽子的高礼帽：宽帽檐，帽筒往上微微张开
        s.hi = t < 0.68 ? b + 0.78 : b + 0.07 + 0.04 * Math.cos(Math.atan2(dy, dx) * 2)
        return true
    }
  }

  paint(h: Hit, o: Surf): void {
    const dx = h.x - this.cx
    const dy = h.y - this.cy
    const t = Math.hypot(dx, dy) / this.item.r
    const g = GLAZES[Math.floor(this.item.hue * GLAZES.length)]!
    const z = h.z - this.base
    switch (this.item.kind) {
      case 'pot':
        set(o, g[0], g[1], g[2], 0.65, 40)
        if (Math.abs(z - 0.3) < 0.04 || t < 0.2) mix(o, GOLD[0], GOLD[1], GOLD[2], 0.85)
        return
      case 'cup':
        set(o, 0.95, 0.93, 0.88, 0.5, 40)
        if (t < 0.5 && h.top) set(o, 0.36, 0.2, 0.1, 0.7, 60)
        else if (t > 0.5 && t < 0.62) mix(o, g[0], g[1], g[2], 0.7)
        return
      case 'plate': {
        set(o, 0.95, 0.94, 0.9, 0.45, 30)
        if (t > 0.88) set(o, GOLD[0], GOLD[1], GOLD[2], 0.8, 30)
        // 红心皇后的果酱馅饼：金黄的酥皮一圈，当中一汪红果酱
        const tart = tartAt(dx, dy, this.item.r, this.item.k)
        if (tart >= 0) {
          if (tart < 0.55) set(o, 0.72, 0.08, 0.14, 0.8, 50)
          else set(o, 0.86, 0.6, 0.3, 0.15, 10)
        }
        return
      }
      case 'stand':
        set(o, 0.96, 0.94, 0.9, 0.5, 34)
        if (h.top && t > 0.1 && hash(Math.floor(dx * 5 + 9), Math.floor(dy * 5 + 9), Math.floor(z * 10)) < 0.45) hsl(o, 0.95 - this.item.k * 0.15, 0.55, 0.72)
        if (t < 0.08) set(o, GOLD[0], GOLD[1], GOLD[2], 0.8, 30)
        return
      case 'candle':
        if (t < 0.22 && z > 0.7) {
          // 烛火：自己发光
          set(o, 1, 0.85, 0.5, 0, 1)
          o.er = 1
          o.eg = 0.78
          o.eb = 0.4
          return
        }
        set(o, t < 0.22 ? 0.97 : GOLD[0], t < 0.22 ? 0.93 : GOLD[1], t < 0.22 ? 0.82 : GOLD[2], 0.6, 30)
        return
      case 'jar':
        set(o, 0.6, 0.08, 0.14, 0.7, 50)
        if (t < 0.8 && h.top) set(o, 0.92, 0.88, 0.8, 0.2, 10)
        return
      case 'hat': {
        set(o, 0.2, 0.18, 0.24, 0.25, 16)
        if (!h.top && z > 0.12 && z < 0.26) set(o, 0.62, 0.28, 0.4, 0.2, 12)
        // 帽带上别着的价签：10/6
        const a = Math.atan2(dy, dx)
        if (!h.top && z > 0.18 && z < 0.5 && Math.abs(a - Math.PI / 2) < 0.4) set(o, 0.95, 0.92, 0.82, 0.05, 6)
        return
      }
    }
  }
}

/** 一把椅子：四条腿、椅面，靠背矮矮的；大扶手椅包着红丝绒、镶金边 */
class Chair extends Thing {
  readonly s: Shape
  readonly c: WonderPlan['chairs'][number]
  readonly size: number
  readonly seat: number
  readonly gap: number

  constructor(c: WonderPlan['chairs'][number], size: number, seat: number, gap: number) {
    super()
    this.c = c
    this.size = size
    this.seat = seat
    this.gap = gap
    this.s = { kind: 'box', x: c.x, y: c.y, hx: size / 2, hy: size / 2, a: c.a, round: 0.12 }
    this.box(this.s)
    this.hmax = seat + 0.12
    this.over = seat
  }

  /** 椅子自己的坐标：u 朝桌子（椅背在 u 的负头），v 横着，格 */
  private local(x: number, y: number): { u: number; v: number } {
    const dx = x - this.c.x
    const dy = y - this.c.y
    const ca = Math.cos(this.c.a)
    const sa = Math.sin(this.c.a)
    return { u: dx * ca + dy * sa, v: -dx * sa + dy * ca }
  }

  span(x: number, y: number, s: Span): boolean {
    if (sdf(this.s, x, y) > 0) return false
    const { u, v } = this.local(x, y)
    const h = this.size / 2
    const leg = Math.abs(Math.abs(u) - (h - 0.16)) < 0.09 && Math.abs(Math.abs(v) - (h - 0.16)) < 0.09
    if (u < -h + 0.2) {
      // 椅背：一块比椅面高一截的板
      s.lo = this.gap * 0.6
      s.hi = this.seat + 0.12
      if (leg) s.lo = 0
      return true
    }
    if (this.c.grand && Math.abs(v) > h - 0.22) {
      s.lo = this.gap * 0.6
      s.hi = this.seat + 0.06
      if (leg) s.lo = 0
      return true
    }
    s.lo = leg ? 0 : this.gap
    s.hi = this.seat - 0.12 + (this.c.grand ? 0.06 * Math.cos((u / h) * 1.5) * Math.cos((v / h) * 1.5) : 0)
    return true
  }

  paint(h: Hit, o: Surf): void {
    const { u, v } = this.local(h.x, h.y)
    const hh = this.size / 2
    const frame = Math.abs(u) > hh - 0.13 || Math.abs(v) > hh - 0.13 || u < -hh + 0.2 || h.z < this.seat - 0.2
    if (this.c.grand) {
      // 大扶手椅：深红丝绒，扣着一颗颗金钉，框子描金
      set(o, 0.48, 0.05, 0.11, 0.2, 10)
      const tuft = Math.sin(u * 10) * Math.sin(v * 10)
      if (h.top && tuft > 0.9) mix(o, 0.95, 0.78, 0.4, 0.85)
      if (frame && !(h.top && u < -hh + 0.2 && Math.abs(v) < hh - 0.22)) set(o, GOLD[0] * 0.9, GOLD[1] * 0.85, GOLD[2] * 0.8, 0.7, 28)
      return
    }
    // 各不相同的椅子：漆过的木框，椅面一块花布垫子
    hsl(o, this.c.hue, 0.38, 0.42)
    o.spec = 0.4
    o.shine = 24
    const grain = (valueNoise(u * 3, v * 22, 9) - 0.5) * 0.06
    o.r += grain
    o.g += grain
    o.b += grain
    if (!frame && h.top) {
      hsl(o, (this.c.hue + 0.45) % 1, 0.45, 0.62)
      o.spec = 0.08
      o.shine = 6
      if ((Math.floor(u * 6) + Math.floor(v * 6)) % 2 === 0) mix(o, 0.95, 0.92, 0.85, 0.35)
    }
  }
}

// ————————————————————————————— 茶壶、茶杯与茶碟 —————————————————————————————

/** 立在草坪上的大茶壶：奶白的瓷，腰上一圈手绘的玫瑰，金边，壶盖上一个钮；壶嘴往上翘，壶把悬空 */
class Teapot extends Thing {
  readonly parts: ReturnType<typeof teapotParts>
  readonly t: WonderPlan['teapot']
  readonly H: number

  constructor(t: WonderPlan['teapot'], H: number) {
    super()
    this.t = t
    this.H = H
    this.parts = teapotParts(t)
    const [x0, y0, x1, y1] = this.parts.map((p) => boundsOf(p.shape)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
    this.hmax = H * 1.08
  }

  /** 壶身里的归一化坐标：沿长轴 u、沿短轴 v，都是 -1 到 1 */
  private body(x: number, y: number): { u: number; v: number } {
    const t = this.t
    const dx = x - t.x
    const dy = y - t.y
    const c = Math.cos(t.a)
    const n = Math.sin(t.a)
    return { u: (dx * c + dy * n) / t.rx, v: (-dx * n + dy * c) / t.ry }
  }

  span(x: number, y: number, s: Span): boolean {
    const { u, v } = this.body(x, y)
    const r2 = u * u + v * v
    const H = this.H
    let got = false
    s.lo = 0
    s.hi = 0
    if (r2 < 1) {
      // 圆肩的壶身，顶上一圈壶盖、正中一个钮
      const r = Math.sqrt(r2)
      s.hi = H * 0.86 * Math.pow(Math.max(0, 1 - r ** 2.6), 0.42)
      if (r < 0.42) s.hi = Math.max(s.hi, H * (0.9 + 0.04 * (1 - r / 0.42)))
      if (r < 0.1) s.hi = H * 1.06
      got = true
    }
    const spout = this.parts[1]!.shape
    if (spout.kind === 'seg') {
      const ex = spout.bx - spout.ax
      const ey = spout.by - spout.ay
      const tt = Math.max(0, Math.min(1, ((x - spout.ax) * ex + (y - spout.ay) * ey) / (ex * ex + ey * ey)))
      const d = Math.hypot(x - spout.ax - ex * tt, y - spout.ay - ey * tt)
      const rr = spout.r * (1.1 - 0.4 * tt)
      if (d < rr) {
        const mid = H * (0.38 + 0.36 * tt * tt)
        const half = Math.sqrt(1 - (d / rr) ** 2) * rr * 0.5 / 0.5
        const lo = Math.max(0, mid - half * 0.55)
        const hi = mid + half * 0.55
        if (!got || hi > s.hi) {
          s.lo = got ? 0 : lo
          s.hi = Math.max(s.hi, hi)
        }
        got = true
      }
    }
    const handle = this.parts[2]!.shape
    if (handle.kind === 'seg' && sdf(handle, x, y) < 0) {
      // 壶把：一个竖着的圈，从上面看是一道
      const ex = handle.bx - handle.ax
      const ey = handle.by - handle.ay
      const tt = Math.max(0, Math.min(1, ((x - handle.ax) * ex + (y - handle.ay) * ey) / (ex * ex + ey * ey)))
      const top = H * (0.8 - 0.06 * tt)
      if (!got) {
        s.lo = H * (0.3 + 0.42 * Math.sqrt(1 - Math.min(1, ((tt - 0.6) / 0.6) ** 2)))
        s.hi = top
      }
      got = true
    }
    return got
  }

  paint(h: Hit, o: Surf): void {
    set(o, 0.95, 0.92, 0.85, 0.7, 46)
    const { u, v } = this.body(h.x, h.y)
    const r = Math.hypot(u, v)
    const H = this.H
    const zr = h.z / H
    if (r < 1.02) {
      if (Math.abs(r - 0.42) < 0.035 && zr > 0.85) set(o, GOLD[0], GOLD[1], GOLD[2], 0.9, 40)
      if (r < 0.1) set(o, GOLD[0], GOLD[1], GOLD[2], 0.9, 40)
      // 腰上一圈手绘的玫瑰与叶子
      if (zr > 0.3 && zr < 0.66 && r > 0.55) {
        const a = Math.atan2(v, u)
        const q = cellNearest(a * 3.2, zr * 7, 211)
        const pd = Math.hypot(q.dx, q.dy)
        if (pd < 0.3 && q.h < 0.7) {
          if (q.h < 0.4) set(o, 0.82 - pd, 0.26, 0.34, 0.6, 40)
          else set(o, 0.35, 0.55, 0.38, 0.5, 30)
        }
      }
      if (Math.abs(zr - 0.25) < 0.02 || Math.abs(zr - 0.72) < 0.018) set(o, GOLD[0], GOLD[1], GOLD[2], 0.9, 40)
    } else if (zr > 0.6 && sdf(this.parts[1]!.shape, h.x, h.y) < 0) {
      const sh = this.parts[1]!.shape
      if (sh.kind === 'seg' && Math.hypot(h.x - sh.bx, h.y - sh.by) < sh.r * 0.9) set(o, GOLD[0], GOLD[1], GOLD[2], 0.9, 40)
    }
  }
}

/** 一只大茶杯：杯口微微张开，杯里盛着茶，杯沿描金，杯把悬在一侧；垫着同一套的茶碟 */
class Cup extends Thing {
  readonly glaze: readonly [number, number, number]
  readonly c: WonderPlan['cups'][number]
  readonly H: number
  readonly saucerM: number
  readonly withCup: boolean

  constructor(c: WonderPlan['cups'][number], H: number, saucerM: number, withCup: boolean) {
    super()
    this.c = c
    this.H = H
    this.saucerM = saucerM
    this.withCup = withCup
    const r = Math.max(c.saucer, c.r + 0.75)
    this.x0 = c.x - r
    this.y0 = c.y - r
    this.x1 = c.x + r
    this.y1 = c.y + r
    this.hmax = withCup ? H : saucerM
    this.over = withCup ? H : saucerM
    this.glaze = GLAZES[Math.floor(c.hue * GLAZES.length)]!
  }

  span(x: number, y: number, s: Span): boolean {
    const c = this.c
    const dx = x - c.x
    const dy = y - c.y
    const d = Math.hypot(dx, dy)
    s.lo = 0
    if (this.withCup) {
      const a = Math.atan2(dy, dx)
      const da = Math.atan2(Math.sin(a - c.a), Math.cos(a - c.a))
      // 杯把：杯身外一道竖着的圈
      if (d > c.r && d < c.r + 0.7 && Math.abs(da) < 0.16 * (c.r + 0.35) / d * 2.2) {
        const t = (d - c.r) / 0.7
        s.lo = this.H * (0.3 + 0.32 * Math.sqrt(Math.max(0, 1 - ((t - 0.3) / 0.75) ** 2)))
        s.hi = this.H * (0.82 - 0.1 * t)
        return true
      }
      if (d < c.r) {
        // 杯身从底往上张开：画面上看到的是杯口那一圈与茶面
        const rim = 0.11
        s.hi = d > c.r - rim ? this.H : this.H * 0.82
        return true
      }
    }
    if (d < c.saucer) {
      const t = d / c.saucer
      s.hi = this.saucerM * (t > 0.82 ? 1 : 0.82 + 0.1 * t)
      return true
    }
    return false
  }

  paint(h: Hit, o: Surf): void {
    const c = this.c
    const g = this.glaze
    const dx = h.x - c.x
    const dy = h.y - c.y
    const d = Math.hypot(dx, dy)
    const a = Math.atan2(dy, dx)
    if (this.withCup && d < c.r - 0.11 && h.top) {
      // 茶面：深琥珀色，映着天光，漂着一圈细沫
      set(o, 0.4, 0.2, 0.08, 0.9, 80)
      if (d > c.r - 0.25) mix(o, 0.75, 0.55, 0.35, 0.4)
      return
    }
    if (this.withCup && d < c.r + 0.75 && h.z > this.saucerM + 0.02) {
      set(o, g[0], g[1], g[2], 0.65, 44)
      // 杯身上一圈圈白点，杯沿描金
      const dot = Math.hypot(((a * c.r * 2) % 0.5) - 0.25, ((h.z * 2) % 0.5) - 0.25)
      if (!h.top && dot < 0.08) mix(o, 0.97, 0.95, 0.9, 0.9)
      if (h.z > this.H - 0.1 || (h.top && d > c.r - 0.11)) set(o, GOLD[0], GOLD[1], GOLD[2], 0.9, 40)
      if (d > c.r) set(o, g[0] * 0.95, g[1] * 0.95, g[2] * 0.95, 0.6, 40)
      return
    }
    // 茶碟：同一套的釉色，碟心是白的，碟沿一圈金
    const t = d / c.saucer
    set(o, 0.95, 0.93, 0.87, 0.55, 40)
    if (t > 0.6) mix(o, g[0], g[1], g[2], 0.8)
    if (t > 0.94) set(o, GOLD[0], GOLD[1], GOLD[2], 0.85, 40)
  }
}

// ————————————————————————————— 扑克牌篱、矮篱、门拱、蘑菇 —————————————————————————————

/** 一张牌在牌面上的花色：p 是到花色中心的偏移（以花色大小为 1），在花色里为负 */
function pip(suit: number, px: number, py: number): number {
  const x = Math.abs(px)
  switch (suit) {
    case 0: {
      // 红心
      const y = -py * 1.1 + 0.2
      const a = Math.hypot(x - 0.32, y - 0.3) - 0.36
      const b = y - 0.6 > -x * 1.3 ? 1 : -1
      return Math.min(a, b > 0 ? 1 : y < -0.75 + x * 1.15 ? 1 : -0.01 - Math.min(0.2, x * 0))
    }
    case 1:
      // 方块
      return x * 1.25 + Math.abs(py) - 0.8
    case 2: {
      // 黑桃
      const y = py * 1.1 + 0.15
      const a = Math.hypot(x - 0.3, y - 0.25) - 0.34
      const top = y < -0.7 + x * 1.1 ? 1 : -1
      const stem = Math.max(x - 0.08 - (py - 0.45) * 0.3, Math.abs(py - 0.65) - 0.25)
      return Math.min(top < 0 ? -0.01 : Math.max(a, -1) * (y > 0.2 ? 1 : 1), stem, a)
    }
    default: {
      // 梅花
      const a = Math.hypot(x, py + 0.35) - 0.3
      const b = Math.hypot(x - 0.36, py + 0.02) - 0.3
      const stem = Math.max(x - 0.08 - (py - 0.3) * 0.25, Math.abs(py - 0.55) - 0.3)
      return Math.min(a, b, stem)
    }
  }
}

/** 牌面上 rank 点的花色排在哪：按一列、两列或三列，从上往下 */
function pipsOf(rank: number): readonly (readonly [number, number])[] {
  const col = (x: number, n: number): [number, number][] => Array.from({ length: n }, (_, i) => [x, n === 1 ? 0.5 : 0.18 + (0.64 * i) / (n - 1)] as [number, number])
  switch (rank) {
    case 2:
      return col(0.5, 2)
    case 3:
      return col(0.5, 3)
    case 4:
      return [...col(0.3, 2), ...col(0.7, 2)]
    case 5:
      return [...col(0.3, 2), ...col(0.7, 2), [0.5, 0.5]]
    case 6:
      return [...col(0.3, 3), ...col(0.7, 3)]
    case 7:
      return [...col(0.3, 3), ...col(0.7, 3), [0.5, 0.34]]
    case 8:
      return [...col(0.3, 3), ...col(0.7, 3), [0.5, 0.34], [0.5, 0.66]]
    case 9:
      return [...col(0.3, 4), ...col(0.7, 4), [0.5, 0.5]]
    default:
      return [...col(0.3, 4), ...col(0.7, 4), [0.5, 0.28], [0.5, 0.72]]
  }
}

/**
 * 一段扑克牌篱：一张张一人多高的牌并排立着，牌顶上露出牌兵的脑袋；横着的一段朝下的牌面看得见点数，竖着的一段从上面看是一溜牌边。
 * 老鼠洞那一张牌脚下拱出一个洞
 */
class CardRun extends Thing {
  readonly ax: number
  readonly ay: number
  readonly ex: number
  readonly ey: number
  readonly len: number
  readonly suit: number
  readonly row: WonderPlan['rows'][number]
  readonly ownHole: { readonly s0: number; readonly s1: number } | null
  readonly cfg: WonderlandConfig['cards']
  readonly seed: number

  constructor(piece: WonderPlan['rows'][number]['pieces'][number], row: WonderPlan['rows'][number], ownHole: { readonly s0: number; readonly s1: number } | null, cfg: WonderlandConfig['cards'], seed: number) {
    super()
    this.row = row
    this.ownHole = ownHole
    this.cfg = cfg
    this.seed = seed
    this.ax = piece.ax
    this.ay = piece.ay
    this.len = Math.hypot(piece.bx - piece.ax, piece.by - piece.ay)
    this.ex = (piece.bx - piece.ax) / this.len
    this.ey = (piece.by - piece.ay) / this.len
    this.suit = row.suit
    this.x0 = Math.min(piece.ax, piece.bx) - 0.4
    this.x1 = Math.max(piece.ax, piece.bx) + 0.4
    this.y0 = Math.min(piece.ay, piece.by) - 0.4
    this.y1 = Math.max(piece.ay, piece.by) + 0.4
    this.hmax = cfg.heightM + 0.5
  }

  /** 沿篱 s、离中线 w（格）；第几张牌、在牌上的横坐标（0 到 1） */
  private local(x: number, y: number): { s: number; w: number; k: number; f: number } {
    const dx = x - this.ax
    const dy = y - this.ay
    const s = dx * this.ex + dy * this.ey
    const w = -dx * this.ey + dy * this.ex
    const cu = this.cfg.cardU
    const k = Math.floor((s + cu * 0.5) / cu)
    return { s, w, k, f: (s + cu * 0.5) / cu - k }
  }

  private cardTop(k: number): number {
    return this.cfg.heightM - 0.12 + 0.18 * hash(k, this.row.suit, this.seed)
  }

  span(x: number, y: number, s: Span): boolean {
    const L = this.local(x, y)
    if (L.s < -0.25 || L.s > this.len + 0.25) return false
    const top = this.cardTop(L.k)
    // 牌兵的脑袋：牌顶正中一个圆
    const hs = (L.k * this.cfg.cardU) - L.s
    const head = Math.hypot(hs, L.w)
    if (head < 0.2) {
      s.lo = 0
      s.hi = top + 0.32 * Math.sqrt(1 - (head / 0.2) ** 2)
      return true
    }
    if (Math.abs(L.w) > 0.07) return false
    // 牌与牌之间一道细缝，牌顶两角是圆的
    const edge = Math.min(L.f, 1 - L.f)
    if (edge < 0.025) return false
    s.lo = 0
    s.hi = top - (edge < 0.1 ? 0.18 * (1 - Math.sqrt(1 - ((0.1 - edge) / 0.1) ** 2)) : 0)
    const hole = this.ownHole
    if (hole && L.s > hole.s0 && L.s < hole.s1) {
      const t = ((L.s - hole.s0) / (hole.s1 - hole.s0)) * 2 - 1
      s.lo = this.cfg.holeM * Math.sqrt(Math.max(0, 1 - t * t)) * 1.15
    }
    return true
  }

  paint(h: Hit, o: Surf): void {
    const L = this.local(h.x, h.y)
    const top = this.cardTop(L.k)
    if (h.z > top - 0.02 && Math.hypot(L.k * this.cfg.cardU - L.s, L.w) < 0.2) {
      // 牌兵的头顶：一头黑发，有的戴着小红帽
      const cap = hash(L.k, 7, this.seed) < 0.35
      if (cap) set(o, 0.7, 0.12, 0.16, 0.2, 10)
      else set(o, 0.16, 0.11, 0.09, 0.25, 14)
      return
    }
    const red = this.suit === 0 || this.suit === 1
    set(o, 0.95, 0.93, 0.87, 0.12, 10)
    if (h.top) {
      // 牌顶：一道纸边
      return
    }
    // 牌面：fu 横着从左到右，fv 从下到上
    const fu = h.ny > 0 ? L.f : 1 - L.f
    const fv = h.z / top
    const inner = Math.min(fu, 1 - fu, fv * 2.6, (1 - fv) * 2.6)
    if (inner < 0.045) {
      mix(o, 0.75, 0.72, 0.68, 0.5)
      return
    }
    const rank = 2 + Math.floor(hash(L.k, 3, this.seed) * 9)
    const ink: readonly [number, number, number] = red ? [0.75, 0.1, 0.14] : [0.12, 0.1, 0.12]
    // 牌面横着一格、竖着一格半（三米抬起来是一格半），花色按这个比例画才是圆的
    const size = 0.15
    const aspect = (this.cfg.cardU / (top * LIFT_U))
    for (const [px, py] of pipsOf(rank)) {
      const d = pip(this.suit, (fu - px) / size, ((1 - fv) - py) / (size * aspect))
      if (d < 0) {
        mix(o, ink[0], ink[1], ink[2], 0.95)
        return
      }
    }
    // 左上角的小花色
    const c = pip(this.suit, (fu - 0.12) / 0.07, ((1 - fv) - 0.06) / (0.07 * aspect))
    if (c < 0) mix(o, ink[0], ink[1], ink[2], 0.95)
    // 牌脚下沾了点草汁
    if (fv < 0.04) mix(o, 0.5, 0.6, 0.42, 0.4)
  }
}

/** 一段修得方方正正的矮篱：顶上齐平，边角圆，叶子细碎 */
class LowHedge extends Thing {
  readonly s: Shape
  readonly H: number

  constructor(s: Shape, H: number) {
    super()
    this.s = s
    this.H = H
    this.box(s)
    this.hmax = H + 0.08
    this.over = H
  }

  span(x: number, y: number, s: Span): boolean {
    const d = sdf(this.s, x, y)
    if (d > 0) return false
    s.lo = 0
    const r = 0.18
    s.hi = this.H - (d > -r ? 0.3 * (1 - Math.sqrt(Math.max(0, 1 - ((d + r) / r) ** 2))) : 0) + (valueNoise(x * 9, y * 9, 5) - 0.5) * 0.06
    return true
  }

  paint(h: Hit, o: Surf): void {
    leaves(o, h.x, h.y, h.z, 14, [0.2, 0.38, 0.2], 61)
    if (h.z < 0.15) {
      o.r *= 0.7
      o.g *= 0.7
      o.b *= 0.7
    }
  }
}

/** 槌球门拱：一道刷白的铁丝拱，两条腿插在草里；门拱下面空着 */
class Hoop extends Thing {
  readonly c: number
  readonly n: number
  readonly x: number
  readonly y: number
  readonly a: number
  readonly half: number
  readonly H: number

  constructor(x: number, y: number, a: number, half: number, H: number) {
    super()
    this.x = x
    this.y = y
    this.a = a
    this.half = half
    this.H = H
    this.c = Math.cos(a)
    this.n = Math.sin(a)
    this.x0 = x - half - 0.1
    this.x1 = x + half + 0.1
    this.y0 = y - half - 0.1
    this.y1 = y + half + 0.1
    this.hmax = H
    this.over = H
  }

  span(px: number, py: number, s: Span): boolean {
    const dx = px - this.x
    const dy = py - this.y
    const u = dx * this.c + dy * this.n
    const w = -dx * this.n + dy * this.c
    if (Math.abs(w) > 0.05 || Math.abs(u) > this.half) return false
    const t = u / this.half
    const top = this.H * Math.sqrt(Math.max(0, 1 - t ** 8))
    if (Math.abs(t) > 0.9) {
      s.lo = 0
      s.hi = top
      return true
    }
    s.lo = top - 0.1
    s.hi = top
    return true
  }

  paint(_h: Hit, o: Surf): void {
    set(o, 0.94, 0.94, 0.9, 0.6, 30)
  }
}

/** 大蘑菇：奶白的菌柄，伞盖是暮色里的紫、青或杏色，撒着浅色的斑点；伞盖下面空着 */
class Mushroom extends Thing {
  readonly color: readonly [number, number, number]
  readonly m: WonderPlan['mushrooms'][number]
  readonly stem: number
  readonly H: number

  constructor(m: WonderPlan['mushrooms'][number], stem: number, H: number) {
    super()
    this.m = m
    this.stem = stem
    this.H = H
    const r = m.cap
    this.x0 = m.x - r
    this.x1 = m.x + r
    this.y0 = m.y - r
    this.y1 = m.y + r
    this.hmax = H + 0.9
    const colors: readonly (readonly [number, number, number])[] = [
      [0.46, 0.32, 0.6],
      [0.26, 0.5, 0.56],
      [0.86, 0.52, 0.36],
    ]
    this.color = colors[Math.floor(m.hue * colors.length)]!
  }

  span(x: number, y: number, s: Span): boolean {
    const d = Math.hypot(x - this.m.x, y - this.m.y)
    const r = this.m.cap
    if (d > r) return false
    const t = d / r
    const capHi = this.H + 0.85 * Math.sqrt(Math.max(0, 1 - t * t)) ** 0.8
    const capLo = this.H - 0.15 + 0.35 * t * t
    if (d < this.stem * (1 + 0.15 * Math.sin(Math.atan2(y - this.m.y, x - this.m.x) * 5) * 0.2)) {
      s.lo = 0
      s.hi = capHi
      return true
    }
    s.lo = Math.min(capLo, capHi - 0.05)
    s.hi = capHi
    return true
  }

  paint(h: Hit, o: Surf): void {
    const dx = h.x - this.m.x
    const dy = h.y - this.m.y
    const d = Math.hypot(dx, dy)
    if (h.z < this.H - 0.2 + 0.35 * (d / this.m.cap) ** 2 && d < this.stem * 1.05) {
      set(o, 0.9, 0.86, 0.76, 0.1, 8)
      const fib = (valueNoise(Math.atan2(dy, dx) * 8, h.z * 3, 4) - 0.5) * 0.1
      o.r += fib
      o.g += fib
      o.b += fib
      return
    }
    const c = this.color
    const t = d / this.m.cap
    set(o, c[0], c[1], c[2], 0.3, 16)
    mix(o, c[0] * 0.6, c[1] * 0.6, c[2] * 0.7, smooth(0.5, 1, t) * 0.5)
    const q = cellNearest(dx * 1.6, dy * 1.6, Math.floor(this.m.hue * 100))
    const sd = Math.hypot(q.dx, q.dy)
    if (sd < 0.18 + 0.12 * q.h) mix(o, 0.98, 0.94, 0.85, 0.85)
  }
}

// ————————————————————————————— 组装 —————————————————————————————

/** 这一局花园里立着的所有东西：四围的树篱、茶桌与桌上的东西、椅子、茶壶、茶杯与茶碟、扑克牌篱、矮篱、门拱、蘑菇 */
export function thingsOf(plan: WonderPlan, cfg: WonderlandConfig, grids: Grids): Thing[] {
  const out: Thing[] = [new Hedge(grids, plan, cfg.lawn.hedgeM)]
  out.push(new Table(plan, cfg.table.heightM, cfg.table.gapM))
  for (const it of plan.items) out.push(new TableItem(it, plan, cfg.table.heightM))
  for (const c of plan.chairs) out.push(new Chair(c, c.grand ? cfg.table.chairU * 1.25 : cfg.table.chairU, cfg.table.chairM, cfg.table.chairGapM))
  out.push(new Teapot(plan.teapot, cfg.teapot.heightM))
  for (const c of plan.cups) out.push(new Cup(c, cfg.cups.heightM, cfg.cups.saucerM, true))
  for (const c of plan.saucers) out.push(new Cup(c, 0, cfg.saucers.heightM, false))
  plan.rows.forEach((row, ri) => {
    row.pieces.forEach((pc, k) => {
      let hole: { s0: number; s1: number } | null = null
      if (k === row.hole) {
        const len = Math.hypot(pc.bx - pc.ax, pc.by - pc.ay)
        hole = { s0: len * row.t - cfg.cards.holeU / 2, s1: len * row.t + cfg.cards.holeU / 2 }
      }
      out.push(new CardRun(pc, row, hole, cfg.cards, plan.seed ^ (ri * 7919)))
    })
  })
  for (const o of plan.obstacles) {
    if (o.kind === 'lowHedge') out.push(new LowHedge(o.shape, o.topM))
    if (o.kind === 'hoop' && o.shape.kind === 'box') out.push(new Hoop(o.shape.x, o.shape.y, o.shape.a, o.shape.hx, o.topM))
  }
  for (const m of plan.mushrooms) out.push(new Mushroom(m, cfg.mushrooms.stemU, cfg.mushrooms.heightM))
  return out
}
