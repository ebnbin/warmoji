import { UNIT } from '../../util/units'
import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import type { ShipConfig } from '../../types/maps'
import { bulgeU, halfBeamAt, hatchesOf, helmOf, skylightOf, spritOf } from '../../data/ship'
import { deckPoint } from '../worlds/ship'
import type { Deck } from '../worlds/ship'
import type { Point } from '../../util/vec'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const frac = (x: number): number => x - Math.floor(x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 高 1 格的东西在甲板上投下的影子有多长，格 */
export const SHADOW_PER_U = Math.hypot(SUN.x, SUN.y) / SUN.z

/** 甲板贴图每格多少像素：和其他地图的地面一样细 */
export const DECK_PPU = GROUND_PPU
/** 舷墙外还要画链板、炮口与锚，贴图往外多留几格 */
const OUTBOARD_U = 1.5

/** 甲板贴图覆盖的范围，格：船长方向 [s0, s1]，横向 [−t1, t1] */
export interface DeckFrame {
  readonly s0: number
  readonly s1: number
  readonly t1: number
}

export function deckFrame(cfg: ShipConfig): DeckFrame {
  const h = cfg.hull
  const out = h.bulwarkU + OUTBOARD_U
  return { s0: -bulgeU(h) - out, s1: h.lengthU + out, t1: h.beamU / 2 + out }
}

/** 船上一点离舷墙外沿多远，格，舷墙以内为负；船首柱与横板中线外按到端点的距离算 */
export function railDistance(cfg: ShipConfig, s: number, t: number): number {
  const h = cfg.hull
  const end = -bulgeU(h)
  if (s >= h.lengthU) return Math.hypot(s - h.lengthU, t) - h.bulwarkU
  if (s <= end) return Math.hypot(s - end, t) - h.bulwarkU
  const e = 0.02
  const db = (halfBeamAt(h, s + e) - halfBeamAt(h, s - e)) / (2 * e)
  return (Math.abs(t) - halfBeamAt(h, s) - h.bulwarkU) / Math.sqrt(1 + db * db)
}

/** 一根桅杆：立在船长方向 s 格处，高 height 米，桅楼在 top 米，帆桁的高（米）与半长（格） */
export interface Mast {
  readonly s: number
  readonly height: number
  readonly top: number
  readonly yards: readonly { readonly h: number; readonly half: number }[]
}

/** 桅杆从船尾往船头排，从船头数第二根是主桅，三根时最后面那根是后桅：后桅两层横帆、主桅与前桅三层；帆桁按船宽定长，伸出舷外 */
export function rigOf(cfg: ShipConfig): Mast[] {
  const h = cfg.hull
  const at = [...h.masts].sort((a, b) => a - b)
  const beam = h.beamU
  return at.map((f, i) => {
    const mizzen = at.length > 2 && i === 0
    const main = i === at.length - 2
    const height = mizzen ? 13 : main ? 17.5 : 15.5
    const k = mizzen ? 0.8 : main ? 1 : 0.94
    const yards = mizzen
      ? [
          { h: height * 0.46, half: beam * 0.5 * k },
          { h: height * 0.74, half: beam * 0.37 * k },
        ]
      : [
          { h: height * 0.42, half: beam * 0.62 * k },
          { h: height * 0.66, half: beam * 0.48 * k },
          { h: height * 0.86, half: beam * 0.34 * k },
        ]
    return { s: f * h.lengthU, height, top: height * 0.55, yards }
  })
}

// ————————————————————————————— 海面用的距离场 —————————————————————————————

/** 距离场贴图里存的范围：离甲板边 −2 到 8 格；每格几个采样点 */
const EDGE_MIN_U = -2
const EDGE_SPAN_U = 10
export const EDGE_PPU = 8
/** 只在船身附近这么宽的一圈里算精确距离，外面按远处填 */
const EDGE_BAND_U = 2.8

/** 甲板边的轮廓：沿船长密密地取点，两舷各一条，首尾接上船首柱与横板中线，格 */
function outline(cfg: ShipConfig): Point[] {
  const h = cfg.hull
  const s0 = -bulgeU(h)
  const n = Math.ceil((h.lengthU - s0) / 0.15)
  const star: Point[] = []
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((h.lengthU - s0) * i) / n
    star.push({ x: s, y: halfBeamAt(h, s) })
  }
  const port = star.map((p) => ({ x: p.x, y: -p.y })).reverse()
  return [...star, ...port]
}

/**
 * 甲板边的距离场贴图，给海面画船壳、水线与白沫：每个采样点离甲板边多远（外为正、格），16 位拆进 R、G 两个通道，
 * 线性插值后仍是线性的。按解析的船形取多边形，只在船身附近一圈逐条边更新最近距离，边是光滑的
 */
export function drawEdgeField(ctx: CanvasRenderingContext2D, cfg: ShipConfig, deck: Deck, cols: number, rows: number): void {
  const dist = new Float32Array(cols * rows)
  const poly = outline(cfg).map((p) => deckPoint(deck, p.x, p.y))
  const step = UNIT / EDGE_PPU
  const band = EDGE_BAND_U * UNIT
  const far = (EDGE_BAND_U * UNIT) ** 2
  dist.fill(far)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len2 = ex * ex + ey * ey || 1
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - band) / step))
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + band) / step))
    const r0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - band) / step))
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(a.y, b.y) + band) / step))
    for (let r = r0; r <= r1; r++) {
      const y = (r + 0.5) * step
      for (let c = c0; c <= c1; c++) {
        const x = (c + 0.5) * step
        const u = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey) / len2))
        const qx = x - a.x - ex * u
        const qy = y - a.y - ey * u
        const d = qx * qx + qy * qy
        const k = r * cols + c
        if (d < dist[k]!) dist[k] = d
      }
    }
  }
  const h = cfg.hull
  const sLo = -bulgeU(h)
  const tabStep = 0.02
  const tab = new Float32Array(Math.ceil((h.lengthU - sLo) / tabStep) + 2)
  for (let i = 0; i < tab.length; i++) tab[i] = halfBeamAt(h, sLo + i * tabStep)
  const img = ctx.createImageData(cols, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c
      const x = (c + 0.5) * step
      const y = (r + 0.5) * step
      const dx = x - deck.ox
      const dy = y - deck.oy
      const ts = ((dx * deck.bx + dy * deck.by) / UNIT - sLo) / tabStep
      const inside = ts >= 0 && ts < tab.length - 1 && Math.abs((dx * deck.sx + dy * deck.sy) / UNIT) < tab[Math.floor(ts)]!
      const u = Math.sqrt(dist[k]!) / UNIT
      const d = inside ? -Math.min(u, -EDGE_MIN_U) : u
      const v = Math.round(clamp01((d - EDGE_MIN_U) / EDGE_SPAN_U) * 65535)
      img.data[k * 4] = v >> 8
      img.data[k * 4 + 1] = v & 255
      img.data[k * 4 + 2] = 0
      img.data[k * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

// ————————————————————————————— 海面的波纹贴图 —————————————————————————————

export const WAVE_TILE = 256

/**
 * 一块能无缝平铺的风浪高度场：几十列整数波数的尖顶波（1 − |sin|）叠加，波向集中在风向两侧；
 * R、G 存两个方向的坡度，B 存高度。按画布的 y 往下算，采样时 y 取反与画布对齐
 */
export function drawWaveTile(ctx: CanvasRenderingContext2D, wind: Point, seed: number): void {
  const n = WAVE_TILE
  const rng = new Rng(seed)
  const base = Math.atan2(wind.y, wind.x)
  const hgt = new Float32Array(n * n)
  const gx = new Float32Array(n * n)
  const gy = new Float32Array(n * n)
  for (let i = 0; i < 16; i++) {
    const ang = base + (rng.next() * 2 - 1) * 1.1
    const k = 2 + Math.floor(rng.next() ** 1.6 * 9)
    const kx = Math.round(Math.cos(ang) * k)
    const ky = Math.round(Math.sin(ang) * k)
    if (kx === 0 && ky === 0) continue
    const a = 1 / Math.hypot(kx, ky) ** 1.25
    const p = rng.next() * Math.PI * 2
    const dx = ((kx * Math.PI * 2) / n)
    const cd = Math.cos(dx)
    const sd = Math.sin(dx)
    const slope = -1.5 * a * ((Math.PI * 2) / n)
    for (let y = 0; y < n; y++) {
      const ph0 = ((ky * y) / n) * Math.PI * 2 + p
      let sn = Math.sin(ph0)
      let cs = Math.cos(ph0)
      const row = y * n
      for (let x = 0; x < n; x++) {
        const r = 1 - Math.abs(sn)
        const sq = Math.sqrt(r)
        hgt[row + x]! += a * r * sq
        const d = slope * sq * (sn < 0 ? -1 : 1) * cs
        gx[row + x]! += d * kx
        gy[row + x]! += d * ky
        const ns = sn * cd + cs * sd
        cs = cs * cd - sn * sd
        sn = ns
      }
    }
  }
  let lo = Infinity
  let hi = -Infinity
  let gmax = 0
  for (let i = 0; i < n * n; i++) {
    lo = Math.min(lo, hgt[i]!)
    hi = Math.max(hi, hgt[i]!)
    gmax = Math.max(gmax, Math.abs(gx[i]!), Math.abs(gy[i]!))
  }
  const img = ctx.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    img.data[i * 4] = Math.round((0.5 + (0.5 * gx[i]!) / gmax) * 255)
    img.data[i * 4 + 1] = Math.round((0.5 + (0.5 * gy[i]!) / gmax) * 255)
    img.data[i * 4 + 2] = Math.round(((hgt[i]! - lo) / (hi - lo)) * 255)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

// ————————————————————————————— 甲板 —————————————————————————————

const PLANK_U = 0.5
const BUTT_U = 11
const BEAM_U = 1.25
const MARGIN_U = 0.62
const SEAM_U = 0.035

type Rgb = [number, number, number]
const DECK_LIGHT: Rgb = [0.91, 0.8, 0.67]
const DECK_DARK: Rgb = [0.55, 0.47, 0.39]
const CAULK: Rgb = [0.09, 0.065, 0.05]
const RAIL_WOOD: Rgb = [0.44, 0.35, 0.29]

function lerp3(a: Rgb, b: Rgb, t: number, out: Rgb): Rgb {
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  out[2] = a[2] + (b[2] - a[2]) * t
  return out
}

/** 船上 (s, t) 格处是不是在甲板上（舷墙以内） */
function onDeck(cfg: ShipConfig, s: number, t: number): boolean {
  return Math.abs(t) < halfBeamAt(cfg.hull, s)
}

/**
 * 甲板贴图：船长方向沿贴图的 x（船头朝右），右舷朝下。刷洗得泛白的柚木甲板沿船长铺板，板缝嵌着黑色的填缝，
 * 板头错开接缝、按横梁钉木钉；沿着舷墙有一圈顺着船形弯的边板，舷墙顶是圆润的桃花心木扶手。
 * 中线一带被踩白、洗白，靠舷墙的地方潮湿发暗。light 是朝太阳的水平方向在船上的分量
 */
export function paintDeck(ctx: CanvasRenderingContext2D, cfg: ShipConfig, seed: number, light: { s: number; t: number }): void {
  const h = cfg.hull
  const f = deckFrame(cfg)
  const W = Math.ceil((f.s1 - f.s0) * DECK_PPU)
  const H = Math.ceil(2 * f.t1 * DECK_PPU)
  const img = ctx.createImageData(W, H)
  const data = img.data
  const half = h.beamU / 2
  const bw = h.bulwarkU
  const planks = Math.ceil(h.beamU / PLANK_U) + 1
  // 逐列：甲板半宽、斜率修正、边板与扶手的木纹；逐块板：沿船长的木纹与细纹的偏移
  const bAt = new Float32Array(W)
  const kAt = new Float32Array(W)
  const sAt = new Float32Array(W)
  const marginGrain = new Float32Array(W)
  const railGrain = new Float32Array(W)
  const streak: Float32Array[] = []
  const shift: Float32Array[] = []
  for (let j = 0; j < planks; j++) {
    streak.push(new Float32Array(W))
    shift.push(new Float32Array(W))
  }
  for (let px = 0; px < W; px++) {
    const s = f.s0 + (px + 0.5) / DECK_PPU
    const e = 0.02
    const db = (halfBeamAt(h, s + e) - halfBeamAt(h, s - e)) / (2 * e)
    sAt[px] = s
    bAt[px] = halfBeamAt(h, s)
    kAt[px] = 1 / Math.sqrt(1 + db * db)
    marginGrain[px] = fbm(s * 0.45, 1.7, seed + 17, 2)
    railGrain[px] = fbm(s * 0.6, 4.2, seed + 83, 2)
    for (let j = 0; j < planks; j++) {
      streak[j]![px] = fbm(s * 0.32 + j * 7.1, j * 1.3, seed + 23, 3)
      shift[j]![px] = fbm(s * 0.22, j * 3.7, seed + 41, 2) * 4
    }
  }
  // 大块的水渍与晒白：粗网格上取噪声，逐像素双线性插值
  const G = 8
  const gw = Math.ceil(W / G) + 2
  const gh = Math.ceil(H / G) + 2
  const blotGrid = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const s = f.s0 + (gx * G) / DECK_PPU
      const t = (gy * G) / DECK_PPU - f.t1
      blotGrid[gy * gw + gx] = (fbm(s * 0.09, t * 0.13, seed + 71, 3) - 0.5) * 0.16
    }
  }
  const tip = h.lengthU
  const end = -bulgeU(h)
  const px1 = 1 / DECK_PPU
  const c: Rgb = [0, 0, 0]
  const lh = Math.hypot(light.s, light.t) || 1
  const nailDark = lerp3(DECK_DARK, CAULK, 0.4, [0, 0, 0])
  const buttOff: number[] = []
  for (let j = 0; j < planks; j++) buttOff.push((((j * 7) % 5) / 5) * BUTT_U)
  const segMin = Math.floor(f.s0 / BUTT_U) - 1
  const segs = Math.ceil((f.s1 - f.s0) / BUTT_U) + 3
  const plankTone = new Float32Array(planks * segs)
  for (let j = 0; j < planks; j++) for (let k = 0; k < segs; k++) plankTone[j * segs + k] = valueNoise(j, k + segMin, seed + 31)
  const SIN_N = 1024
  const sinTab = new Float32Array(SIN_N)
  for (let k = 0; k < SIN_N; k++) sinTab[k] = Math.sin((k / SIN_N) * Math.PI * 2) * 0.5 + 0.5
  const NAIL2 = 0.07 * 0.07
  for (let py = 0; py < H; py++) {
    const t = (py + 0.5) / DECK_PPU - f.t1
    const at = Math.abs(t)
    const j = Math.max(0, Math.min(planks - 1, Math.floor((t + half) / PLANK_U)))
    const v = (t + half) / PLANK_U - Math.floor((t + half) / PLANK_U)
    const seamV = Math.min(v, 1 - v) * PLANK_U
    const seamK = smooth(SEAM_U, SEAM_U * 0.35, seamV)
    const lineBase = v * 5.5
    const nailV = Math.min(Math.abs(v - 0.27), Math.abs(v - 0.73)) * PLANK_U
    const buttNailV = Math.min(Math.abs(v - 0.3), Math.abs(v - 0.7)) * PLANK_U
    const worn = Math.exp(-((t / (half * 0.42)) ** 2)) * 0.07
    const gyf = (py / G)
    const gy0 = Math.floor(gyf)
    const fy = gyf - gy0
    const row = streak[j]!
    const rowShift = shift[j]!
    const off = buttOff[j]!
    for (let px = 0; px < W; px++) {
      const s = sAt[px]!
      const inside = s >= tip ? -Math.hypot(s - tip, t) : s <= end ? -Math.hypot(s - end, t) : (bAt[px]! - at) * kAt[px]!
      const rail = inside + bw
      if (rail <= -px1) continue
      if (inside > 0) {
        if (inside < MARGIN_U) {
          const tone = 0.42 + (marginGrain[px]! - 0.5) * 0.4
          lerp3(DECK_DARK, DECK_LIGHT, clamp01(tone), c)
          const scarf = Math.abs(frac((s + 3.3) / 7.3) - 0.5) > 0.5 - SEAM_U / 7.3
          const seam = Math.max(smooth(SEAM_U * 1.6, SEAM_U * 0.6, Math.abs(inside - MARGIN_U)), scarf ? 0.8 : 0)
          lerp3(c, CAULK, seam * 0.85, c)
        } else {
          const segF = (s + off) / BUTT_U
          const seg = Math.floor(segF)
          const w = segF - seg
          const plank = plankTone[j * segs + seg - segMin]!
          const lines = sinTab[Math.floor(frac(lineBase + rowShift[px]!) * SIN_N)]!
          const tone = 0.3 + plank * 0.34 + (row[px]! - 0.5) * 0.42 + (lines - 0.5) * 0.06
          lerp3(DECK_DARK, DECK_LIGHT, clamp01(tone), c)
          const butt = Math.min(w, 1 - w) * BUTT_U
          const seam = butt < SEAM_U * 0.9 ? Math.max(seamK, smooth(SEAM_U * 0.9, SEAM_U * 0.3, butt) * 0.9) : seamK
          if (seam > 0) lerp3(c, CAULK, seam * 0.9, c)
          const bs = (frac(s / BEAM_U) - 0.5) * BEAM_U
          const bn = butt - 0.14
          const dot2 = Math.min(bs * bs + nailV * nailV, bn * bn + buttNailV * buttNailV)
          if (dot2 < NAIL2) lerp3(c, nailDark, smooth(0.07, 0.035, Math.sqrt(dot2)) * 0.75, c)
        }
        const gxf = px / G
        const gx0 = Math.floor(gxf)
        const fx = gxf - gx0
        const i0 = gy0 * gw + gx0
        const blot = (blotGrid[i0]! * (1 - fx) + blotGrid[i0 + 1]! * fx) * (1 - fy) + (blotGrid[i0 + gw]! * (1 - fx) + blotGrid[i0 + gw + 1]! * fx) * fy
        const damp = (1 - smooth(0, 1.6, inside)) * 0.16 + (1 - smooth(0, 0.35, inside)) * 0.12
        const m = 1 + worn - damp + blot
        c[0] *= m
        c[1] *= m * (1 - damp * 0.05)
        c[2] *= m * (1 - damp * 0.12)
      } else {
        const x = clamp01(-inside / bw)
        const bend = (x - 0.5) * 2
        const facing = Math.sign(t) * (light.t / lh)
        const lit = 0.72 + 0.32 * bend * facing + 0.3 * Math.exp(-(bend * bend) / 0.12)
        const grain = 0.8 + railGrain[px]! * 0.4
        const scarf = Math.abs(frac((s + 1.7) / 8.9) - 0.5) > 0.5 - 0.03 / 8.9 ? 0.6 : 0
        const dark = 1 - smooth(0.78, 1, x) * 0.45
        c[0] = RAIL_WOOD[0] * grain * lit
        c[1] = RAIL_WOOD[1] * grain * lit
        c[2] = RAIL_WOOD[2] * grain * lit
        if (scarf > 0) lerp3(c, CAULK, scarf, c)
        c[0] *= dark
        c[1] *= dark
        c[2] *= dark
      }
      const o = (py * W + px) * 4
      data[o] = c[0] < 0 ? 0 : c[0] > 1 ? 255 : Math.round(c[0] * 255)
      data[o + 1] = c[1] < 0 ? 0 : c[1] > 1 ? 255 : Math.round(c[1] * 255)
      data[o + 2] = c[2] < 0 ? 0 : c[2] > 1 ? 255 : Math.round(c[2] * 255)
      data[o + 3] = Math.round(clamp01(rail * DECK_PPU + 0.5) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.save()
  ctx.setTransform(DECK_PPU, 0, 0, DECK_PPU, -f.s0 * DECK_PPU, f.t1 * DECK_PPU)
  knots(ctx, cfg, seed)
  dressDeck(ctx, cfg, seed, light)
  ctx.restore()
}

/** 木板上零星的木节：深色的椭圆，外圈一层木纹绕着它 */
function knots(ctx: CanvasRenderingContext2D, cfg: ShipConfig, seed: number): void {
  const h = cfg.hull
  const rng = new Rng(seed ^ 0x6b07)
  const count = Math.round(h.lengthU * h.beamU * 0.045)
  for (let k = 0; k < count; k++) {
    const s = rng.next() * h.lengthU
    const j = Math.floor(rng.next() * (h.beamU / PLANK_U))
    const t = -h.beamU / 2 + (j + 0.5) * PLANK_U
    if (Math.abs(t) > halfBeamAt(h, s) - MARGIN_U - 0.2) continue
    const r = 0.05 + rng.next() * 0.07
    const g = ctx.createRadialGradient(s, t, 0, s, t, r * 2.2)
    g.addColorStop(0, 'rgba(59,51,46,0.85)')
    g.addColorStop(0.45, 'rgba(94,79,68,0.45)')
    g.addColorStop(1, 'rgba(94,79,68,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(s, t, r * 2.6, r * 1.3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

const IRON = '#1c1b1f'
const IRON_LIT = '#4b4a52'
const TIMBER = '#846d5b'
const TIMBER_LIT = '#bca184'
const TIMBER_DARK = '#473c36'
const ROPE = '#e6d7b4'
const ROPE_DARK = '#a2957e'
const TAR_ROPE = '#2a2019'

/** 投影：往背光的方向偏一点的半透明黑 */
function dropShadow(ctx: CanvasRenderingContext2D, light: { s: number; t: number }, depth: number, draw: () => void): void {
  const lh = Math.hypot(light.s, light.t) || 1
  ctx.save()
  ctx.translate((-light.s / lh) * depth, (-light.t / lh) * depth)
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.strokeStyle = 'rgba(0,0,0,0.32)'
  draw()
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** 舱口格栅：木框高出甲板，里面是一格格的方孔 */
function grating(ctx: CanvasRenderingContext2D, s: number, len: number, wid: number, light: { s: number; t: number }): void {
  const x = s - len / 2
  const y = -wid / 2
  dropShadow(ctx, light, 0.14, () => {
    roundRect(ctx, x, y, len, wid, 0.12)
    ctx.fill()
  })
  roundRect(ctx, x, y, len, wid, 0.12)
  ctx.fillStyle = TIMBER
  ctx.fill()
  const inset = 0.24
  ctx.fillStyle = '#140e0a'
  ctx.fillRect(x + inset, y + inset, len - inset * 2, wid - inset * 2)
  ctx.strokeStyle = '#9c836c'
  ctx.lineWidth = 0.09
  for (let u = x + inset + 0.2; u < x + len - inset; u += 0.28) {
    ctx.beginPath()
    ctx.moveTo(u, y + inset)
    ctx.lineTo(u, y + wid - inset)
    ctx.stroke()
  }
  for (let v = y + inset + 0.2; v < y + wid - inset; v += 0.28) {
    ctx.beginPath()
    ctx.moveTo(x + inset, v)
    ctx.lineTo(x + len - inset, v)
    ctx.stroke()
  }
  ctx.strokeStyle = TIMBER_LIT
  ctx.lineWidth = 0.05
  ctx.beginPath()
  ctx.moveTo(x + 0.05, y + wid - 0.05)
  ctx.lineTo(x + 0.05, y + 0.05)
  ctx.lineTo(x + len - 0.05, y + 0.05)
  ctx.stroke()
}

/** 甲板上盘着的一卷绳：平放的螺旋 */
function coil(ctx: CanvasRenderingContext2D, s: number, t: number, r: number, color: string, dark: string): void {
  ctx.lineCap = 'round'
  for (const [w, col] of [
    [0.1, dark],
    [0.065, color],
  ] as const) {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.beginPath()
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2 * 3.4
      const rr = r * (0.25 + (0.75 * k) / 64)
      const x = s + Math.cos(a) * rr
      const y = t + Math.sin(a) * rr
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/** 一段粗缆绳：沿着几个点的曲线，外面一圈深色、里面一道道绞纹 */
function cable(ctx: CanvasRenderingContext2D, pts: readonly Point[], width: number): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const path = (): void => {
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i]!.x + pts[i + 1]!.x) / 2
      const my = (pts[i]!.y + pts[i + 1]!.y) / 2
      ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y)
  }
  ctx.strokeStyle = TAR_ROPE
  ctx.lineWidth = width
  path()
  ctx.stroke()
  ctx.strokeStyle = '#76695c'
  ctx.lineWidth = width * 0.55
  ctx.setLineDash([width * 0.5, width * 0.45])
  path()
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * 甲板上的陈设，按格画（x 沿船长、y 往右舷）：主舱口与前舱口的格栅、桅杆脚的楔圈与带缆桩架、盘绳、
 * 船尾的舵轮、罗经柜与天窗、船头的缆桩与锚链、舷墙内侧的系缆栓；舷外是链板与复滑车、炮口、吊着的锚和船尾灯架
 */
function dressDeck(ctx: CanvasRenderingContext2D, cfg: ShipConfig, seed: number, light: { s: number; t: number }): void {
  const h = cfg.hull
  const rng = new Rng(seed ^ 0x2c1f)
  const masts = rigOf(cfg)
  const bw = h.bulwarkU
  const L = h.lengthU
  const railAt = (s: number): number => halfBeamAt(h, s) + bw
  for (const g of hatchesOf(h)) grating(ctx, g.s, g.len, g.wid, light)
  ctx.lineCap = 'round'
  for (const m of masts) {
    dropShadow(ctx, light, 0.08, () => {
      ctx.beginPath()
      ctx.arc(m.s, 0, 0.8, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = TIMBER
    ctx.beginPath()
    ctx.arc(m.s, 0, 0.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = TIMBER_DARK
    ctx.lineWidth = 0.035
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(m.s + Math.cos(a) * 0.5, Math.sin(a) * 0.5)
      ctx.lineTo(m.s + Math.cos(a) * 0.78, Math.sin(a) * 0.78)
      ctx.stroke()
    }
    ctx.fillStyle = '#1b120c'
    ctx.beginPath()
    ctx.arc(m.s, 0, 0.52, 0, Math.PI * 2)
    ctx.fill()
    const fx = m.s - 1.25
    dropShadow(ctx, light, 0.1, () => ctx.fillRect(fx - 0.09, -1.05, 0.18, 2.1))
    ctx.fillStyle = TIMBER_LIT
    ctx.fillRect(fx - 0.09, -1.05, 0.18, 2.1)
    for (let k = 0; k < 6; k++) {
      const y = -0.9 + (k * 1.8) / 5
      ctx.fillStyle = '#d8c7a0'
      ctx.beginPath()
      ctx.arc(fx, y, 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
    coil(ctx, fx - 0.55, -0.62, 0.36, ROPE, ROPE_DARK)
    coil(ctx, fx - 0.5, 0.66, 0.32, ROPE, ROPE_DARK)
    for (const side of [-1, 1]) {
      const edge = halfBeamAt(h, m.s) - 0.18
      ctx.fillStyle = TIMBER_LIT
      ctx.fillRect(m.s - 1.7, side * edge - 0.06, 3.4, 0.12)
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = '#d8c7a0'
        ctx.beginPath()
        ctx.arc(m.s - 1.55 + k * 0.39, side * edge, 0.045, 0, Math.PI * 2)
        ctx.fill()
      }
      if (rng.next() < 0.7) coil(ctx, m.s + (rng.next() * 2 - 1) * 1.2, side * (edge - 0.62), 0.3, ROPE, ROPE_DARK)
    }
  }
  // 船尾：舵轮、罗经柜、天窗
  const helm = helmOf(h)
  dropShadow(ctx, light, 0.12, () => ctx.fillRect(helm - 0.3, -0.35, 0.6, 0.7))
  ctx.fillStyle = TIMBER
  ctx.fillRect(helm - 0.3, -0.35, 0.6, 0.7)
  ctx.fillStyle = TIMBER_DARK
  ctx.fillRect(helm - 0.07, -1.0, 0.14, 2.0)
  for (let k = 0; k < 8; k++) {
    const y = -1.0 + (k * 2) / 7
    ctx.fillStyle = TIMBER_LIT
    ctx.beginPath()
    ctx.arc(helm, y, 0.075, 0, Math.PI * 2)
    ctx.fill()
  }
  const bin = helm + 1.25
  dropShadow(ctx, light, 0.08, () => {
    roundRect(ctx, bin - 0.3, -0.3, 0.6, 0.6, 0.12)
    ctx.fill()
  })
  roundRect(ctx, bin - 0.3, -0.3, 0.6, 0.6, 0.12)
  ctx.fillStyle = TIMBER
  ctx.fill()
  const brass = ctx.createRadialGradient(bin - 0.08, -0.08, 0.02, bin, 0, 0.24)
  brass.addColorStop(0, '#f3dc94')
  brass.addColorStop(0.6, '#a9812f')
  brass.addColorStop(1, '#5a4216')
  ctx.fillStyle = brass
  ctx.beginPath()
  ctx.arc(bin, 0, 0.22, 0, Math.PI * 2)
  ctx.fill()
  const sky = skylightOf(h).s
  dropShadow(ctx, light, 0.12, () => ctx.fillRect(sky - 0.8, -0.6, 1.6, 1.2))
  ctx.fillStyle = TIMBER
  ctx.fillRect(sky - 0.8, -0.6, 1.6, 1.2)
  const glass = ctx.createRadialGradient(sky, 0, 0.05, sky, 0, 0.8)
  glass.addColorStop(0, '#e4eef0')
  glass.addColorStop(1, '#93a9ae')
  ctx.fillStyle = glass
  ctx.fillRect(sky - 0.66, -0.46, 1.32, 0.92)
  ctx.strokeStyle = TIMBER_DARK
  ctx.lineWidth = 0.08
  ctx.beginPath()
  ctx.moveTo(sky, -0.46)
  ctx.lineTo(sky, 0.46)
  ctx.moveTo(sky - 0.66, 0)
  ctx.lineTo(sky + 0.66, 0)
  ctx.stroke()
  // 船头：缆桩、锚链、第一斜桅的根
  const bitts = L - h.bow * L * 0.3
  for (const side of [-1, 1]) {
    const hawse = L - 2.2
    const hw = halfBeamAt(h, hawse) - 0.35
    cable(ctx, [
      { x: hawse, y: side * hw },
      { x: hawse - 1.4, y: side * (hw - 0.4) },
      { x: bitts + 0.6, y: side * 1.3 },
      { x: bitts, y: side * 1.0 },
    ], 0.2)
    dropShadow(ctx, light, 0.12, () => ctx.fillRect(bitts - 0.22, side * 1.0 - 0.22, 0.44, 0.44))
    ctx.fillStyle = TIMBER
    ctx.fillRect(bitts - 0.22, side * 1.0 - 0.22, 0.44, 0.44)
    ctx.fillStyle = TIMBER_LIT
    ctx.fillRect(bitts - 0.22, side * 1.0 - 0.22, 0.44, 0.1)
    coil(ctx, bitts - 1.3, side * 1.4, 0.42, '#3a2c20', '#1c150f')
  }
  ctx.fillStyle = TIMBER
  ctx.fillRect(bitts - 0.09, -1.0, 0.18, 2.0)
  const sprit = L - 3
  dropShadow(ctx, light, 0.1, () => ctx.fillRect(sprit, -0.3, L + 0.6 - sprit, 0.6))
  const spar = ctx.createLinearGradient(0, -0.3, 0, 0.3)
  spar.addColorStop(0, TIMBER_LIT)
  spar.addColorStop(1, TIMBER_DARK)
  ctx.fillStyle = spar
  ctx.fillRect(sprit, -0.28, L + 0.6 - sprit, 0.56)
  // 舷外：链板与复滑车、炮口、锚、船尾灯架
  for (const m of masts) {
    for (const side of [-1, 1]) {
      const r = railAt(m.s)
      ctx.fillStyle = TIMBER_DARK
      ctx.fillRect(m.s - 1.7, side > 0 ? r - 0.02 : -r - 0.43, 3.4, 0.45)
      ctx.fillStyle = TIMBER
      ctx.fillRect(m.s - 1.7, side > 0 ? r - 0.02 : -r - 0.43, 3.4, 0.2 * (side > 0 ? 1 : 1))
      for (let k = 0; k < 5; k++) {
        const x = m.s - 1.4 + k * 0.7
        ctx.fillStyle = '#120c08'
        ctx.beginPath()
        ctx.arc(x, side * (r + 0.2), 0.15, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#877461'
        ctx.lineWidth = 0.05
        ctx.stroke()
      }
    }
  }
  const guns: number[] = []
  for (let s = h.stern * L + 1.5; s < L - h.bow * L * 0.55; s += 4.6) if (masts.every((m) => Math.abs(m.s - s) > 2.2)) guns.push(s)
  // 炮从舷墙的炮门里探出头：炮口一圈加厚，炮膛黑洞洞的
  for (const s of guns) {
    for (const side of [-1, 1]) {
      const r = railAt(s)
      const y0 = side * (r - 0.02)
      const y1 = side * (r + 0.55)
      const lo = Math.min(y0, y1)
      const len = Math.abs(y1 - y0)
      dropShadow(ctx, light, 0.07, () => ctx.fillRect(s - 0.17, lo, 0.34, len))
      const barrel = ctx.createLinearGradient(s - 0.16, 0, s + 0.16, 0)
      barrel.addColorStop(0, '#0d0d10')
      barrel.addColorStop(0.35, IRON_LIT)
      barrel.addColorStop(1, '#101014')
      ctx.fillStyle = barrel
      ctx.fillRect(s - 0.15, lo, 0.3, len)
      ctx.fillRect(s - 0.19, side > 0 ? y1 - 0.12 : y1, 0.38, 0.12)
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      ctx.ellipse(s, y1, 0.09, 0.05, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 挂在船头两舷的锚：锚杆顺着船舷，前头是锚环，后头两只锚爪
  for (const side of [-1, 1]) {
    const s = L - h.bow * L * 0.45
    const r = railAt(s) + 0.3
    const along = (halfBeamAt(h, s + 0.5) - halfBeamAt(h, s - 0.5)) * side
    const ang = Math.atan2(along, 1)
    ctx.save()
    ctx.translate(s, side * r)
    ctx.rotate(ang)
    ctx.strokeStyle = IRON
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.14
    ctx.beginPath()
    ctx.moveTo(1.1, 0)
    ctx.lineTo(-1.0, 0)
    ctx.stroke()
    ctx.lineWidth = 0.09
    ctx.beginPath()
    ctx.arc(1.25, 0, 0.15, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 0.13
    ctx.beginPath()
    ctx.moveTo(-1.0, 0)
    ctx.quadraticCurveTo(-1.1, 0.45, -0.6, 0.55)
    ctx.moveTo(-1.0, 0)
    ctx.quadraticCurveTo(-1.1, -0.45, -0.6, -0.55)
    ctx.stroke()
    ctx.strokeStyle = IRON_LIT
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.moveTo(1.0, -0.04)
    ctx.lineTo(-0.9, -0.04)
    ctx.stroke()
    ctx.restore()
  }
  const stern = -bulgeU(h) - bw
  ctx.fillStyle = IRON
  ctx.fillRect(stern - 0.55, -0.07, 0.6, 0.14)
  // 甲板上的小玻璃棱镜：把光透进下层舱
  for (let k = 0; k < 7; k++) {
    const s = h.stern * L + 2 + rng.next() * (L * 0.62)
    const t = (rng.next() * 2 - 1) * h.beamU * 0.28
    if (masts.some((m) => Math.hypot(m.s - s, t) < 2.2) || !onDeck(cfg, s, t)) continue
    const g = ctx.createRadialGradient(s, t, 0.01, s, t, 0.12)
    g.addColorStop(0, 'rgba(236,246,246,0.95)')
    g.addColorStop(1, 'rgba(150,185,190,0.4)')
    ctx.fillStyle = g
    ctx.beginPath()
    for (let e = 0; e < 6; e++) {
      const a = (e / 6) * Math.PI * 2
      if (e === 0) ctx.moveTo(s + Math.cos(a) * 0.12, t + Math.sin(a) * 0.12)
      else ctx.lineTo(s + Math.cos(a) * 0.12, t + Math.sin(a) * 0.12)
    }
    ctx.closePath()
    ctx.fill()
  }
}

/** 湿甲板贴图每格多少像素：只是柔和的水光 */
export const WET_PPU = 16

/**
 * 一侧舷墙里的湿甲板：浪花打上来的水顺着倾斜流到低的一侧，贴着舷墙一窄条颜色变深、一片片积水映着天光，越靠舷墙越湿。
 * 贴图只盖这一侧：船长方向与甲板贴图对齐，横向从中线到这一侧的外沿；side 为 1 是右舷
 */
export function paintWet(ctx: CanvasRenderingContext2D, cfg: ShipConfig, side: number): void {
  const h = cfg.hull
  const f = deckFrame(cfg)
  const W = Math.ceil((f.s1 - f.s0) * WET_PPU)
  const H = Math.ceil(f.t1 * WET_PPU)
  const img = ctx.createImageData(W, H)
  const band = 1.8
  for (let px = 0; px < W; px++) {
    const s = f.s0 + (px + 0.5) / WET_PPU
    const b = halfBeamAt(h, s)
    if (b <= 0) continue
    const reach = band * (0.75 + 0.25 * valueNoise(s * 0.7, side * 3, 97))
    for (let py = 0; py < H; py++) {
      const at = side > 0 ? (py + 0.5) / WET_PPU : f.t1 - (py + 0.5) / WET_PPU
      const inside = b - at
      if (inside <= 0 || inside > reach) continue
      const k = (1 - inside / reach) ** 1.3
      const pool = valueNoise(s * 1.4, at * 1.4, 131)
      const glint = smooth(0.84, 0.97, valueNoise(s * 1.8, at * 6, 137)) * k * 0.7
      const o = (py * W + px) * 4
      img.data[o] = Math.round(18 + 190 * glint)
      img.data[o + 1] = Math.round(24 + 196 * glint)
      img.data[o + 2] = Math.round(30 + 200 * glint)
      img.data[o + 3] = Math.round(Math.min(1, k * (0.35 + 0.4 * pool) + glint * 0.4) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

// ————————————————————————————— 桅杆、帆桁与索具 —————————————————————————————

/** 船此刻的姿态：横摇右舷往下为正、纵摇船头往下为正，弧度 */
export interface Pose {
  readonly roll: number
  readonly pitch: number
}

/** 船上 (s, t) 格、离甲板 hM 米高的一点，船倾斜后从正上方看落在地图上哪里：越高的东西随船倾甩得越远 */
export function lifted(deck: Deck, mpu: number, pose: Pose, s: number, t: number, hM: number): Point {
  const up = hM / mpu
  return deckPoint(deck, s + up * Math.sin(pose.pitch), t + up * Math.sin(pose.roll))
}

/** 画索具用到的笔：Phaser 的 Graphics 就是 */
export interface Pen {
  lineStyle(width: number, color: number, alpha?: number): unknown
  fillStyle(color: number, alpha?: number): unknown
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown
  fillPoints(points: Point[], closeShape?: boolean): unknown
  fillCircle(x: number, y: number, r: number): unknown
  beginPath(): unknown
  moveTo(x: number, y: number): unknown
  lineTo(x: number, y: number): unknown
  strokePath(): unknown
}

const MAST_WOOD = 0x7d6957
const MAST_LIT = 0xc5ab8d
const SPAR_WOOD = 0x605146
const SAIL = 0xc9bc9f
const SAIL_SHADE = 0x8f8470
const RIGGING = 0x17110c
/** 帆与收起的帆卷压在人头顶，半透明才看得见底下的人 */
const SAIL_ALPHA = 0.55
const FURL_ALPHA = 0.72
const MAST_ALPHA = 0.8

/** 帆鼓向下风：一条边往下风偏出 belly 格，中间偏得最多 */
function bellied(a: Point, b: Point, belly: Point, n: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const k = Math.sin(Math.PI * u)
    out.push({ x: a.x + (b.x - a.x) * u + belly.x * k, y: a.y + (b.y - a.y) * u + belly.y * k })
  }
  return out
}

/**
 * 索具：桅杆、桅楼、帆桁上收拢的横帆、侧支索与前后支索、首斜桅与三角帆、最后面那根桅杆的纵帆、主桅顶的长旗。
 * 每一点都按高度随船的横摇、纵摇甩开，所以船一倾，桅杆看上去就往低的一侧斜，纵帆从一条线张成一片
 */
export function drawRig(g: Pen, cfg: ShipConfig, deck: Deck, pose: Pose, time: number, wind: { s: number; t: number }): void {
  const h = cfg.hull
  const mpu = cfg.meterPerU
  const P = (s: number, t: number, hm: number): Point => lifted(deck, mpu, pose, s, t, hm)
  const masts = rigOf(cfg)
  const L = h.lengthU
  const line = (a: Point, b: Point): void => {
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
  const lw = Math.hypot(wind.s, wind.t) || 1
  const lee = { s: wind.s / lw, t: wind.t / lw }
  const leeW = (u: number): Point => ({ x: (deck.bx * lee.s + deck.sx * lee.t) * u * UNIT, y: (deck.by * lee.s + deck.sy * lee.t) * u * UNIT })
  const fore = masts[masts.length - 1]!
  const main = masts[masts.length - 2]!
  const aft = masts[0]!
  const { sprit, boom } = spritOf(h)
  // 三角帆：从前桅顶斜拉到首斜桅与第一斜桅的端头
  for (const [head, tack, belly] of [
    [fore.height * 0.8, boom, 0.6],
    [fore.top + 1, sprit, 0.45],
  ] as const) {
    const a = P(fore.s + 0.4, 0, head)
    const b = P(tack.s, 0, tack.h)
    const c = P(fore.s + 2.2, 0, 2.2)
    const foot = bellied(c, b, leeW(belly * 0.55), 6)
    const leech = bellied(a, c, leeW(belly), 8)
    g.fillStyle(SAIL_SHADE, SAIL_ALPHA)
    g.fillPoints([a, b, ...foot.slice().reverse(), ...leech.slice(1, -1).reverse()], true)
    g.fillStyle(SAIL, SAIL_ALPHA)
    g.fillPoints([a, b, ...bellied(b, a, leeW(belly * 0.35), 6).slice(1)], true)
    g.lineStyle(0.05 * UNIT, RIGGING, 0.7)
    line(a, b)
  }
  // 最后面那根桅杆的纵帆：斜桁与帆杠之间
  const gaff0 = P(aft.s - 0.3, 0, aft.height * 0.62)
  const gaff1 = P(aft.s - 6.5, 0, aft.height * 0.8)
  const boom0 = P(aft.s - 0.3, 0, 2.4)
  const boom1 = P(aft.s - 8.6, 0, 2.7)
  g.fillStyle(SAIL_SHADE, SAIL_ALPHA)
  g.fillPoints([...bellied(gaff0, gaff1, leeW(0.25), 6), ...bellied(boom1, boom0, leeW(0.55), 6), ...bellied(boom0, gaff0, leeW(0.15), 3).slice(1, -1)], true)
  g.fillStyle(SAIL, SAIL_ALPHA)
  g.fillPoints([...bellied(gaff0, gaff1, leeW(0.25), 6), ...bellied(gaff1, boom1, leeW(0.45), 4).slice(1), ...bellied(boom1, boom0, leeW(0.3), 6).slice(1)], true)
  g.lineStyle(0.2 * UNIT, SPAR_WOOD, 1)
  line(gaff0, gaff1)
  line(boom0, boom1)
  // 侧支索：从舷外链板的复滑车拉到桅楼下
  g.lineStyle(0.05 * UNIT, RIGGING, 0.72)
  for (const m of masts) {
    for (const side of [-1, 1]) {
      const r = halfBeamAt(h, m.s) + h.bulwarkU + 0.2
      for (let k = 0; k < 5; k++) line(P(m.s - 1.4 + k * 0.7, side * r, 0.5), P(m.s, side * 0.3, m.top - 0.4))
      for (let k = 0; k < 2; k++) line(P(m.s - 0.4 + k * 0.6, side * 0.95, m.top), P(m.s, side * 0.18, m.height * 0.8))
    }
  }
  // 前后支索
  g.lineStyle(0.07 * UNIT, RIGGING, 0.8)
  for (let i = masts.length - 1; i > 0; i--) {
    const a = masts[i]!
    const b = masts[i - 1]!
    line(P(b.s, 0, b.top), P(a.s - 0.6, 0, 1.2))
    line(P(b.s, 0, b.height * 0.8), P(a.s, 0, a.top))
  }
  line(P(fore.s, 0, fore.top), P(L + 1, 0, 1.8))
  line(P(fore.s, 0, fore.height * 0.8), P(sprit.s, 0, sprit.h))
  // 首斜桅与第一斜桅
  const bs0 = P(L - 0.6, 0, 1.3)
  const bs1 = P(sprit.s, 0, sprit.h)
  const jb1 = P(boom.s, 0, boom.h)
  g.lineStyle(0.46 * UNIT, SPAR_WOOD, 1)
  line(bs0, bs1)
  g.lineStyle(0.26 * UNIT, SPAR_WOOD, 1)
  line(bs1, jb1)
  g.lineStyle(0.1 * UNIT, MAST_LIT, 0.8)
  line(bs0, bs1)
  g.lineStyle(0.04 * UNIT, RIGGING, 0.7)
  for (const side of [-1, 1]) line(P(L - 3, side * (halfBeamAt(h, L - 3) + h.bulwarkU), 0.6), P(sprit.s - 1.5, 0, sprit.h - 0.4))
  // 桅杆：下桅、上桅、顶桅一节比一节细
  for (const m of masts) {
    const segs = [
      [0, m.top, 0.46],
      [m.top, m.height * 0.8, 0.32],
      [m.height * 0.8, m.height, 0.2],
    ] as const
    for (const [h0, h1, w] of segs) {
      const a = P(m.s, 0, h0)
      const b = P(m.s, 0, h1)
      g.lineStyle(w * UNIT, MAST_WOOD, MAST_ALPHA)
      line(a, b)
      g.fillStyle(MAST_WOOD, MAST_ALPHA)
      g.fillCircle(b.x, b.y, (w * UNIT) / 2)
      g.lineStyle(w * 0.3 * UNIT, MAST_LIT, 0.7)
      const off = { x: SUN.x * w * 0.22 * UNIT, y: SUN.y * w * 0.22 * UNIT }
      g.lineBetween(a.x + off.x, a.y + off.y, b.x + off.x, b.y + off.y)
    }
    // 桅楼：前圆后平的平台
    const top: Point[] = []
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * Math.PI
      top.push(P(m.s + 0.15 + Math.cos(a) * 0.7, Math.sin(a) * 0.8, m.top))
    }
    top.push(P(m.s - 0.4, 0.8, m.top), P(m.s - 0.4, -0.8, m.top))
    g.fillStyle(0x5b4d42, 0.85)
    g.fillPoints(top, true)
    g.lineStyle(0.06 * UNIT, 0xbea386, 0.9)
    g.beginPath()
    g.moveTo(top[0]!.x, top[0]!.y)
    for (let k = 1; k < 11; k++) g.lineTo(top[k]!.x, top[k]!.y)
    g.strokePath()
    // 帆桁与收在上面的横帆，帆卷上每隔一段扎着束帆索
    for (const y of m.yards) {
      const a = P(m.s + 0.35, -y.half, y.h)
      const b = P(m.s + 0.35, y.half, y.h)
      g.lineStyle(0.17 * UNIT, SPAR_WOOD, MAST_ALPHA)
      line(a, b)
      const fa = P(m.s + 0.42, -y.half * 0.88, y.h - 0.15)
      const fb = P(m.s + 0.42, y.half * 0.88, y.h - 0.15)
      g.lineStyle(0.32 * UNIT, SAIL_SHADE, FURL_ALPHA)
      line(fa, fb)
      g.lineStyle(0.16 * UNIT, SAIL, FURL_ALPHA)
      g.lineBetween(fa.x + SUN.x * 0.05 * UNIT, fa.y + SUN.y * 0.05 * UNIT, fb.x + SUN.x * 0.05 * UNIT, fb.y + SUN.y * 0.05 * UNIT)
      g.lineStyle(0.05 * UNIT, 0x72685a, 0.8)
      const n = Math.max(2, Math.round(y.half / 1.3))
      for (let k = 1; k < n * 2; k++) {
        const u = -0.9 + (k / (n * 2)) * 1.8
        const c = P(m.s + 0.5, y.half * u, y.h - 0.15)
        const dx = deck.bx * 0.18 * UNIT
        const dy = deck.by * 0.18 * UNIT
        g.lineBetween(c.x - dx, c.y - dy, c.x + dx, c.y + dy)
      }
    }
  }
  // 主桅顶的燕尾旗顺风飘
  const truck = P(main.s, 0, main.height)
  const len = 1.9
  const dir = leeW(1)
  const nx = -dir.y / UNIT
  const ny = dir.x / UNIT
  const edge = (side: number): Point[] => {
    const out: Point[] = []
    for (let k = 0; k <= 8; k++) {
      const u = k / 8
      const wave = Math.sin(time * 6.5 - u * 4.5) * 0.22 * u
      const w = 0.3 * (1 - 0.35 * u) * side
      out.push({ x: truck.x + dir.x * len * u + nx * (wave + w) * UNIT, y: truck.y + dir.y * len * u + ny * (wave + w) * UNIT })
    }
    return out
  }
  const top = edge(1)
  const bottom = edge(-1)
  const notch = { x: (top[6]!.x + bottom[6]!.x) / 2, y: (top[6]!.y + bottom[6]!.y) / 2 }
  g.fillStyle(0x8e2a22, 0.95)
  g.fillPoints([...top, notch, ...bottom.reverse()], true)
  g.lineStyle(0.05 * UNIT, RIGGING, 0.9)
  g.lineBetween(truck.x, truck.y, top[0]!.x, top[0]!.y)
}

/** 一段离甲板 h0 到 h1 米高的杆子投在甲板上的影子：沿线取点，只画落在甲板上的那几截 */
function shadowRun(g: Pen, cfg: ShipConfig, deck: Deck, pose: Pose, sun: { s: number; t: number }, a: [number, number, number], b: [number, number, number]): void {
  const mpu = cfg.meterPerU
  const n = 14
  let open = false
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const s = a[0] + (b[0] - a[0]) * u
    const t = a[1] + (b[1] - a[1]) * u
    const up = (a[2] + (b[2] - a[2]) * u) / mpu
    const ss = s + up * (Math.sin(pose.pitch) + sun.s * SHADOW_PER_U)
    const tt = t + up * (Math.sin(pose.roll) + sun.t * SHADOW_PER_U)
    const on = onDeck(cfg, ss, tt)
    const p = deckPoint(deck, ss, tt)
    if (on && !open) {
      g.beginPath()
      g.moveTo(p.x, p.y)
      open = true
    } else if (on) g.lineTo(p.x, p.y)
    else if (open) {
      g.strokePath()
      open = false
    }
  }
  if (open) g.strokePath()
}

/** 桅杆、下帆桁与最后面那根桅杆的帆杠投在甲板上的影子：背着太阳拉长，船一摇影子也跟着摆 */
export function drawRigShadow(g: Pen, cfg: ShipConfig, deck: Deck, pose: Pose): void {
  const hs = Math.hypot(SUN.x, SUN.y)
  const away = { x: -SUN.x / hs, y: -SUN.y / hs }
  const sun = { s: away.x * deck.bx + away.y * deck.by, t: away.x * deck.sx + away.y * deck.sy }
  const masts = rigOf(cfg)
  for (const m of masts) {
    g.lineStyle(0.42 * UNIT, 0x000000, 0.2)
    shadowRun(g, cfg, deck, pose, sun, [m.s, 0, 0], [m.s, 0, m.height])
    const y = m.yards[0]!
    g.lineStyle(0.4 * UNIT, 0x000000, 0.14)
    shadowRun(g, cfg, deck, pose, sun, [m.s + 0.4, -y.half, y.h], [m.s + 0.4, y.half, y.h])
  }
  g.lineStyle(0.22 * UNIT, 0x000000, 0.14)
  shadowRun(g, cfg, deck, pose, sun, [masts[0]!.s - 0.3, 0, 2.4], [masts[0]!.s - 8.6, 0, 2.7])
}

// ————————————————————————————— 海面 —————————————————————————————

/**
 * 海面：浅海的松石绿，两层平铺的风浪贴图交错漂移，按正午的阳光打光，浪尖偶尔碎成白浪；海水相对船往船尾流。
 * 船壳：舷墙外露出的一圈船舷，抬高的一侧露得多、压低的一侧贴着水；水线上一道细白沫，船头推出的浪沿开尔文角往两边散开，
 * 船尾拖着翻白的尾流，船身在背着太阳的一侧投下影子。离船多远查甲板的距离场贴图
 */
export const SEA_FRAG = `
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
uniform sampler2D uWave;
uniform sampler2D uEdge;
uniform float uTime;
uniform vec4 uRect;
uniform float uUnit;
uniform vec3 uGrid;
uniform vec4 uShip;
uniform vec4 uHullA;
uniform vec4 uHullB;
uniform vec4 uHullC;
uniform vec4 uTilt;
uniform vec4 uWind;
uniform vec3 uSun;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float edgeAt(vec2 world) {
  vec2 uv = world / uGrid.xy;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 8.0;
  vec4 e = texture2D(uEdge, vec2(uv.x, 1.0 - uv.y));
  return (e.r * 65280.0 + e.g * 255.0) / 65535.0 * ${EDGE_SPAN_U.toFixed(1)} + ${EDGE_MIN_U.toFixed(1)} - uHullC.x;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  float d = edgeAt(world);
  if (d < -0.12) {
    gl_FragColor = vec4(0.06, 0.045, 0.035, 1.0);
    return;
  }
  vec2 wu = world / uUnit;
  vec2 bow = uShip.zw;
  vec2 stb = vec2(-bow.y, bow.x);
  vec2 rel = (world - uShip.xy) / uUnit;
  vec2 p = vec2(dot(rel, bow), dot(rel, stb));
  float speed = uHullC.z;
  vec2 q = wu + bow * speed * uTime;
  vec2 wind = uWind.xy;
  vec2 q1 = q - wind * 0.7 * uTime;
  vec4 w1 = texture2D(uWave, vec2(q1.x, -q1.y) / 16.0);
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  vec2 q2 = turn * (q - wind * 0.4 * uTime);
  vec4 w2 = texture2D(uWave, vec2(q2.x, -q2.y) / 6.5 + vec2(0.31, 0.17));
  vec2 slope = (w1.rg - 0.5) * 0.42 + ((w2.rg - 0.5) * turn) * 0.24;
  vec3 n = normalize(vec3(-slope, 1.0));
  float hgt = w1.b * 0.65 + w2.b * 0.35;
  vec3 sun = uSun;
  float diff = max(dot(n, sun), 0.0);
  float gust = vnoise(wu * 0.04 + vec2(uTime * 0.02, -uTime * 0.013));
  vec3 col = mix(vec3(0.02, 0.42, 0.42), vec3(0.15, 0.53, 0.53), clamp(hgt * 0.7 + (diff - sun.z) * 2.2 - 0.12, 0.0, 1.0));
  float tilt = length(slope);
  vec2 rdir = -slope / max(tilt, 0.0001);
  float toward = dot(rdir, normalize(sun.xy)) * 0.5 + 0.5;
  vec3 sky = mix(vec3(0.52, 0.72, 0.86), vec3(1.0, 0.97, 0.88), pow(toward, 5.0));
  col = mix(col, sky, clamp(tilt * (0.9 + 0.6 * gust), 0.0, 0.28));
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(r, sun), 0.0), 140.0) * 0.8;
  col *= 0.88 + 0.22 * gust;
  float cap = smoothstep(0.9, 1.0, hgt + (vnoise(q * 0.18 + vec2(0.0, uTime * 0.05)) - 0.5) * 0.28) * (0.25 + 0.3 * gust);
  vec2 across = vec2(-wind.y, wind.x);
  float lane = smoothstep(0.62, 0.95, vnoise(vec2(dot(q, wind) * 0.035, dot(q, across) * 0.55))) * smoothstep(0.35, 0.8, vnoise(q * 0.09 + 7.0));
  col = mix(col, vec3(0.55, 0.78, 0.78), lane * 0.12);

  vec2 nw = normalize(rel);
  if (d < 2.5) {
    float e = uGrid.z;
    vec2 gr = vec2(edgeAt(world + vec2(e, 0.0)) - edgeAt(world - vec2(e, 0.0)), edgeAt(world + vec2(0.0, e)) - edgeAt(world - vec2(0.0, e)));
    nw = gr / max(length(gr), 0.0001);
  }
  vec2 nl = vec2(dot(nw, bow), dot(nw, stb));
  float lean = -(nl.y * uTilt.x + nl.x * uTilt.y);
  float band = clamp(uHullC.w + uHullC.y * lean, 0.04, uHullC.w + uHullC.y * 0.4);
  float dw = d - band;
  float lenS = uHullA.x;
  float bowK = smoothstep(lenS - uHullA.z * 0.9, lenS, p.x);
  float flowS = p.x + speed * uTime;
  float streak = vnoise(vec2(flowS * 0.55, p.y * 3.2)) * 0.65 + vnoise(vec2(flowS * 1.7, p.y * 7.0)) * 0.35;
  float waterline = 1.0 - smoothstep(0.0, 0.1, abs(dw));
  float wash = (1.0 - smoothstep(0.0, 0.25 + 0.75 * bowK + 0.35 * streak, dw)) * smoothstep(0.45, 0.85, streak + 0.2 * bowK);
  float hullFoam = max(waterline * 0.45, wash * (0.3 + 0.35 * bowK)) * step(-0.1, dw);
  float shoulder = lenS - uHullA.z;
  float along = shoulder - p.x;
  float armT = uHullA.y * 0.5 + uHullC.x + max(along, 0.0) * 0.36;
  float armN = vnoise(vec2(flowS * 0.8, p.y * 1.1));
  float arm = exp(-abs(abs(p.y) - armT) / (0.3 + max(along, 0.0) * 0.035)) * smoothstep(0.0, 5.0, along) * exp(-max(along, 0.0) / 40.0) * smoothstep(0.25, 0.75, armN) * 0.6;
  float endS = -uHullB.w - uHullC.x;
  float behind = endS - p.x;
  float wakeW = uHullB.z * (0.45 + 0.03 * max(behind, 0.0));
  float inWake = (1.0 - smoothstep(wakeW * 0.3, wakeW, abs(p.y))) * smoothstep(-0.5, 0.5, behind);
  float wakeN = vnoise(vec2(flowS * 0.5, p.y * 1.8)) * 0.55 + vnoise(vec2(flowS * 1.5, p.y * 4.5)) * 0.45;
  float wake = inWake * exp(-max(behind, 0.0) / 12.0) * smoothstep(0.6, 0.9, wakeN + 0.25 * exp(-max(behind, 0.0) / 3.0)) * 0.6;
  col = mix(col, vec3(0.17, 0.55, 0.54), inWake * exp(-max(behind, 0.0) / 18.0) * 0.4);

  float sd = edgeAt(world - uWind.zw);
  float shade = 1.0 - smoothstep(-0.3, 1.2, sd);
  col *= 1.0 - 0.4 * shade;
  float foam = clamp(max(max(hullFoam, arm), max(wake, cap)), 0.0, 1.0);
  vec3 foamCol = vec3(0.92, 0.96, 0.95) * (0.7 + 0.35 * diff) * (1.0 - 0.35 * shade);
  col = mix(col, foamCol, foam);

  if (d < band + 0.05) {
    float y = clamp(d / max(band, 0.02), 0.0, 1.0);
    vec3 hull = vec3(0.075, 0.058, 0.05);
    hull = mix(hull, vec3(0.46, 0.33, 0.13), smoothstep(0.08, 0.13, y) * (1.0 - smoothstep(0.34, 0.39, y)));
    hull *= 0.84 + 0.16 * step(0.5, fract(y * 7.0 + 0.25));
    hull = mix(hull, vec3(0.045, 0.085, 0.068), smoothstep(0.72, 1.0, y));
    float face = dot(nw, normalize(sun.xy));
    hull *= 0.62 + 0.6 * max(face, 0.0);
    col = mix(col, hull, 1.0 - smoothstep(band - 0.02, band + 0.03, d));
  }
  gl_FragColor = vec4(col, 1.0);
}
`
