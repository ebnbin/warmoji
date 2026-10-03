import { tileCell, tileEdge, tileFbm, tileNoise } from './noise'
import { duneAt, duneShape, floorAt, smooth, swellAt, wrapU } from './terrain'
import { shadowBox, shadowCover, slabAt } from './landmarks'
import type { DesertPlan, Landmark } from './terrain'

/** 往太阳方向找挡光的沙丘，每步走多远（格） */
const MARCH_U = 0.1
/** 背阴、起伏与丘间地面先按这么细的格子算好，画的时候双线性插值，每格分几份 */
const SUN_SPLIT = 16
const FIELD_SPLIT = 8
/** 风纹的间距，格：十几厘米一道 */
const RIPPLE_U = 0.24
/** 风纹的高，米 */
const RIPPLE_M = 0.0018
/** 求坡度时左右各取多远，格 */
const SLOPE_E = 0.03
/** 盐壳一圈里龟裂成多少块，粗的与细的 */
const CRACKS = 45
const CRACKS_FINE = 106

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

type Rgb = [number, number, number]

/** 斜阳、天光与沙地反上来的光：影子里偏蓝，向阳的坡偏暖 */
const SUN_COL: Rgb = [1.0, 0.92, 0.79]
const SKY_COL: Rgb = [0.7, 0.76, 0.92]
const BOUNCE_COL: Rgb = [0.95, 0.74, 0.52]
const SUN_I = 0.52
const SKY_I = 0.48
const BOUNCE_I = 0.09

/** 几种沙与地面的固有色 */
const DUNE: Rgb = [0.84, 0.68, 0.46]
const DUNE_RED: Rgb = [0.82, 0.6, 0.4]
const DUNE_PALE: Rgb = [0.88, 0.75, 0.56]
const SHEET: Rgb = [0.8, 0.61, 0.41]
const GRAVEL: Rgb = [0.64, 0.49, 0.36]
const VARNISH: Rgb = [0.34, 0.25, 0.19]
const RUST: Rgb = [0.57, 0.37, 0.26]
const QUARTZ: Rgb = [0.76, 0.69, 0.58]
const CRUST: Rgb = [0.86, 0.79, 0.68]
const CRACK: Rgb = [0.58, 0.48, 0.38]
const BARK: Rgb = [0.3, 0.23, 0.18]
const BONE: Rgb = [0.93, 0.9, 0.82]
const STONE_A: Rgb = [0.62, 0.55, 0.47]
const STONE_B: Rgb = [0.4, 0.31, 0.25]
const SANDSTONE: Rgb = [0.72, 0.45, 0.31]
const SANDSTONE_PALE: Rgb = [0.86, 0.67, 0.5]

/** 画地面用到的东西：只有数据，能整个发给画地面的线程 */
export interface PaintScene {
  readonly plan: DesertPlan
  readonly ppu: number
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 发给画地面的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 先算一次的东西：起伏与丘间地面的格子，沙丘挡出来的背阴（1 是晒得到） */
export interface Prepared {
  readonly fieldCols: number
  readonly swell: Float32Array
  readonly gravel: Float32Array
  readonly crust: Float32Array
  readonly sunCols: number
  readonly sun: Float32Array
}

/** 首尾相接的格子上双线性取值：每格 per 个，x、y 以格计 */
function sample(a: Float32Array, cols: number, per: number, x: number, y: number): number {
  const u = x * per - 0.5
  const v = y * per - 0.5
  const iu = Math.floor(u)
  const iv = Math.floor(v)
  const fu = u - iu
  const fv = v - iv
  const x0 = ((iu % cols) + cols) % cols
  const y0 = ((iv % cols) + cols) % cols
  const x1 = (x0 + 1) % cols
  const y1 = (y0 + 1) % cols
  const a00 = a[y0 * cols + x0]!
  const a10 = a[y0 * cols + x1]!
  const a01 = a[y1 * cols + x0]!
  const a11 = a[y1 * cols + x1]!
  return a00 + (a10 - a00) * fu + (a01 - a00) * fv + (a00 - a10 - a01 + a11) * fu * fv
}

const FLOOR = { gravel: 0, crust: 0, sheet: 0 }

export function prepare(sc: PaintScene): Prepared {
  const p = sc.plan
  const fc = p.sizeU * FIELD_SPLIT
  const swell = new Float32Array(fc * fc)
  const gravel = new Float32Array(fc * fc)
  const crust = new Float32Array(fc * fc)
  for (let j = 0; j < fc; j++) {
    for (let i = 0; i < fc; i++) {
      const x = (i + 0.5) / FIELD_SPLIT
      const y = (j + 0.5) / FIELD_SPLIT
      swell[j * fc + i] = swellAt(p, x, y)
      floorAt(p, x, y, FLOOR)
      gravel[j * fc + i] = FLOOR.gravel
      crust[j * fc + i] = FLOOR.crust
    }
  }
  const sc2 = p.sizeU * SUN_SPLIT
  const height = new Float32Array(sc2 * sc2)
  for (let j = 0; j < sc2; j++) {
    for (let i = 0; i < sc2; i++) {
      const x = (i + 0.5) / SUN_SPLIT
      const y = (j + 0.5) / SUN_SPLIT
      height[j * sc2 + i] = sample(swell, fc, FIELD_SPLIT, x, y) + duneAt(p, x, y)
    }
  }
  const lxy = Math.hypot(p.light.x, p.light.y)
  const sx = p.light.x / lxy
  const sy = p.light.y / lxy
  const rise = (p.light.z / lxy) * p.meterPerU
  let top = 0
  for (const d of p.dunes) top = Math.max(top, d.h)
  const reach = ((top + 2 * p.swellM) / rise) * 1.05
  const sun = new Float32Array(sc2 * sc2)
  for (let j = 0; j < sc2; j++) {
    for (let i = 0; i < sc2; i++) {
      const x = (i + 0.5) / SUN_SPLIT
      const y = (j + 0.5) / SUN_SPLIT
      const z = height[j * sc2 + i]!
      let over = -Infinity
      for (let d = MARCH_U; d <= reach; d += MARCH_U) over = Math.max(over, sample(height, sc2, SUN_SPLIT, x + sx * d, y + sy * d) - z - d * rise)
      sun[j * sc2 + i] = 1 - smooth(-0.003, 0.012, over)
    }
  }
  return { fieldCols: fc, swell, gravel, crust, sunCols: sc2, sun }
}

/** 一处的石子：大小两层，取高的那颗；lit 是它朝太阳的亮度（平地为 1）、h 是哪颗（哈希）、inside 是石面的覆盖（石缝里为零）、shade 是落在别的石子影子里有多深 */
interface Pebble {
  lit: number
  h: number
  inside: number
  top: number
  shade: number
}

const CELL = { dx: 0, dy: 0, h: 0 }

/** 第 period 层细胞里这一格有没有石子、多大：砾石地边上 dense 小，石子稀 */
function pebbleRad(h: number, dense: number): number {
  return (h * 7.31) % 1 < dense ? 0.24 + 0.2 * h : 0
}

/** 石子的高与长半径之比、短半径与长半径之比：扁的卵石，各朝各的方向 */
const PEBBLE_FLAT = 0.45
const PEBBLE_NARROW = 0.72

function onePebble(p: DesertPlan, x: number, y: number, period: number, seed: number, lift: number, dense: number, out: Pebble): void {
  const q = tileCell((x * period) / p.sizeU, (y * period) / p.sizeU, period, seed, CELL)
  const rad = pebbleRad(q.h, dense)
  if (rad === 0) return
  const ca = Math.cos(q.h * 40)
  const sa = Math.sin(q.h * 40)
  const u = (q.dx * ca + q.dy * sa) / rad
  const v = (-q.dx * sa + q.dy * ca) / (rad * PEBBLE_NARROW)
  const d2 = u * u + v * v
  if (d2 >= 1) return
  const dome = Math.sqrt(1 - d2)
  if (dome * lift <= out.top) return
  const nu = PEBBLE_FLAT * u
  const nv = (PEBBLE_FLAT / PEBBLE_NARROW) * v
  const nx = nu * ca - nv * sa
  const ny = nu * sa + nv * ca
  out.lit = Math.max(0, nx * p.light.x + ny * p.light.y + dome * p.light.z) / Math.sqrt(nx * nx + ny * ny + dome * dome) / p.light.z
  out.h = q.h
  out.inside = smooth(1, 0.8, Math.sqrt(d2))
  out.top = dome * lift
}

const PEB: Pebble = { lit: 0, h: 0, inside: 0, top: 0, shade: 0 }

function pebble(p: DesertPlan, x: number, y: number, period: number, seed: number, dense: number): Pebble {
  PEB.lit = 0
  PEB.h = 0
  PEB.inside = 0
  PEB.top = 0
  PEB.shade = 0
  onePebble(p, x, y, period * 2, seed + 3, 0.5, dense * 0.55, PEB)
  onePebble(p, x, y, period, seed, 1, dense, PEB)
  if (PEB.inside < 1) {
    // 往太阳那边挪一点就落在大石子上，这里就在它的影子里
    const lxy = Math.hypot(p.light.x, p.light.y)
    const reach = (0.22 * p.sizeU) / period
    const sx = x + (p.light.x / lxy) * reach
    const sy = y + (p.light.y / lxy) * reach
    const q = tileCell((sx * period) / p.sizeU, (sy * period) / p.sizeU, period, seed, CELL)
    const rad = pebbleRad(q.h, dense)
    if (rad > 0) PEB.shade = smooth(1.05, 0.7, Math.sqrt(q.dx * q.dx + q.dy * q.dy) / (rad * 0.86)) * (1 - PEB.inside)
  }
  return PEB
}

/**
 * 风纹：横着风向一道接一道，迎风缓、背风陡；波矢取整数，正好一圈里排整数道，左右上下拼得上；
 * 一道道风纹被低频的噪声扭弯，偶尔分叉。返回高（米）
 */
function rippleAt(p: DesertPlan, kx: number, ky: number, x: number, y: number): number {
  const s = p.sizeU
  const warp = (tileFbm((x * 6) / s, (y * 6) / s, 6, p.seed + 41, 2) - 0.5) * 9 + (tileNoise((x * 24) / s, (y * 24) / s, 24, p.seed + 43) - 0.5) * 1.6
  const ph = ((kx * x + ky * y) / s) * Math.PI * 2 + warp
  return RIPPLE_M * (Math.sin(ph) + 0.28 * Math.sin(2 * ph + 0.6))
}

/** 离 (x, y) 处最高的那座沙丘的脊线中点，横着它的下风方向有多远（格）：落沙坡上的沙流顺着它排，接缝两边也接得上 */
function acrossDune(p: DesertPlan, x: number, y: number): number {
  let best = 0
  let across = 0
  const m = p.meterPerU
  for (const d of p.dunes) {
    const dx = wrapU(x - d.x, p.sizeU)
    const dy = wrapU(y - d.y, p.sizeU)
    const h = duneShape(p, d, dx * m, dy * m)
    if (h <= best) continue
    best = h
    across = -dx * d.s + dy * d.c
  }
  return across
}

/** 标志物在地上的那部分：画在地面贴图里的颜色、透明度与它顶面的法线；没有就是 null */
interface Prop {
  r: number
  g: number
  b: number
  a: number
  nx: number
  ny: number
  nz: number
}

const PROP: Prop = { r: 0, g: 0, b: 0, a: 0, nx: 0, ny: 0, nz: 1 }

/** 一个点 (qx, qy)（相对标志物中心，格）落在它地上那部分的什么上：枯树的树根与落枝、杆脚的石头、石堆、驼骨、岩盘 */
function propAt(p: DesertPlan, l: Landmark, qx: number, qy: number, out: Prop): Prop | null {
  const sh = l.shape
  out.a = 0
  let best = -1
  if (sh.kind === 'tree') {
    const d = Math.hypot(qx, qy)
    if (d < 0.13) {
      const k = d / 0.13
      out.r = BARK[0] * (0.8 + 0.3 * Math.cos(Math.atan2(qy, qx) * 9))
      out.g = BARK[1]
      out.b = BARK[2]
      out.a = smooth(1, 0.85, k)
      out.nx = qx / 0.13
      out.ny = qy / 0.13
      out.nz = Math.sqrt(Math.max(0.05, 1 - k * k))
      return out
    }
  }
  for (const l2 of sh.limbs) {
    if (l2.z0 > 0.32 && l2.z1 > 0.32) continue
    const ex = l2.x1 - l2.x0
    const ey = l2.y1 - l2.y0
    const len2 = ex * ex + ey * ey
    const t = len2 > 1e-9 ? clamp01(((qx - l2.x0) * ex + (qy - l2.y0) * ey) / len2) : 0
    const cx = l2.x0 + ex * t - qx
    const cy = l2.y0 + ey * t - qy
    const d = Math.sqrt(cx * cx + cy * cy)
    const r = l2.r0 + (l2.r1 - l2.r0) * t
    if (d >= r) continue
    const z = l2.z0 + (l2.z1 - l2.z0) * t
    if (z <= best) continue
    best = z
    const k = d / r
    const c = sh.kind === 'bones' ? BONE : BARK
    out.r = c[0]
    out.g = c[1]
    out.b = c[2]
    out.a = smooth(1, 0.75, k) * (sh.kind === 'bones' ? 0.55 + 0.45 * smooth(0, 0.06, z) : 1)
    out.nx = -cx / r
    out.ny = -cy / r
    out.nz = Math.sqrt(Math.max(0.05, 1 - k * k))
  }
  for (let s = 0; s < sh.stones.length; s++) {
    const st = sh.stones[s]!
    const dx = qx - st.x
    const dy = qy - st.y
    const d = Math.hypot(dx, dy) / st.r
    if (d >= 1 || st.z1 <= best) continue
    best = st.z1
    const skull = sh.kind === 'bones'
    const pick = (((s * 7919) % 13) / 13 + st.r * 3.1) % 1
    const c = skull ? BONE : pick < 0.6 ? STONE_A : STONE_B
    const tone = skull ? 1 : 0.85 + 0.3 * tileNoise(qx * 9 + s * 3.7, qy * 9, 64, p.seed + 61)
    out.r = c[0] * tone
    out.g = c[1] * tone
    out.b = c[2] * tone
    out.a = smooth(1, 0.82, d)
    out.nx = dx / st.r
    out.ny = dy / st.r
    out.nz = Math.sqrt(Math.max(0.05, 1 - d * d)) * 0.9
    if (skull && s === 0 && sh.stones.length > 1) {
      // 头骨的两个眼窝，朝着吻部那头
      const snout = sh.stones[1]!
      const fx = snout.x - st.x
      const fy = snout.y - st.y
      const fl = Math.hypot(fx, fy) || 1
      for (const side of [-1, 1]) {
        const ex = st.x + (fx / fl) * st.r * 0.25 - (fy / fl) * side * st.r * 0.42
        const ey = st.y + (fy / fl) * st.r * 0.25 + (fx / fl) * side * st.r * 0.42
        const e = Math.hypot(qx - ex, qy - ey) / (st.r * 0.24)
        if (e < 1) {
          const k = smooth(1, 0.6, e)
          out.r *= 1 - 0.75 * k
          out.g *= 1 - 0.78 * k
          out.b *= 1 - 0.8 * k
        }
      }
    }
  }
  const sl = sh.slab
  if (sl) {
    const c = Math.cos(sl.angle)
    const s = Math.sin(sl.angle)
    const u = qx * c + qy * s
    const v = -qx * s + qy * c
    const at = slabAt(sl, u, v)
    if (at.inside > -0.02 && at.z > best) {
      const e = 0.02
      const zx = (slabAt(sl, (qx + e) * c + qy * s, -(qx + e) * s + qy * c).z - slabAt(sl, (qx - e) * c + qy * s, -(qx - e) * s + qy * c).z) / (2 * e * p.meterPerU)
      const zy = (slabAt(sl, qx * c + (qy + e) * s, -qx * s + (qy + e) * c).z - slabAt(sl, qx * c + (qy - e) * s, -qx * s + (qy - e) * c).z) / (2 * e * p.meterPerU)
      const strata = 0.5 + 0.5 * Math.sin((at.z / 0.045) * Math.PI * 2 + tileNoise(u * 2, v * 2, 64, p.seed + 63) * 2)
      const varnish = smooth(0.55, 0.8, tileFbm(qx * 1.7 + 11, qy * 1.7, 64, p.seed + 65, 2)) * 0.45
      const k = clamp01(strata * 0.6 + tileNoise(qx * 6, qy * 6, 64, p.seed + 67) * 0.4)
      out.r = (SANDSTONE[0] + (SANDSTONE_PALE[0] - SANDSTONE[0]) * k) * (1 - varnish)
      out.g = (SANDSTONE[1] + (SANDSTONE_PALE[1] - SANDSTONE[1]) * k) * (1 - varnish)
      out.b = (SANDSTONE[2] + (SANDSTONE_PALE[2] - SANDSTONE[2]) * k) * (1 - varnish * 0.9)
      out.a = smooth(-0.02, 0.03, at.inside)
      const nl = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      out.nx = -zx * nl
      out.ny = -zy * nl
      out.nz = nl
    }
  }
  return out.a > 0 ? out : null
}

/** 沙尾的长与宽、脚下那圈沙的半径，按标志物挡风的大小算的倍数；再往外按 DRIFT_CUT 倍就平了 */
const DRIFT_TAIL = 4
const DRIFT_WIDE = 0.9
const DRIFT_MOUND = 1.1
const DRIFT_CUT = 2.6

function driftSize(l: Landmark): number {
  return l.shape.kind === 'tree' || l.shape.kind === 'post' ? 0.35 : Math.min(1.1, l.shape.reach * 0.7)
}

/** 标志物顺着风在背风那边拖出的一条沙尾、脚下堆起的一圈沙，米：只让地面的光影跟着起伏 */
function driftAt(p: DesertPlan, l: Landmark, qx: number, qy: number): number {
  const c = Math.cos(p.windAngle)
  const s = Math.sin(p.windAngle)
  const u = qx * c + qy * s
  const v = -qx * s + qy * c
  const size = driftSize(l)
  const h = Math.min(0.12, l.shape.top * 0.3)
  const tail = u > 0 ? Math.exp(-((u / (size * DRIFT_TAIL)) ** 2) - (v / (size * DRIFT_WIDE)) ** 2) : 0
  const mound = Math.exp(-((u / (size * DRIFT_MOUND)) ** 2) - (v / (size * DRIFT_MOUND)) ** 2)
  return h * Math.max(tail, mound)
}

/** 沙尾连同脚下那圈沙占的范围，格（相对中心） */
function driftBox(p: DesertPlan, l: Landmark): { x0: number; y0: number; x1: number; y1: number } {
  const size = driftSize(l)
  const far = size * DRIFT_TAIL * DRIFT_CUT
  const wide = size * DRIFT_MOUND * DRIFT_CUT
  const ex = Math.cos(p.windAngle) * far
  const ey = Math.sin(p.windAngle) * far
  return { x0: Math.min(0, ex) - wide, y0: Math.min(0, ey) - wide, x1: Math.max(0, ex) + wide, y1: Math.max(0, ey) + wide }
}

/** 高光柔和地压到 1 以内 */
function tone(c: number): number {
  if (c <= 0.84) return c < 0 ? 0 : c
  return 0.84 + 0.16 * (1 - Math.exp(-(c - 0.84) / 0.16))
}

/**
 * 地面：沙丘是细而亮的金黄松沙，脊线往下是平整的落沙坡，迎风坡与丘间的薄沙上排着一道道风纹；丘间是砾石地（黑亮的荒漠漆石子、红褐的碎石、白石英）
 * 与龟裂的盐壳。斜阳从左上照来：向阳坡亮而暖，背阴的落沙坡与沙丘、标志物投下的长影偏蓝；标志物在地上的那部分（树根与落枝、石头、驼骨、岩盘）一起画进来，
 * 背风处拖着一条沙尾。贴图左右、上下首尾相接。只画 rect 那一块，out 里按这块的范围逐行排
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const p = sc.plan
  const ppu = sc.ppu
  const size = p.sizeU
  const w = rect.x1 - rect.x0
  const L = p.light
  const mpu = p.meterPerU
  const rk = size / RIPPLE_U
  const kx = Math.round(Math.cos(p.windAngle) * rk)
  const ky = Math.round(Math.sin(p.windAngle) * rk)
  const boxes = p.landmarks.map((l) => shadowBox(l.shape, p.offX, p.offY))
  const drifts = p.landmarks.map((l) => driftBox(p, l))
  const fc = prep.fieldCols
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const e = SLOPE_E
      const dune = duneAt(p, x, y)
      const hx0 = duneAt(p, x - e, y)
      const hx1 = duneAt(p, x + e, y)
      const hy0 = duneAt(p, x, y - e)
      const hy1 = duneAt(p, x, y + e)
      let zx = (hx1 - hx0 + sample(prep.swell, fc, FIELD_SPLIT, x + e, y) - sample(prep.swell, fc, FIELD_SPLIT, x - e, y)) / (2 * e * mpu)
      let zy = (hy1 - hy0 + sample(prep.swell, fc, FIELD_SPLIT, x, y + e) - sample(prep.swell, fc, FIELD_SPLIT, x, y - e)) / (2 * e * mpu)
      const cover = smooth(0.012, 0.06, dune)
      const steep = Math.sqrt(((hx1 - hx0) / (2 * e * mpu)) ** 2 + ((hy1 - hy0) / (2 * e * mpu)) ** 2)
      const slip = smooth(0.42, 0.55, steep) * cover
      const crest = smooth(0.002, 0.008, Math.abs(hx1 + hx0 + hy1 + hy0 - 4 * dune)) * smooth(0.08, 0.25, dune)
      const gravel = sample(prep.gravel, fc, FIELD_SPLIT, x, y)
      const crust = sample(prep.crust, fc, FIELD_SPLIT, x, y)
      const sheet = Math.max(0, 1 - gravel - crust) * (1 - cover)
      const tint = tileFbm((x * 5) / size, (y * 5) / size, 5, p.seed + 31, 3)
      const grain = tileNoise(x * 9, y * 9, size * 9, p.seed + 33) * 0.5 + tileNoise(x * 23, y * 23, size * 23, p.seed + 35) * 0.5

      // 沙丘：金黄的松沙，有的偏红、有的偏白；落沙坡更白更平整，一溜溜的沙流顺坡往下
      let r = DUNE[0] + (tint < 0.5 ? (DUNE_RED[0] - DUNE[0]) * (0.5 - tint) * 2 : (DUNE_PALE[0] - DUNE[0]) * (tint - 0.5) * 2)
      let g = DUNE[1] + (tint < 0.5 ? (DUNE_RED[1] - DUNE[1]) * (0.5 - tint) * 2 : (DUNE_PALE[1] - DUNE[1]) * (tint - 0.5) * 2)
      let b = DUNE[2] + (tint < 0.5 ? (DUNE_RED[2] - DUNE[2]) * (0.5 - tint) * 2 : (DUNE_PALE[2] - DUNE[2]) * (tint - 0.5) * 2)
      if (slip > 0) {
        const across = acrossDune(p, x, y)
        const flow = tileNoise(across * 7, 0.5, 4096, p.seed + 37) * 0.6 + tileNoise(across * 19, 3.5, 4096, p.seed + 39) * 0.4
        const k = 1.03 + (flow - 0.5) * 0.08
        r += (r * k - r) * slip
        g += (g * k - g) * slip
        b += (b * k - b) * slip
      }
      r *= 1 + crest * 0.05
      g *= 1 + crest * 0.06
      b *= 1 + crest * 0.07

      // 丘间：薄松沙偏橙；砾石地上石子越往中间铺得越密，石缝里是粗沙；盐壳发白，龟裂成多边形，翘起的边缘发亮
      if (cover < 0.999) {
        const k = (0.93 + 0.12 * grain) * (0.95 + 0.1 * tint)
        let fr = SHEET[0] * k
        let fg = SHEET[1] * k
        let fb = SHEET[2] * k
        if (gravel > 0.001) {
          fr += (GRAVEL[0] * k - fr) * gravel
          fg += (GRAVEL[1] * k - fg) * gravel
          fb += (GRAVEL[2] * k - fb) * gravel
          const pb = pebble(p, x, y, size * 3, p.seed + 51, Math.min(1, gravel * 1.15) * 0.68)
          if (pb.inside > 0) {
            const c = pb.h < 0.5 ? VARNISH : pb.h < 0.92 ? RUST : QUARTZ
            const lit = (0.7 + 0.4 * pb.lit) * (0.94 + 0.12 * grain)
            fr += (c[0] * lit - fr) * pb.inside
            fg += (c[1] * lit - fg) * pb.inside
            fb += (c[2] * lit - fb) * pb.inside
          }
          const dim = 1 - 0.42 * pb.shade
          fr *= dim
          fg *= dim
          fb *= dim
        }
        if (crust > 0.001) {
          const edge = tileEdge((x * CRACKS) / size, (y * CRACKS) / size, CRACKS, p.seed + 55)
          const crack = smooth(0.045, 0.012, edge)
          const fine = smooth(0.03, 0.007, tileEdge((x * CRACKS_FINE) / size, (y * CRACKS_FINE) / size, CRACKS_FINE, p.seed + 57)) * 0.35
          const curl = smooth(0.14, 0.05, edge) * (1 - crack) * 0.06
          const k2 = Math.max(crack, fine)
          const blot = (0.96 + 0.08 * tileFbm((x * 8) / size, (y * 8) / size, 8, p.seed + 59, 2)) * (1 + curl)
          fr += (CRUST[0] * blot + (CRACK[0] - CRUST[0] * blot) * k2 - fr) * crust
          fg += (CRUST[1] * blot + (CRACK[1] - CRUST[1] * blot) * k2 - fg) * crust
          fb += (CRUST[2] * blot + (CRACK[2] - CRUST[2] * blot) * k2 - fb) * crust
        }
        r = r * cover + fr * (1 - cover)
        g = g * cover + fg * (1 - cover)
        b = b * cover + fb * (1 - cover)
      }

      // 风纹：沙丘的迎风坡与丘间的薄沙上才有，落沙坡上的沙一直在往下流、留不住
      const fresh = smooth(0.32, 0.68, tileFbm((x * 3) / size, (y * 3) / size, 3, p.seed + 45, 2))
      const rip = (1 - slip) * (cover * (1 - crest * 0.7) + sheet * 0.8) * (0.7 + 0.3 * tint) * (0.35 + 0.65 * fresh)
      if (rip > 0.01) {
        const re = 0.5 / ppu
        const rzx = (rippleAt(p, kx, ky, x + re, y) - rippleAt(p, kx, ky, x - re, y)) / (2 * re * mpu)
        const rzy = (rippleAt(p, kx, ky, x, y + re) - rippleAt(p, kx, ky, x, y - re)) / (2 * re * mpu)
        zx += rzx * rip
        zy += rzy * rip
      }

      // 标志物：先算它在地上那部分与它拖出的沙尾，再算它投下的影子
      let shadow = 1 - sample(prep.sun, prep.sunCols, SUN_SPLIT, x, y)
      let prop: Prop | null = null
      for (let k = 0; k < p.landmarks.length; k++) {
        const l = p.landmarks[k]!
        const qx = wrapU(x - l.x, size)
        const qy = wrapU(y - l.y, size)
        const db = drifts[k]!
        if (qx >= db.x0 && qx <= db.x1 && qy >= db.y0 && qy <= db.y1) {
          const dr = 1 / ppu
          zx += (driftAt(p, l, qx + dr, qy) - driftAt(p, l, qx - dr, qy)) / (2 * dr * mpu)
          zy += (driftAt(p, l, qx, qy + dr) - driftAt(p, l, qx, qy - dr)) / (2 * dr * mpu)
        }
        const bx = boxes[k]!
        if (qx < bx.x0 || qx > bx.x1 || qy < bx.y0 || qy > bx.y1) continue
        const pr = propAt(p, l, qx, qy, PROP)
        if (pr) prop = pr
        shadow = Math.max(shadow, shadowCover(l.shape, p.offX, p.offY, qx, qy, 0.025) * (pr ? 0.25 : 1))
      }

      // 光：斜阳按坡向打亮，影子里只剩天光与沙地反上来的暖光；砾石地的石子各自已经打过光
      const nl = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      let lambert = Math.max(0, (-zx * L.x - zy * L.y + L.z) * nl) / L.z
      let up = nl
      if (prop) {
        const pl = Math.max(0, prop.nx * L.x + prop.ny * L.y + prop.nz * L.z) / L.z
        lambert += (pl - lambert) * prop.a
        up += (prop.nz - up) * prop.a
        r += (prop.r - r) * prop.a
        g += (prop.g - g) * prop.a
        b += (prop.b - b) * prop.a
      }
      const sunK = SUN_I * lambert * (1 - shadow)
      const skyK = SKY_I * (0.6 + 0.4 * up)
      out[o] = tone(r * (SUN_COL[0] * sunK + SKY_COL[0] * skyK + BOUNCE_COL[0] * BOUNCE_I)) * 255
      out[o + 1] = tone(g * (SUN_COL[1] * sunK + SKY_COL[1] * skyK + BOUNCE_COL[1] * BOUNCE_I)) * 255
      out[o + 2] = tone(b * (SUN_COL[2] * sunK + SKY_COL[2] * skyK + BOUNCE_COL[2] * BOUNCE_I)) * 255
      out[o + 3] = 255
    }
  }
}
