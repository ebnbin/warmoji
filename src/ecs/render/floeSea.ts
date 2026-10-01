import { UNIT } from '../../util/units'
import { Rng } from '../../util/rng'
import type { FloeField } from '../worlds/floe'
import { bilinear, clamp01, smooth, TOWARD } from './floe'

/** 冰缘图存的范围：水里离冰缘 −4 到 12 格（冰上为负） */
const SHORE_MIN_U = -4
const SHORE_SPAN_U = 16

/**
 * 给海面着色器的冰缘图：每个距离场的格子一个像素。水里离冰缘多远（格）拆成 16 位放进 R、G，线性插值后仍是线性的；
 * B 是浮冰挡住低低的太阳在水面投下的影子：朝太阳看 shadeU 格以内有冰就在影子里
 */
export function drawShore(ctx: CanvasRenderingContext2D, f: FloeField, shadeU: number): void {
  const img = ctx.createImageData(f.cols, f.rows)
  const steps = Math.max(2, Math.ceil(shadeU / 0.1))
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const k = j * f.cols + i
      const water = -f.edge[k]!
      const v = Math.round(clamp01((water - SHORE_MIN_U) / SHORE_SPAN_U) * 65535)
      let near = Infinity
      if (water > -0.3 && water < shadeU + 0.3) {
        for (let s = 1; s <= steps; s++) {
          const t = (s / steps) * shadeU * UNIT
          near = Math.min(near, -bilinear(f.edge, f.cols, f.rows, f.cell, 0, 0, (i + 0.5) * f.cell + TOWARD.x * t, (j + 0.5) * f.cell + TOWARD.y * t, -9))
        }
      }
      img.data[k * 4] = v >> 8
      img.data[k * 4 + 1] = v & 255
      img.data[k * 4 + 2] = Math.round(smooth(0.15, -0.25, near) * 255)
      img.data[k * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 风区图每个像素多少格：风区顺着风慢慢变，粗一点就够 */
export const LEE_CELL_U = 0.5
/** 风浪的波向散在下风两侧：按这几个波向（弧度）各推一遍风区再加权平均 */
const LEE_DIRS = [-0.36, -0.18, 0, 0.18, 0.36] as const
const LEE_WEIGHTS = [0.1, 0.2, 0.4, 0.2, 0.1] as const

/** 网格上双线性取值，x、y 按格子下标且已在网格内 */
function lerpGrid(a: Float32Array, w: number, h: number, x: number, y: number): number {
  const ix = Math.min(w - 2, x | 0)
  const iy = Math.min(h - 2, y | 0)
  const fx = x - ix
  const fy = y - iy
  const i = iy * w + ix
  const top = a[i]! + (a[i + 1]! - a[i]!) * fx
  const bot = a[i + w]! + (a[i + w + 1]! - a[i + w]!) * fx
  return top + (bot - top) * fy
}

/**
 * 给海面着色器的风区图：rect（像素）铺满画布，每个像素 LEE_CELL_U 格见方，存平时的风吹到这里之前在开阔水面上走了多远，
 * 占风区 fetchU 的比例（0 到 1），拆成 16 位放进 R、G。顺着风往下风推：这里的风区是上风两个像素处的风区再加两个像素，碰到冰清零
 */
export function drawLee(ctx: CanvasRenderingContext2D, f: FloeField, rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }, fetchU: number): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const n = w * h
  const ice = new Uint8Array(n)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) ice[j * w + i] = bilinear(f.edge, f.cols, f.rows, f.cell, 0, 0, rect.x + ((i + 0.5) * rect.w) / w, rect.y + ((j + 0.5) * rect.h) / h, -9) > 0 ? 1 : 0
  }
  const cap = fetchU / LEE_CELL_U
  const run = new Float32Array(n)
  const sum = new Float32Array(n)
  const order = new Uint32Array(n)
  for (let d = 0; d < LEE_DIRS.length; d++) {
    const dx = Math.cos(f.windAngle + LEE_DIRS[d]!)
    const dy = Math.sin(f.windAngle + LEE_DIRS[d]!)
    // 按顺风方向的投影从上风往下风排：取值的四个格子都比自己靠上风至少 0.58 个像素，分桶宽 0.5 就排在前面的桶里
    const lo = Math.min(0, (w - 1) * dx) + Math.min(0, (h - 1) * dy)
    const bucket = (k: number): number => Math.floor(((k % w) * dx + ((k / w) | 0) * dy - lo) / 0.5)
    const buckets = Math.ceil((Math.abs(dx) * w + Math.abs(dy) * h) / 0.5) + 2
    const count = new Uint32Array(buckets + 1)
    for (let k = 0; k < n; k++) count[1 + bucket(k)]!++
    for (let b = 1; b <= buckets; b++) count[b]! += count[b - 1]!
    for (let k = 0; k < n; k++) order[count[bucket(k)]!++] = k
    for (let o = 0; o < n; o++) {
      const k = order[o]!
      if (ice[k]) {
        run[k] = 0
        continue
      }
      const qx = (k % w) - dx * 2
      const qy = ((k / w) | 0) - dy * 2
      run[k] = qx < 0 || qy < 0 || qx > w - 1 || qy > h - 1 ? cap : Math.min(cap, lerpGrid(run, w, h, qx, qy) + 2)
    }
    for (let k = 0; k < n; k++) sum[k] = sum[k]! + (LEE_WEIGHTS[d]! * run[k]!) / cap
  }
  const img = ctx.createImageData(w, h)
  for (let k = 0; k < n; k++) {
    const v = Math.round(clamp01(sum[k]!) * 65535)
    img.data[k * 4] = v >> 8
    img.data[k * 4 + 1] = v & 255
    img.data[k * 4 + 2] = 0
    img.data[k * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export const NOISE_TILE = 256

/** 一块能无缝平铺的噪声：R、G、B 是三层互不相干的值噪声，各叠三个八度；给油脂冰、风斑、碎冰、白沫、海烟用。按画布的 y 往下算 */
export function drawSeaNoise(ctx: CanvasRenderingContext2D, seed: number): void {
  const n = NOISE_TILE
  const lattice = 16
  const r = new Rng(seed)
  const layers = [0, 1, 2].map(() => Float32Array.from({ length: lattice * lattice }, () => r.next()))
  const value = (v: Float32Array, x: number, y: number): number => {
    const fx = (x / n) * lattice
    const fy = (y / n) * lattice
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (a: number, b: number): number => v[(((b % lattice) + lattice) % lattice) * lattice + (((a % lattice) + lattice) % lattice)]!
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
    return top + (bot - top) * sy
  }
  const img = ctx.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = layers[c]!
        img.data[i + c] = Math.round((value(v, x, y) * 0.6 + value(v, x * 2 + 37, y * 2 + 11) * 0.3 + value(v, x * 4 + 5, y * 4 + 71) * 0.1) * 255)
      }
      // 画布纹理按预乘 alpha 上传，A 不满会把 R、G、B 一起压掉
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 风浪图边长多少个像素：快速傅里叶变换要 2 的幂 */
export const SEA_N = 64
/** 长浪、短浪两张图的边长，格：大小不成整数比，叠在一起看不出重复 */
const LONG_TILE_U = 10
const SHORT_TILE_U = 3.7
/** 角频率高出谱峰这么多倍的算短浪：短浪随当地的风即时涨落，长浪要有足够长的风区才长得起来 */
const SHORT_FROM = 1.3
/** JONSWAP 谱峰的尖锐程度 */
const JONSWAP_GAMMA = 3.3
/** 谱峰处波向分布 cos²ˢ(θ/2) 的 s：越大波向越集中在下风；离谱峰越远散得越开 */
const SPREAD_PEAK = 10

/** ln Γ(x)，Lanczos 近似 */
function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  const z = x - 1
  let a = c[0]!
  for (let i = 1; i < 9; i++) a += c[i]! / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** 一张风浪图：每个格子的波数（每格弧度）、角频率与开阔水面上的初始复振幅（格） */
interface SeaBand {
  readonly size: number
  readonly kx: Float32Array
  readonly ky: Float32Array
  readonly omega: Float32Array
  readonly re: Float32Array
  readonly im: Float32Array
  /** 有浪的格子 */
  readonly live: Uint16Array
  /** 浪高、x 坡度、y 坡度的标准差（格）与浪高的方差（格²） */
  readonly sigma: readonly [number, number, number]
  readonly variance: number
  /** 按浪高方差加权的平均角频率 */
  readonly omegaMean: number
}

/**
 * 海面的风浪：平时的风吹过上风 fetchM 米的开阔水面长成的风浪（JONSWAP 谱），波向按 cos²ˢ(θ/2) 散在下风两侧；
 * 谱铺在两张能平铺的波数网格上，长浪一张、短浪一张，每个波数按深水色散 ω² = gk 各转各的相位，逐帧做傅里叶逆变换得到浪高与坡度
 */
export class WindSea {
  /** 谱峰的角频率，每秒弧度 */
  readonly peakOmega: number
  readonly long: SeaBand
  readonly short: SeaBand
  private readonly rev = new Uint16Array(SEA_N)
  private readonly cos = new Float64Array(SEA_N / 2)
  private readonly sin = new Float64Array(SEA_N / 2)
  private readonly work = Array.from({ length: 6 }, () => new Float64Array(SEA_N * SEA_N))

  constructor(windAngle: number, seed: number, windMs: number, fetchM: number, meterPerU: number, g: number) {
    const xi = (g * fetchM) / (windMs * windMs)
    const alpha = 0.076 * xi ** -0.22
    const fp = 3.5 * (g / windMs) * xi ** -0.33
    this.peakOmega = 2 * Math.PI * fp
    const gU = g / meterPerU
    const r = new Rng(seed)
    const gauss = (): number => Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next())
    const band = (size: number, keep: (omega: number) => boolean): SeaBand => {
      const nn = SEA_N * SEA_N
      const kx = new Float32Array(nn)
      const ky = new Float32Array(nn)
      const omega = new Float32Array(nn)
      const re = new Float32Array(nn)
      const im = new Float32Array(nn)
      const live: number[] = []
      const dk = (2 * Math.PI) / size
      let variance = 0
      let sx = 0
      let sy = 0
      let wSum = 0
      for (let jy = 0; jy < SEA_N; jy++) {
        for (let jx = 0; jx < SEA_N; jx++) {
          const nx = jx < SEA_N / 2 ? jx : jx - SEA_N
          const ny = jy < SEA_N / 2 ? jy : jy - SEA_N
          const i = jy * SEA_N + jx
          const k = Math.hypot(nx, ny) * dk
          const w = Math.sqrt(gU * k)
          kx[i] = nx * dk
          ky[i] = ny * dk
          omega[i] = w
          // 奈奎斯特那一行一列没有对称的 −k，空着
          if (k === 0 || nx === -SEA_N / 2 || ny === -SEA_N / 2 || !keep(w)) continue
          const f = w / (2 * Math.PI)
          const sg = f <= fp ? 0.07 : 0.09
          const sf = (alpha * g * g * (2 * Math.PI) ** -4 * f ** -5 * Math.exp(-1.25 * (fp / f) ** 4) * JONSWAP_GAMMA ** Math.exp(-((f - fp) ** 2) / (2 * sg * sg * fp * fp))) / (meterPerU * meterPerU)
          const sk = (sf * gU) / (4 * Math.PI * w)
          const s = SPREAD_PEAK * (f <= fp ? (f / fp) ** 5 : (f / fp) ** -2.5)
          let th = Math.atan2(ny, nx) - windAngle
          th -= Math.round(th / (2 * Math.PI)) * 2 * Math.PI
          const spread = Math.cos(th / 2) ** (2 * s) / (2 * Math.PI * Math.exp(lgamma(2 * s + 1) - s * Math.log(4) - 2 * lgamma(s + 1)))
          const v = ((sk * spread) / k) * dk * dk
          const a = Math.sqrt(v / 4)
          re[i] = gauss() * a
          im[i] = gauss() * a
          live.push(i)
          variance += v
          sx += kx[i]! * kx[i]! * v
          sy += ky[i]! * ky[i]! * v
          wSum += w * v
        }
      }
      return { size, kx, ky, omega, re, im, live: Uint16Array.from(live), sigma: [Math.sqrt(variance), Math.sqrt(sx), Math.sqrt(sy)], variance, omegaMean: wSum / variance }
    }
    const split = SHORT_FROM * this.peakOmega
    this.long = band(LONG_TILE_U, (w) => w < split)
    this.short = band(SHORT_TILE_U, (w) => w >= split)
    const bits = Math.log2(SEA_N)
    for (let i = 0; i < SEA_N; i++) {
      let v = 0
      for (let b = 0; b < bits; b++) v |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = v
    }
    for (let i = 0; i < SEA_N / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / SEA_N)
      this.sin[i] = Math.sin((2 * Math.PI * i) / SEA_N)
    }
  }

  /** 开阔水面上浪高的标准差，格 */
  get sigmaU(): number {
    return Math.sqrt(this.long.variance + this.short.variance)
  }

  /** t 秒时的两张风浪图，RGBA：R 是浪高，G、B 是 x、y 两个方向的坡度，各按 ±4 倍标准差映到 0…255 */
  frame(t: number, long: Uint8ClampedArray, short: Uint8ClampedArray): void {
    const [lr, li, sr, si, br, bi] = this.work as [Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array]
    this.evolve(this.long, t, lr, li)
    this.evolve(this.short, t, sr, si)
    // 一次逆变换出两张实数图：实部一张、虚部一张
    const L = this.long
    const S = this.short
    for (let i = 0; i < SEA_N * SEA_N; i++) {
      const hr = lr[i]!
      const hi = li[i]!
      const qr = sr[i]!
      const qi = si[i]!
      // 长浪的浪高 + i·x 坡度
      lr[i] = hr * (1 - L.kx[i]!)
      li[i] = hi * (1 - L.kx[i]!)
      // 长浪的 y 坡度 + i·短浪的浪高
      br[i] = -(L.ky[i]! * hi + qi)
      bi[i] = L.ky[i]! * hr + qr
      // 短浪的 x 坡度 + i·y 坡度
      sr[i] = -S.ky[i]! * qr - S.kx[i]! * qi
      si[i] = S.kx[i]! * qr - S.ky[i]! * qi
    }
    this.ifft2(lr, li)
    this.ifft2(br, bi)
    this.ifft2(sr, si)
    const enc = (v: number, sigma: number): number => (0.5 + v / (8 * sigma)) * 255
    for (let i = 0; i < SEA_N * SEA_N; i++) {
      const o = i * 4
      long[o] = enc(lr[i]!, L.sigma[0])
      long[o + 1] = enc(li[i]!, L.sigma[1])
      long[o + 2] = enc(br[i]!, L.sigma[2])
      long[o + 3] = 255
      short[o] = enc(bi[i]!, S.sigma[0])
      short[o + 1] = enc(sr[i]!, S.sigma[1])
      short[o + 2] = enc(si[i]!, S.sigma[2])
      short[o + 3] = 255
    }
  }

  /** h̃(k, t) = h₀(k)·e^{iωt} + h₀*(−k)·e^{−iωt}：浪高是实数，谱共轭对称 */
  private evolve(b: SeaBand, t: number, re: Float64Array, im: Float64Array): void {
    re.fill(0)
    im.fill(0)
    for (let n = 0; n < b.live.length; n++) {
      const i = b.live[n]!
      const jx = i % SEA_N
      const jy = (i / SEA_N) | 0
      const m = ((SEA_N - jy) % SEA_N) * SEA_N + ((SEA_N - jx) % SEA_N)
      const c = Math.cos(b.omega[i]! * t)
      const s = Math.sin(b.omega[i]! * t)
      const a = b.re[i]!
      const d = b.im[i]!
      const a2 = b.re[m]!
      const d2 = b.im[m]!
      re[i] = (a + a2) * c - (d + d2) * s
      im[i] = (a - a2) * s + (d - d2) * c
    }
  }

  /** 原地做 SEA_N × SEA_N 的复数傅里叶逆变换，不除 N：先逐行、再逐列 */
  private ifft2(re: Float64Array, im: Float64Array): void {
    for (let r = 0; r < SEA_N; r++) this.ifft(re, im, r * SEA_N, 1)
    for (let c = 0; c < SEA_N; c++) this.ifft(re, im, c, SEA_N)
  }

  private ifft(re: Float64Array, im: Float64Array, off: number, stride: number): void {
    const n = SEA_N
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]!
      if (j <= i) continue
      const a = off + i * stride
      const b = off + j * stride
      const tr = re[a]!
      const ti = im[a]!
      re[a] = re[b]!
      im[a] = im[b]!
      re[b] = tr
      im[b] = ti
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2
      const step = n / size
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step]!
          const wi = this.sin[k * step]!
          const a = off + (start + k) * stride
          const b = a + half * stride
          const tr = re[b]! * wr - im[b]! * wi
          const ti = re[b]! * wi + im[b]! * wr
          re[b] = re[a]! - tr
          im[b] = im[a]! - ti
          re[a] = re[a]! + tr
          im[a] = im[a]! + ti
        }
      }
    }
  }
}

/**
 * 南大洋的海面，四边形盖住整片海，坐标按地图像素、y 朝下；纹理坐标 y 朝上，画布纹理上传时也上下翻了，采样时取反。
 * 深青黑的冷水上，有限风区里长成的风浪按深水色散此起彼伏，浪峰高出一定的份就碎成白浪，白浪多少随风速涨；
 * 浮冰下风的一侧风区短、风被挡，水面平静，越往外浪越长起来；阵风扫过的风斑里短浪被吹高。
 * 浪面映出低垂太阳那一侧发暖的天光，迎着太阳闪着碎金。冰缘外一圈是水下的冰脚，泛着青绿，浪打上来的一边水线上翻着白沫；
 * 浮冰挡住低低的太阳，在背阳的一侧水面投下影子。碎冰随海流漂、被风推着堆在上风的一边，顺风拉成一条条的油脂冰，冰多的地方压住了浪；
 * 水面上飘着海烟
 */
export const FLOE_SEA_FRAG = `
#pragma phaserTemplate(shaderName)
#pragma phaserTemplate(extensions)
#pragma phaserTemplate(features)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#pragma phaserTemplate(fragmentDefine)
varying vec2 outTexCoord;
#pragma phaserTemplate(outVariables)
#pragma phaserTemplate(fragmentHeader)
uniform sampler2D uNoise;
uniform sampler2D uShore;
uniform sampler2D uLee;
uniform sampler2D uLong;
uniform sampler2D uShort;
uniform float uTime;
uniform vec4 uRect;
uniform vec3 uGrid;
uniform vec3 uSun;
uniform vec4 uWind;
uniform vec4 uSeaState;
uniform vec4 uTiles;
uniform vec4 uLongScale;
uniform vec3 uShortScale;
uniform vec4 uLeeRect;
uniform vec4 uSwell;
uniform vec3 uFlow;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p), hash(p + 17.31));
}

// 冰缘图：x 是水里离冰缘多远（格，冰上为负），y 是浮冰投在水面上的影子
vec2 shore(vec2 world) {
  vec2 uv = world / uGrid.xy;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec2(12.0, 0.0);
  vec4 e = texture2D(uShore, vec2(uv.x, 1.0 - uv.y));
  return vec2((e.r * 65280.0 + e.g * 255.0) / 65535.0 * ${SHORE_SPAN_U.toFixed(1)} + ${SHORE_MIN_U.toFixed(1)}, e.b);
}

vec3 noise(vec2 q) {
  return texture2D(uNoise, vec2(q.x, -q.y)).rgb;
}

// 风浪图：浪高、x 坡度、y 坡度（格）
vec3 band(sampler2D t, vec2 q, float size, vec3 scale) {
  return (texture2D(t, vec2(q.x, -q.y) / size).rgb - 0.5) * 8.0 * scale;
}

// 风区：上风方向开阔水面的长度占开阔水面风区的比例
float leeAt(vec2 world) {
  vec2 uv = (world - uLeeRect.xy) / uLeeRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
  vec4 e = texture2D(uLee, vec2(uv.x, 1.0 - uv.y));
  return (e.r * 65280.0 + e.g * 255.0) / 65535.0;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 edge = shore(world);
  float d = edge.x;
  float shadow = edge.y;
  if (d < -0.2) {
    gl_FragColor = vec4(0.04, 0.07, 0.08, 1.0);
    return;
  }
  float unit = uGrid.z;
  vec2 p = world / unit;
  vec2 wdir = uWind.xy;
  vec2 across = vec2(-wdir.y, wdir.x);
  float level = uWind.w;
  float windU = uWind.z / uFlow.z;
  vec2 sunH = normalize(uSun.xy);
  vec2 drift = p - uFlow.xy * uTime;

  // 风区短的地方长不出长浪（谱峰往短波挪、尾巴略抬）；紧贴浮冰的下风连风都被挡住
  float phi = clamp(leeAt(world), 0.002, 1.0);
  float young = pow(phi, -1.32) - 1.0;
  float tail = min(pow(phi, -0.11), 1.3);
  float shelter = smoothstep(0.5, 8.0, phi * uSeaState.x);

  // 油脂冰顺风拉成条；碎冰被风推着堆在浮冰上风的一边，下风的一边浮冰漂开了、水面敞着
  float grease = smoothstep(0.6, 0.82, noise(vec2(dot(drift, wdir) * 0.006, dot(drift, across) * 0.05) + 0.31).r);
  float clump = smoothstep(0.3, 0.7, noise(drift / 31.0 + 0.13).g);
  float density = (0.62 * exp(-max(d, 0.0) / 1.4) + 0.06 * clump) * smoothstep(0.1, 0.45, d) * mix(0.3, 1.2, shelter);
  float calm = (1.0 - 0.7 * grease) * (1.0 - 0.6 * density);
  float paws = smoothstep(0.5, 0.78, noise((p - wdir * uTime * windU * 0.5) * 0.01 + 0.6).b) * (0.25 + 0.75 * level);
  float local = uWind.z * (1.0 + 0.3 * paws) * shelter;

  // 风浪：长浪要有风区才长得起来，短浪随当地的风即时涨落，又被长浪的轨道流挤在浪峰上
  float rl = uSeaState.y / uTiles.z;
  float rs = uSeaState.y / uTiles.w;
  float fl = exp(-0.625 * rl * rl * rl * rl * young) * shelter * calm;
  vec3 lw = band(uLong, drift, uTiles.x, uLongScale.xyz);
  vec3 sw = band(uShort, drift, uTiles.y, uShortScale);
  float strain = clamp(1.0 + 0.3 * fl * lw.x / uLongScale.x, 0.4, 1.8);
  float fs = tail * exp(-0.625 * rs * rs * rs * rs * young) * shelter * calm * sqrt(max(local, 0.5) / uSeaState.w) * strain;
  float crest = (fl * lw.x + fs * sw.x) / uSeaState.z;
  vec2 slope = fl * lw.yz + fs * sw.yz;
  float exposure = clamp(sqrt(fl * fl * uLongScale.w + fs * fs * (1.0 - uLongScale.w)), 0.0, 1.0);

  // 一列长涌浪按深水的色散推过来
  vec2 sw2 = vec2(uSwell.y, -uSwell.x) * 0.6 + uSwell.xy * 0.8;
  float ph = dot(drift, uSwell.xy) * uSwell.z - uSwell.w * uTime;
  float ph2 = dot(drift, sw2) * uSwell.z * 1.7 - uSwell.w * 1.3 * uTime + 1.7;
  slope += (uSwell.xy * cos(ph) + sw2 * 0.5 * cos(ph2)) * 0.03;
  float swell = sin(ph) * 0.7 + sin(ph2) * 0.3;

  // 低低的太阳把浪的起伏照得分明，浪面映着天：头顶的天偏蓝，太阳那一侧的天边发暖
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 nl = normalize(vec3(-slope * 1.6, 1.0));
  float relief = clamp((dot(nl, uSun) - uSun.z) * 3.2, -1.0, 1.0) * (1.0 - 0.6 * shadow);
  vec3 col = mix(vec3(0.034, 0.112, 0.142), vec3(0.11, 0.28, 0.32), clamp(0.4 + relief * 0.5 + crest * 0.05 + swell * 0.08, 0.0, 1.0));
  vec3 r = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
  float toSun = max(dot(normalize(r.xy + 0.0001), sunH), 0.0);
  float low = clamp(1.0 - r.z, 0.0, 1.0);
  vec3 skyC = mix(vec3(0.3, 0.43, 0.55), vec3(0.76, 0.81, 0.86), low) + vec3(0.7, 0.45, 0.25) * pow(toSun, 6.0) * low * 1.3;
  float fres = clamp(0.1 + 3.5 * (1.0 - n.z), 0.0, 0.6);
  col = mix(col, skyC, fres * (1.0 - 0.4 * grease) * (1.0 - 0.5 * shadow));
  col = mix(col, vec3(0.11, 0.17, 0.19), grease * 0.4);
  float glint = pow(max(dot(r, uSun), 0.0), 220.0) * 3.0 * (1.0 - grease);
  col += vec3(1.0, 0.86, 0.64) * glint * (1.0 - shadow);
  col *= 1.0 - 0.1 * paws * shelter;

  // 白浪：浪峰高出浪高标准差的一定倍数就碎，倍数按白浪覆盖率随风速的 3.41 次方涨（Monahan）反推；白沫顺着浪峰撕成一缕缕
  float cover = 3.84e-6 * pow(max(local, 1.0), 3.41);
  float q = sqrt(-2.0 * log(clamp(cover, 1e-6, 0.3)));
  float t0 = q - (2.515517 + 0.802853 * q + 0.010328 * q * q) / (1.0 + 1.432788 * q + 0.189269 * q * q + 0.001308 * q * q * q);
  float froth = noise(drift / 4.0 + 0.71).r;
  float tear = smoothstep(0.35, 0.75, noise(vec2(dot(drift, across) / 3.0, dot(drift, wdir) / 1.2) + 0.37).g);
  float cap = smoothstep(t0, t0 + 0.6, crest + 0.6 * (froth - 0.5)) * (0.3 + 0.7 * tear) * (1.0 - grease);
  col = mix(col, vec3(0.86, 0.91, 0.93) * (1.0 - 0.3 * shadow), cap * 0.85);

  // 水下的冰脚：冰缘外一圈泛着青绿，越往外越深越暗，随浪面晃
  float dd = d + (slope.x + slope.y) * 0.25;
  float ram = 0.55 + 0.45 * noise(p / 23.0 + 0.37).b;
  float under = exp(-max(dd, 0.0) / (0.4 + 0.55 * ram)) * smoothstep(-0.05, 0.04, d);
  col = mix(col, vec3(0.12, 0.47, 0.5) * (0.8 + 0.2 * relief), under * 0.8);
  col *= 1.0 - 0.4 * shadow;

  // 碎冰：大大小小有棱有角的冰块随海流漂；冰块九成在水下，四周透出一圈青绿
  vec2 bp = drift / 0.7;
  vec2 ip = floor(bp);
  vec2 fp = fract(bp);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 c1 = vec2(0.0);
  float h1 = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = g + hash2(ip + g) * 0.85 + 0.075 - fp;
      float e2 = dot(o, o);
      if (e2 < d1) {
        d2 = d1;
        d1 = e2;
        c1 = o;
        h1 = hash(ip + g + 7.3);
      } else if (e2 < d2) {
        d2 = e2;
      }
    }
  }
  // 一块冰有没有按它中心那一点的疏密定，免得被疏密的等值线切开
  vec2 cw = world + c1 * 0.7 * unit;
  float cshelter = smoothstep(0.5, 8.0, clamp(leeAt(cw), 0.002, 1.0) * uSeaState.x);
  float cd = shore(cw).x;
  float cclump = smoothstep(0.3, 0.7, noise((drift + c1 * 0.7) / 31.0 + 0.13).g);
  if (h1 < (0.62 * exp(-max(cd, 0.0) / 1.4) + 0.06 * cclump) * smoothstep(0.1, 0.45, cd) * mix(0.3, 1.2, cshelter)) {
    float inside = sqrt(d2) - sqrt(d1);
    float gap = 0.1 + 0.34 * fract(h1 * 17.3);
    float plate = smoothstep(gap, gap + 0.025, inside);
    float halo = smoothstep(gap - 0.16, gap, inside) * (1.0 - plate);
    float rim = smoothstep(gap + 0.14, gap + 0.02, inside);
    float face = dot(normalize(-c1 + 0.0001), sunH);
    // 有的块顶着雪，有的是光冰，有的薄得透出海水；背阳的一边在水上落一小片影子
    float kind = fract(h1 * 29.0);
    vec3 top = kind < 0.5 ? vec3(0.9, 0.94, 0.96) : kind < 0.82 ? vec3(0.66, 0.79, 0.84) : mix(col, vec3(0.5, 0.66, 0.7), 0.55);
    float lit = 0.9 + 0.24 * rim * face + 0.1 * (noise(bp * 0.37 + h1).g - 0.5);
    col = mix(col, vec3(0.12, 0.44, 0.48), halo * 0.55);
    col *= 1.0 - 0.35 * halo * max(-face, 0.0);
    col = mix(col, top * lit * (1.0 - 0.32 * shadow), plate);
  }

  // 水线：浪打上来的一边一道白沫随浪涨落、漂开一缕缕泡沫，背风的一边只有涌浪舔湿的一条细线
  float wash = 0.04 + 0.05 * (0.5 + 0.5 * swell) + 0.14 * exposure * (0.5 + 0.5 * clamp(crest, -1.0, 1.0));
  float foam = (1.0 - smoothstep(wash * 0.5, wash + 0.06, d)) * (0.35 + 0.65 * exposure) * (0.7 + 0.3 * froth) * smoothstep(-0.12, -0.02, d);
  foam = max(foam, smoothstep(0.68, 0.88, froth) * exp(-max(d, 0.0) / 0.8) * 0.45 * exposure * smoothstep(0.1, 0.4, d));
  col = mix(col, vec3(0.9, 0.95, 0.96) * (1.0 - 0.3 * shadow), clamp(foam, 0.0, 1.0));

  // 海烟：冷风吹过稍暖的海水，贴着水面飘起一缕缕顺风拉长、被湍流揉皱的白雾
  vec2 pm = p - wdir * uTime * windU * 0.4;
  vec2 mq = vec2(dot(pm, wdir) / 60.0, dot(pm, across) / 12.0 + (noise(pm / 40.0 + 0.2).g - 0.5) * 0.15);
  float mist = smoothstep(0.5, 0.85, noise(mq + 0.5).r) * smoothstep(0.35, 0.75, noise(pm / 55.0 + 0.7).b) * smoothstep(0.5, 3.0, d);
  col = mix(col, vec3(0.74, 0.82, 0.87), mist * 0.14);
  gl_FragColor = vec4(col, 1.0);
}
`
