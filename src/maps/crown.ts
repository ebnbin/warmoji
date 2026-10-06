import { SUN } from '../data/light'
import { Rng } from '../util/rng'
import { BLADE_REACH } from './blade'

/** 一棵树：树冠的圆心、半径（格）与树高（米） */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/** 叶子与枝条按这么大（格）的格子分桶，画一个像素只看它那一桶 */
const CROWN_BUCKET_U = 0.25
/** 一片叶子正中那片裂片多长（格）：叶子画得比真的大两倍上下，镜头里才认得出一片片的掌状叶 */
const LEAF_U = 0.15
/** 叶簇里的叶子大约隔多远（格）一片：叶子挨着叶子，彼此压住一截，叶簇里才密 */
const LEAF_GAP_U = 0.125

const TO_SUN = { x: SUN.x / Math.hypot(SUN.x, SUN.y), y: SUN.y / Math.hypot(SUN.x, SUN.y) }
/** 整棵树冠是一个扁扁的圆顶：外圈的叶子跟着往外倒这么多（法线的水平分量），朝着太阳那半边亮、背着的那半边暗 */
const DOME_TILT = 0.5
/** 树冠的高度图每格多少格：画叶子时拿它找挡着太阳的叶子；高度按每米多少档存 */
const HEIGHT_CELL_U = 0.05
const HEIGHT_STEPS_PER_M = 32

type Rgb = readonly [number, number, number]

const smooth01 = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x
  return t * t * (3 - 2 * t)
}

/** 一棵枫树的叶色：最背阴、半阴、最向阳的叶子各什么颜色。叶子晒得越多，花青素越多、越红 */
interface Palette {
  readonly low: Rgb
  readonly mid: Rgb
  readonly top: Rgb
}

/**
 * 几种枫树的叶色与各占几成：多数是朱红，向阳的叶尖红得发亮、往里转橙；几棵深红，向阳处是正红、不发暗；几棵橙红；
 * 少数刚转色，外层橙红、里面还泛黄绿
 */
const PALETTES: readonly { readonly weight: number; readonly pal: Palette }[] = [
  { weight: 0.46, pal: { low: [236, 132, 46], mid: [238, 92, 36], top: [230, 58, 32] } },
  { weight: 0.2, pal: { low: [236, 100, 46], mid: [226, 64, 44], top: [218, 44, 46] } },
  { weight: 0.26, pal: { low: [240, 162, 56], mid: [244, 128, 36], top: [238, 92, 30] } },
  { weight: 0.08, pal: { low: [168, 166, 66], mid: [232, 148, 46], top: [234, 86, 36] } },
]

/** 第 k 棵树用哪种叶色 */
function paletteOf(seed: number, k: number): number {
  const h = new Rng(Math.imul(seed ^ 0x51ed27, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)).next()
  let acc = 0
  for (let i = 0; i < PALETTES.length; i++) {
    acc += PALETTES[i]!.weight
    if (h < acc) return i
  }
  return 0
}

/** 第 p 种叶色在晒到 e 成（0 最背阴、1 最向阳）时的颜色，写进 out */
export function leafColor(p: number, e: number, out: number[]): number[] {
  const pal = PALETTES[p]!.pal
  const [a, b, t] = e < 0.5 ? [pal.low, pal.mid, e / 0.5] : [pal.mid, pal.top, (e - 0.5) / 0.5]
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  out[2] = a[2] + (b[2] - a[2]) * t
  return out
}

/** 一段枝条：两头（格）、两头的粗细（格）、离地多高（米） */
export interface Twig {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly w0: number
  readonly w1: number
  readonly z: number
}

/**
 * 所有树上的叶子，按列存：叶心（格）、离地多高（米）、正中那片裂片朝哪（cos、sin）、多长（格）、顺着中脉被斜着看短了几成、
 * 叶面法线的水平分量（法线是 (nx, ny, 1) 归一）、本色、几片裂片；每棵树用的是哪种叶色。
 * 叶子与枝条按 CROWN_BUCKET_U 的格子分桶，桶里的叶子从高到低排好：start[i]..start[i+1] 是第 i 桶在 items 里的那一段
 */
export interface Crowns {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  readonly cos: Float32Array
  readonly sin: Float32Array
  readonly size: Float32Array
  readonly squash: Float32Array
  readonly nx: Float32Array
  readonly ny: Float32Array
  readonly r: Uint8ClampedArray
  readonly g: Uint8ClampedArray
  readonly b: Uint8ClampedArray
  readonly lobes: Uint8Array
  readonly palette: Int32Array
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly rows: number
  readonly start: Int32Array
  readonly items: Int32Array
  readonly twigs: readonly Twig[]
  readonly twigStart: Int32Array
  readonly twigItems: Int32Array
  /** 树冠的高度图：每个格点上最高那片叶子离地多高（按 1/HEIGHT_STEPS_PER_M 米一档），没有叶子是 0；格点 (i, j) 在 (x0 + i·HEIGHT_CELL_U, y0 + j·HEIGHT_CELL_U) */
  readonly heights: Uint16Array
  readonly hCols: number
  readonly hRows: number
}

/** 一簇叶子：长在枝上的一片扇形，从 (x, y) 处顺着 (ux, uy) 伸出 len 格，最宽处半宽 half 格，根部离地 z 米；这一簇整体晒得多还是少一点、亮几成 */
interface Spray {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly len: number
  readonly half: number
  readonly z: number
  readonly tone: number
  readonly bright: number
}

/** 叶簇顺着伸出去 s 格处的半宽：根部窄、六成半处最宽、梢头收圆 */
function sprayHalf(sp: Spray, s: number): number {
  const t = s / sp.len
  if (t < 0 || t > 1) return 0
  const grow = 0.35 + 0.65 * Math.sin((Math.PI / 2) * Math.min(1, t / 0.65))
  const tip = t > 0.65 ? Math.sqrt(Math.max(0, 1 - ((t - 0.65) / 0.35) ** 2)) : 1
  return sp.half * grow * tip
}

/** 按列攒叶子：满了就把每一列翻倍 */
class LeafList {
  n = 0
  private cap = 1 << 14
  x: Float32Array = new Float32Array(this.cap)
  y: Float32Array = new Float32Array(this.cap)
  z: Float32Array = new Float32Array(this.cap)
  cos: Float32Array = new Float32Array(this.cap)
  sin: Float32Array = new Float32Array(this.cap)
  size: Float32Array = new Float32Array(this.cap)
  squash: Float32Array = new Float32Array(this.cap)
  nx: Float32Array = new Float32Array(this.cap)
  ny: Float32Array = new Float32Array(this.cap)
  r: Uint8ClampedArray = new Uint8ClampedArray(this.cap)
  g: Uint8ClampedArray = new Uint8ClampedArray(this.cap)
  b: Uint8ClampedArray = new Uint8ClampedArray(this.cap)
  lobes: Uint8Array = new Uint8Array(this.cap)

  push(x: number, y: number, z: number, ang: number, size: number, squash: number, nx: number, ny: number, c: readonly number[], lobes: number): void {
    if (this.n === this.cap) this.grow()
    const i = this.n++
    this.x[i] = x
    this.y[i] = y
    this.z[i] = z
    this.cos[i] = Math.cos(ang)
    this.sin[i] = Math.sin(ang)
    this.size[i] = size
    this.squash[i] = squash
    this.nx[i] = nx
    this.ny[i] = ny
    this.r[i] = c[0]!
    this.g[i] = c[1]!
    this.b[i] = c[2]!
    this.lobes[i] = lobes
  }

  private grow(): void {
    this.cap *= 2
    const f = (a: Float32Array): Float32Array => {
      const b = new Float32Array(this.cap)
      b.set(a)
      return b
    }
    const u = (a: Uint8ClampedArray): Uint8ClampedArray => {
      const b = new Uint8ClampedArray(this.cap)
      b.set(a)
      return b
    }
    this.x = f(this.x)
    this.y = f(this.y)
    this.z = f(this.z)
    this.cos = f(this.cos)
    this.sin = f(this.sin)
    this.size = f(this.size)
    this.squash = f(this.squash)
    this.nx = f(this.nx)
    this.ny = f(this.ny)
    this.r = u(this.r)
    this.g = u(this.g)
    this.b = u(this.b)
    const lobes = new Uint8Array(this.cap)
    lobes.set(this.lobes)
    this.lobes = lobes
  }
}

/**
 * 一棵枫树从上往下看：五到七根主枝从树干往外放射，各在半路分成两三根侧枝；叶子长在小枝末端，排成一片片扁平的扇形叶簇，
 * 里圈的叶簇高、外圈的低，梢头往下垂，层层叠成一把参差透光的伞；树顶还有几簇最高的盖住树干。
 * 叶子从叶簇的根部往梢头散开，越靠梢头越往外斜；晒得到太阳的（高处、朝着太阳那边的）红，往里往下渐渐转橙转黄
 */
function grow(t: Tree, k: number, pal: number, seed: number, mpu: number, leaves: LeafList, twigs: Twig[]): void {
  const rng = new Rng((Math.imul(seed + 0x2545f491, 0x9e3779b1) ^ Math.imul(k + 7, 0xc2b2ae35)) >>> 0)
  const R = t.r
  const H = t.h
  const sprays: Spray[] = []
  const dome = (rho: number): number => H * (0.6 + 0.4 * (1 - Math.min(1, rho / R) ** 2))
  const limbs = 5 + Math.floor(rng.next() * 3)
  const base = rng.next() * Math.PI * 2
  const step = (Math.PI * 2) / limbs
  // 树冠不是正圆：往哪边伸得远按方位起伏，一棵一个样
  const p2 = rng.next() * Math.PI * 2
  const p3 = rng.next() * Math.PI * 2
  const spread = (a: number): number => 1 + 0.12 * Math.cos(2 * (a - p2)) + 0.07 * Math.cos(3 * (a - p3))
  for (let i = 0; i < limbs; i++) {
    const ang = base + (i + (rng.next() - 0.5) * 0.5) * step
    const fork = R * (0.32 + 0.14 * rng.next())
    const fx = t.x + Math.cos(ang) * fork
    const fy = t.y + Math.sin(ang) * fork
    twigs.push({ ax: t.x, ay: t.y, bx: fx, by: fy, w0: 0.085, w1: 0.06, z: H * 0.5 })
    sprays.push({ x: t.x + Math.cos(ang) * R * 0.12, y: t.y + Math.sin(ang) * R * 0.12, ux: Math.cos(ang), uy: Math.sin(ang), len: R * 0.42, half: R * 0.17, z: dome(R * 0.3) + 0.1, tone: (rng.next() - 0.5) * 0.24, bright: 1 + (rng.next() - 0.5) * 0.1 })
    const subs = rng.next() < 0.3 ? 3 : 2
    for (let j = 0; j < subs; j++) {
      const a2 = ang + (j - (subs - 1) / 2) * step * (subs === 3 ? 0.36 : 0.5) + (rng.next() - 0.5) * 0.18
      const reach = R * spread(a2) * (rng.next() < 0.2 ? 0.62 + 0.14 * rng.next() : 0.8 + 0.26 * rng.next())
      const ex = t.x + Math.cos(a2) * reach
      const ey = t.y + Math.sin(a2) * reach
      twigs.push({ ax: fx, ay: fy, bx: ex, by: ey, w0: 0.05, w1: 0.022, z: H * 0.55 })
      const tier = (j % 2 === 0 ? 1 : -1) * 0.15
      // 侧枝上两簇：里面一簇从半路伸到七成，外面一簇伸到梢头
      for (const [from, to] of [
        [0.28, 0.72],
        [0.56, 1],
      ] as const) {
        const r0 = reach * (from + (rng.next() - 0.5) * 0.06)
        const r1 = reach * to
        const da = (rng.next() - 0.5) * 0.3
        sprays.push({
          x: t.x + Math.cos(a2) * r0,
          y: t.y + Math.sin(a2) * r0,
          ux: Math.cos(a2 + da),
          uy: Math.sin(a2 + da),
          len: r1 - r0,
          half: Math.max(R * 0.14, 0.3 * r1 * (0.9 + 0.2 * rng.next())),
          z: dome((r0 + r1) / 2) + tier + (rng.next() - 0.5) * 0.4,
          tone: (rng.next() - 0.5) * 0.24,
          bright: 1 + (rng.next() - 0.5) * 0.1,
        })
      }
    }
  }
  // 树顶：几簇最高的从树干另一边伸过来，盖住树干与主枝的根
  const tops = 3 + Math.floor(rng.next() * 2)
  for (let q = 0; q < tops; q++) {
    const a = base + (q / tops) * Math.PI * 2 + rng.next()
    sprays.push({ x: t.x - Math.cos(a) * R * 0.12, y: t.y - Math.sin(a) * R * 0.12, ux: Math.cos(a), uy: Math.sin(a), len: R * 0.48, half: R * 0.2, z: H * (0.97 + 0.05 * rng.next()), tone: 0.1, bright: 1 + (rng.next() - 0.5) * 0.08 })
  }
  const col = [0, 0, 0]
  for (const sp of sprays) {
    const vx = -sp.uy
    const vy = sp.ux
    const cell = LEAF_GAP_U
    for (let s = cell * 0.5; s < sp.len; s += cell) {
      for (let lat = -sp.half; lat <= sp.half; lat += cell) {
        const js = s + (rng.next() - 0.5) * cell * 0.9
        const jl = lat + (rng.next() - 0.5) * cell * 0.9
        const hw = sprayHalf(sp, js)
        if (hw <= 0 || Math.abs(jl) > hw) continue
        const x = sp.x + sp.ux * js + vx * jl
        const y = sp.y + sp.uy * js + vy * jl
        const rho = Math.hypot(x - t.x, y - t.y)
        if (rho > R * 1.2) continue
        // 叶簇是一团拱起的扇面：当中最高，根部、梢头与两边往下垂；叶子的高低与朝向都顺着这个面，再各自偏一点
        const fs = js / sp.len
        const side = jl / Math.max(1e-3, hw)
        const lift = (f: number, l: number): number => 0.2 * (1 - (2 * f - 1) ** 2) - 0.25 * f * f - 0.24 * l * l
        const z = sp.z + lift(fs, side) + (rng.next() - 0.5) * 0.05
        const h = 0.02
        const gs = (lift(fs + h, side) - lift(fs - h, side)) / (2 * h * sp.len * mpu)
        const gl = (lift(fs, side + h) - lift(fs, side - h)) / (2 * h * Math.max(1e-3, hw) * mpu)
        const nx = -(sp.ux * gs + vx * gl) * 0.5 + ((x - t.x) / R) * DOME_TILT + (rng.next() - 0.5) * 0.24
        const ny = -(sp.uy * gs + vy * gl) * 0.5 + ((y - t.y) / R) * DOME_TILT + (rng.next() - 0.5) * 0.24
        const ang = Math.atan2(sp.uy, sp.ux) + side * 0.75 + (rng.next() - 0.5) * 0.8
        const squash = 1 / Math.sqrt(1 + (nx * nx + ny * ny) * 0.5)
        const size = LEAF_U * (0.82 + 0.36 * rng.next())
        // 晒得到多少：长在树冠外表面上的晒得足，越往里（比树冠的外表面低得越多）越背阴；朝着太阳那边的晒得多一点
        const sun = rho > 1e-3 ? (((x - t.x) * TO_SUN.x + (y - t.y) * TO_SUN.y) / rho) * Math.min(1, rho / R) : 0
        const e = Math.min(1, Math.max(0, 0.95 - 1.1 * smooth01((dome(rho) - z + 0.05) / 0.75) + 0.3 * sun + sp.tone + (rng.next() - 0.5) * 0.2))
        leafColor(pal, e, col)
        const vary = sp.bright * (1 + (rng.next() - 0.5) * 0.16)
        const pick = rng.next()
        if (pick < 0.03) {
          // 早早干了的几片：发褐
          col[0] = col[0]! * 0.78 + 30
          col[1] = col[1]! * 0.7 + 18
          col[2] = col[2]! * 0.7 + 10
        }
        col[0] = col[0]! * vary
        col[1] = col[1]! * (vary + (rng.next() - 0.5) * 0.1)
        col[2] = col[2]! * vary
        leaves.push(x, y, z, ang, size, squash, nx, ny, col, rng.next() < 0.85 ? 7 : 5)
      }
    }
  }
}

/** 把一样外接框为 [x0, x1] × [y0, y1] 的东西记进它罩住的每一桶：先数，再填 */
function bucketize(n: number, box: (i: number, out: number[]) => void, x0: number, y0: number, cols: number, rows: number, order?: (a: number, b: number) => number): { start: Int32Array; items: Int32Array } {
  const count = new Int32Array(cols * rows + 1)
  const bb = [0, 0, 0, 0]
  const range = (i: number): [number, number, number, number] => {
    box(i, bb)
    return [
      Math.max(0, Math.floor((bb[0]! - x0) / CROWN_BUCKET_U)),
      Math.max(0, Math.floor((bb[1]! - y0) / CROWN_BUCKET_U)),
      Math.min(cols - 1, Math.floor((bb[2]! - x0) / CROWN_BUCKET_U)),
      Math.min(rows - 1, Math.floor((bb[3]! - y0) / CROWN_BUCKET_U)),
    ]
  }
  for (let i = 0; i < n; i++) {
    const [c0, r0, c1, r1] = range(i)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) count[r * cols + c]!++
  }
  const start = new Int32Array(cols * rows + 1)
  for (let i = 0; i < cols * rows; i++) start[i + 1] = start[i]! + count[i]!
  const items = new Int32Array(start[cols * rows]!)
  const fill = start.slice(0, cols * rows)
  for (let i = 0; i < n; i++) {
    const [c0, r0, c1, r1] = range(i)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[fill[r * cols + c]!++] = i
  }
  if (order) for (let i = 0; i < cols * rows; i++) items.subarray(start[i]!, start[i + 1]!).sort(order)
  return { start, items }
}

/** 长出所有的树：叶子、枝条与它们的分桶。area 是要画的那一块（格），种子定每棵树的样子，mpu 是一格多少米 */
export function growCrowns(trees: readonly Tree[], seed: number, mpu: number, area: { x0: number; y0: number; w: number; h: number }): Crowns {
  const leaves = new LeafList()
  const twigs: Twig[] = []
  const palette = new Int32Array(trees.length)
  trees.forEach((t, k) => {
    palette[k] = paletteOf(seed, k)
    grow(t, k, palette[k]!, seed, mpu, leaves, twigs)
  })
  const n = leaves.n
  const x = leaves.x.slice(0, n)
  const y = leaves.y.slice(0, n)
  const z = leaves.z.slice(0, n)
  const size = leaves.size.slice(0, n)
  const x0 = area.x0 - 1
  const y0 = area.y0 - 1
  const cols = Math.ceil((area.w + 2) / CROWN_BUCKET_U)
  const rows = Math.ceil((area.h + 2) / CROWN_BUCKET_U)
  const leafBox = (i: number, out: number[]): void => {
    const r = size[i]! * BLADE_REACH
    out[0] = x[i]! - r
    out[1] = y[i]! - r
    out[2] = x[i]! + r
    out[3] = y[i]! + r
  }
  const lb = bucketize(n, leafBox, x0, y0, cols, rows, (a, b) => z[b]! - z[a]!)
  const twigBox = (i: number, out: number[]): void => {
    const tw = twigs[i]!
    out[0] = Math.min(tw.ax, tw.bx) - tw.w0
    out[1] = Math.min(tw.ay, tw.by) - tw.w0
    out[2] = Math.max(tw.ax, tw.bx) + tw.w0
    out[3] = Math.max(tw.ay, tw.by) + tw.w0
  }
  const tb = bucketize(twigs.length, twigBox, x0, y0, cols, rows, (a, b) => twigs[b]!.z - twigs[a]!.z)
  // 高度图：每片叶子按叶心那一圈（大半是实的）记进去
  const hCols = Math.ceil((area.w + 2) / HEIGHT_CELL_U)
  const hRows = Math.ceil((area.h + 2) / HEIGHT_CELL_U)
  const heights = new Uint16Array(hCols * hRows)
  for (let i = 0; i < n; i++) {
    const r = size[i]! * 0.5
    const i0 = Math.max(0, Math.floor((x[i]! - r - x0) / HEIGHT_CELL_U))
    const i1 = Math.min(hCols - 1, Math.ceil((x[i]! + r - x0) / HEIGHT_CELL_U))
    const j0 = Math.max(0, Math.floor((y[i]! - r - y0) / HEIGHT_CELL_U))
    const j1 = Math.min(hRows - 1, Math.ceil((y[i]! + r - y0) / HEIGHT_CELL_U))
    for (let j = j0; j <= j1; j++) {
      for (let q = i0; q <= i1; q++) {
        const dx = x0 + q * HEIGHT_CELL_U - x[i]!
        const dy = y0 + j * HEIGHT_CELL_U - y[i]!
        if (dx * dx + dy * dy > r * r) continue
        const o = j * hCols + q
        const h = Math.max(1, Math.round(z[i]! * HEIGHT_STEPS_PER_M))
        if (h > heights[o]!) heights[o] = h
      }
    }
  }
  return {
    x,
    y,
    z,
    cos: leaves.cos.slice(0, n),
    sin: leaves.sin.slice(0, n),
    size,
    squash: leaves.squash.slice(0, n),
    nx: leaves.nx.slice(0, n),
    ny: leaves.ny.slice(0, n),
    r: leaves.r.slice(0, n),
    g: leaves.g.slice(0, n),
    b: leaves.b.slice(0, n),
    lobes: leaves.lobes.slice(0, n),
    palette,
    x0,
    y0,
    cols,
    rows,
    start: lb.start,
    items: lb.items,
    twigs,
    twigStart: tb.start,
    twigItems: tb.items,
    heights,
    hCols,
    hRows,
  }
}

/** (x, y) 格处头顶上有没有叶子：高度图里四周四个格点有叶子的按双线性插值 */
export function crownCover(c: Crowns, x: number, y: number): number {
  const u = (x - c.x0) / HEIGHT_CELL_U
  const v = (y - c.y0) / HEIGHT_CELL_U
  const i = Math.floor(u)
  const j = Math.floor(v)
  if (i < 0 || j < 0 || i + 1 >= c.hCols || j + 1 >= c.hRows) return 0
  const fx = u - i
  const fy = v - j
  const o = j * c.hCols + i
  const h = c.heights
  const a = h[o]! > 0 ? 1 : 0
  const b = h[o + 1]! > 0 ? 1 : 0
  const d = h[o + c.hCols]! > 0 ? 1 : 0
  const e = h[o + c.hCols + 1]! > 0 ? 1 : 0
  return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy
}

/** 树冠在 (x, y) 格处最高的叶子离地多高（米），取最近的格点 */
export function crownHeight(c: Crowns, x: number, y: number): number {
  const i = Math.round((x - c.x0) / HEIGHT_CELL_U)
  const j = Math.round((y - c.y0) / HEIGHT_CELL_U)
  return i < 0 || j < 0 || i >= c.hCols || j >= c.hRows ? 0 : c.heights[j * c.hCols + i]! / HEIGHT_STEPS_PER_M
}

/** (x, y) 格落在哪一桶，桶外是 −1 */
export function bucketOf(c: Crowns, x: number, y: number): number {
  const cx = Math.floor((x - c.x0) / CROWN_BUCKET_U)
  const cy = Math.floor((y - c.y0) / CROWN_BUCKET_U)
  return cx < 0 || cy < 0 || cx >= c.cols || cy >= c.rows ? -1 : cy * c.cols + cx
}
