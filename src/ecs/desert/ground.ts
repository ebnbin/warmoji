import { tileFbm, tileNoise } from './noise'
import { duneCover, duneGrad, flatLooseAt, heightAt, smooth, swellAt, twinFbm, wavesOf, wrapU } from './terrain'
import { shadowBox, shadowCover, slabAt } from './landmarks'
import type { DesertPlan, Landmark } from './terrain'

/** 往太阳方向找挡光的地面，每步走多远（格） */
const MARCH_U = 0.1
/** 挡出来的背阴先按这么细的格子算好，画的时候双线性插值，每格分几份 */
const SUN_SPLIT = 16
/** 风纹的间距，格：十几厘米一道 */
const RIPPLE_U = 0.24
/** 风纹的高，米 */
const RIPPLE_M = 0.0018
/** 求起伏的坡度时左右各取多远，格 */
const SLOPE_E = 0.03

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

type Rgb = [number, number, number]

/** 金黄的阳光、近白的天光与沙地反上来的暖光：向阳处金黄，影子里暗成琥珀色 */
const SUN_COL: Rgb = [1.0, 0.9, 0.52]
const SKY_COL: Rgb = [0.91, 0.92, 1.0]
const BOUNCE_COL: Rgb = [0.95, 0.74, 0.52]
const SUN_I = 0.6
const SKY_I = 0.4
const BOUNCE_I = 0.09

/** 沙的固有色：丘间实一点的沙偏红偏深、松沙偏橙，沙丘上的细沙金黄，有的偏红、有的偏白；风纹的凹里积着一层深色的重矿物 */
const FLAT_FIRM: Rgb = [0.93, 0.7, 0.5]
const FLAT_LOOSE: Rgb = [0.98, 0.78, 0.57]
const DUNE: Rgb = [1.0, 0.81, 0.6]
const DUNE_RED: Rgb = [0.97, 0.75, 0.55]
const DUNE_PALE: Rgb = [1.0, 0.86, 0.68]
const MINERAL: Rgb = [0.5, 0.38, 0.3]
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

/** 先算一次的东西：沙丘与起伏挡出来的背阴（1 是晒得到） */
export interface Prepared {
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

export function prepare(sc: PaintScene): Prepared {
  const p = sc.plan
  const n = p.sizeU * SUN_SPLIT
  const height = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) height[j * n + i] = heightAt(p, (i + 0.5) / SUN_SPLIT, (j + 0.5) / SUN_SPLIT)
  const lxy = Math.hypot(p.light.x, p.light.y)
  const sx = p.light.x / lxy
  const sy = p.light.y / lxy
  const rise = (p.light.z / lxy) * p.meterPerU
  let top = 0
  for (const d of p.dunes) top = Math.max(top, d.top)
  const reach = ((top + 2 * p.swellM) / rise) * 1.05
  const sun = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / SUN_SPLIT
      const y = (j + 0.5) / SUN_SPLIT
      const z = height[j * n + i]!
      let over = -Infinity
      for (let d = MARCH_U; d <= reach; d += MARCH_U) over = Math.max(over, sample(height, n, SUN_SPLIT, x + sx * d, y + sy * d) - z - d * rise)
      sun[j * n + i] = 1 - smooth(-0.006, 0.03, over)
    }
  }
  return { sunCols: n, sun }
}

/** 风纹绕着沙丘弯：沙丘每高一米，风纹的相位挪这么多弧度 */
const RIPPLE_BEND = 30

/**
 * 风纹：横着风向一道接一道，迎风缓、背风陡；被低频的噪声扭弯、间距时疏时密，爬上沙丘时顺着等高线绕过去。
 * 波矢取整数、两个分量之和是偶数，一圈里排整数道，横竖各挪半圈也接得上。dune 是这里沙丘的高（米）；返回高（米）
 */
function rippleAt(p: DesertPlan, kx: number, ky: number, x: number, y: number, dune: number): number {
  const warp = (twinFbm(p, x, y, wavesOf(p, 6.4), p.seed + 41, 2) - 0.5) * 14 + (twinFbm(p, x, y, wavesOf(p, 1.45), p.seed + 43, 1) - 0.5) * 2.6 + dune * RIPPLE_BEND
  const ph = ((kx * x + ky * y) / p.sizeU) * Math.PI * 2 + warp
  return RIPPLE_M * (Math.sin(ph) + 0.28 * Math.sin(2 * ph + 0.6))
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
 * 地面：几乎全是沙。沙丘是金黄的细沙，有的偏红、有的偏白，顶上更淡；丘间的沙成片地实一些、松一些，实的偏红偏深。
 * 迎风坡与丘间排着一道道风纹，凹里积着深色的重矿物，背风坡的沙更平整。斜阳从左上照来：向阳坡亮而金黄，背着太阳的坡与影子暗成琥珀色；
 * 标志物在地上的那部分（树根与落枝、石头、驼骨、岩盘）一起画进来，背风处拖着一条沙尾。贴图左右、上下首尾相接，横竖各挪半圈也一模一样。
 * 只画 rect 那一块，out 里按这块的范围逐行排
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
  let ky = Math.round(Math.sin(p.windAngle) * rk)
  if ((kx + ky) % 2 !== 0) ky += ky < 0 ? -1 : 1
  const wc = Math.cos(p.windAngle)
  const ws = Math.sin(p.windAngle)
  const span = p.flatLoose[1] - p.flatLoose[0]
  const boxes = p.landmarks.map((l) => shadowBox(l.shape, p.offX, p.offY))
  const drifts = p.landmarks.map((l) => driftBox(p, l))
  const dune = { h: 0, x: 0, y: 0 }
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const e = SLOPE_E
      duneGrad(p, x, y, dune)
      let zx = dune.x + (swellAt(p, x + e, y) - swellAt(p, x - e, y)) / (2 * e * mpu)
      let zy = dune.y + (swellAt(p, x, y + e) - swellAt(p, x, y - e)) / (2 * e * mpu)
      const cover = duneCover(dune.h)
      const steep = Math.hypot(dune.x, dune.y)
      const lee = smooth(0.12, 0.4, -(dune.x * wc + dune.y * ws))
      const crest = smooth(0.15, 0.45, dune.h) * (1 - smooth(0.03, 0.15, steep))
      const firm = span > 0 ? (p.flatLoose[1] - flatLooseAt(p, x, y)) / span : 0
      const tint = twinFbm(p, x, y, wavesOf(p, 6.4), p.seed + 31, 3)
      const wide = twinFbm(p, x, y, wavesOf(p, 16), p.seed + 33, 2)
      const grain = twinFbm(p, x, y, size * 9, p.seed + 35, 1) * 0.5 + twinFbm(p, x, y, size * 23, p.seed + 37, 1) * 0.5

      // 沙丘的细沙与丘间的沙按盖住的程度混；整片沙漠的色调大片地偏红、偏淡；顶上的沙更细更淡
      const dr = DUNE[0] + (tint < 0.5 ? (DUNE_RED[0] - DUNE[0]) * (0.5 - tint) * 2 : (DUNE_PALE[0] - DUNE[0]) * (tint - 0.5) * 2)
      const dg = DUNE[1] + (tint < 0.5 ? (DUNE_RED[1] - DUNE[1]) * (0.5 - tint) * 2 : (DUNE_PALE[1] - DUNE[1]) * (tint - 0.5) * 2)
      const db = DUNE[2] + (tint < 0.5 ? (DUNE_RED[2] - DUNE[2]) * (0.5 - tint) * 2 : (DUNE_PALE[2] - DUNE[2]) * (tint - 0.5) * 2)
      const fr = FLAT_LOOSE[0] + (FLAT_FIRM[0] - FLAT_LOOSE[0]) * firm
      const fg = FLAT_LOOSE[1] + (FLAT_FIRM[1] - FLAT_LOOSE[1]) * firm
      const fb = FLAT_LOOSE[2] + (FLAT_FIRM[2] - FLAT_LOOSE[2]) * firm
      const drift = (wide - 0.5) * 0.12
      const k = (0.96 + 0.08 * grain) * (1 + crest * 0.04)
      let r = (fr + (dr - fr) * cover) * (1 + drift) * k
      let g = (fg + (dg - fg) * cover) * (1 + drift * 0.4) * k
      let b = (fb + (db - fb) * cover) * (1 - drift * 0.3) * k

      // 风纹：背风坡上的沙一直在往下滑、留不住，顶上被风削平；成片地有的新鲜清楚、有的被吹糊了；凹里积着深色的重矿物
      const fresh = smooth(0.3, 0.7, twinFbm(p, x, y, wavesOf(p, 10.7), p.seed + 45, 2))
      const rip = (1 - 0.85 * lee) * (1 - 0.6 * crest) * (0.35 + 0.65 * fresh)
      if (rip > 0.01) {
        const re = 0.5 / ppu
        const h = dune.h
        const hx = dune.x * re * mpu
        const hy = dune.y * re * mpu
        const r0 = rippleAt(p, kx, ky, x, y, h)
        zx += ((rippleAt(p, kx, ky, x + re, y, h + hx) - rippleAt(p, kx, ky, x - re, y, h - hx)) / (2 * re * mpu)) * rip
        zy += ((rippleAt(p, kx, ky, x, y + re, h + hy) - rippleAt(p, kx, ky, x, y - re, h - hy)) / (2 * re * mpu)) * rip
        const dark = smooth(0.2, 1, -r0 / RIPPLE_M) * rip * (0.16 - 0.08 * cover)
        r += (MINERAL[0] - r) * dark
        g += (MINERAL[1] - g) * dark
        b += (MINERAL[2] - b) * dark
      }

      // 标志物：先算它拖出的沙尾，再算它在地上那部分与它投下的影子
      let shadow = 1 - sample(prep.sun, prep.sunCols, SUN_SPLIT, x, y)
      let prop: Prop | null = null
      for (let n = 0; n < p.landmarks.length; n++) {
        const l = p.landmarks[n]!
        const qx = wrapU(x - l.x, size)
        const qy = wrapU(y - l.y, size)
        const db2 = drifts[n]!
        if (qx >= db2.x0 && qx <= db2.x1 && qy >= db2.y0 && qy <= db2.y1) {
          const dr2 = 1 / ppu
          zx += (driftAt(p, l, qx + dr2, qy) - driftAt(p, l, qx - dr2, qy)) / (2 * dr2 * mpu)
          zy += (driftAt(p, l, qx, qy + dr2) - driftAt(p, l, qx, qy - dr2)) / (2 * dr2 * mpu)
        }
        const bx = boxes[n]!
        if (qx < bx.x0 || qx > bx.x1 || qy < bx.y0 || qy > bx.y1) continue
        const pr = propAt(p, l, qx, qy, PROP)
        if (pr) prop = pr
        shadow = Math.max(shadow, shadowCover(l.shape, p.offX, p.offY, qx, qy, 0.025) * (pr ? 0.25 : 1))
      }

      // 光：斜阳按坡向打亮，影子里只剩天光与沙地反上来的暖光
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
