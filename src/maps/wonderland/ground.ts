import { SUN } from '../../data/light.ts'
import { GROUND_PPU } from '../../data/texel.ts'
import { FRAME_U } from '../../util/units.ts'
import { cellNearest, fbm, valueNoise } from '../../util/noise.ts'
import { clamp01, hitOf, LIFT_U, makeGrids, sampleGrid, sightZ, smooth, thingsOf } from './things.ts'
import type { Grids, Hit, Surf, Thing } from './things'
import type { WonderPlan } from './layout'
import type { WonderlandConfig } from '../../types/maps'

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: WonderlandConfig
  readonly plan: WonderPlan
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly rect: PixelRect }

/** 画好的一块：地面一层（不透明）与立着的东西一层（带透明度），像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly rect: PixelRect
  readonly ground: Uint8ClampedArray<ArrayBuffer>
  readonly occ: Uint8ClampedArray<ArrayBuffer>
}

/** 地面与立着的东西都铺满方框，按地图贴图的细度画 */
export function textureSize(): { w: number; h: number } {
  const n = Math.round(FRAME_U * GROUND_PPU)
  return { w: n, h: n }
}

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 影子与遮蔽按这么细的格子算，格 */
const SHADE_U = 1 / 8
/** 往太阳那边找挡光的东西每步多远，格 */
const MARCH_U = 0.08
/** 立着的东西按这么大（格）的格子分桶：画一个像素只看它那一桶 */
const BUCKET_U = 1
/** 一个像素在立着的东西的边上就多采几次：每个方向几次 */
const AA = 2

const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const
const LXY = Math.hypot(SUN.x, SUN.y)
const TO_SUN = { x: SUN.x / LXY, y: SUN.y / LXY } as const
/** 往太阳那边走一米，光线升高多少米 */
const RISE = SUN.z / LXY
/** 看过来的方向：画面上抬起的东西是从南边斜上方看的 */
const VL = Math.hypot(0, LIFT_U, 1)
const V = { x: 0, y: LIFT_U / VL, z: 1 / VL } as const
const HL = Math.hypot(L.x + V.x, L.y + V.y, L.z + V.z)
const HV = { x: (L.x + V.x) / HL, y: (L.y + V.y) / HL, z: (L.z + V.z) / HL } as const

/** 黄昏的光：低低的太阳是暖金色的，天光是蓝紫的，草地反上来一点绿 */
const SUN_C = [1.22, 1.0, 0.76] as const
const SKY_C = [0.4, 0.4, 0.62] as const
/** 从看的那一边补上的一点散射光：朝南的侧面不至于黑成一片 */
const FILL_C = [0.2, 0.17, 0.2] as const
const BOUNCE_C = [0.16, 0.2, 0.13] as const
/** 烛火的光：暖橙色，照多远（格） */
const CANDLE_C = [1.0, 0.62, 0.3] as const
const CANDLE_U = 2.2

/** 画之前一次算好的：花园里立着的东西与它们的分桶，各处的高，地上的影子与遮蔽，烛火在哪 */
export interface Prepared {
  readonly grids: Grids
  readonly things: readonly Thing[]
  readonly buckets: readonly (readonly number[])[]
  readonly bcols: number
  readonly sn: number
  readonly height: Float32Array
  readonly shadow: Float32Array
  readonly ao: Float32Array
  readonly candles: readonly { readonly x: number; readonly y: number; readonly z: number }[]
  readonly mpu: number
  /** 最高的东西多高，米：往太阳那边的光线高过它就不会再被挡 */
  readonly top: number
}

function gridAt(p: Prepared, a: Float32Array, x: number, y: number): number {
  const u = Math.min(p.sn - 1.001, Math.max(0, x / SHADE_U - 0.5))
  const v = Math.min(p.sn - 1.001, Math.max(0, y / SHADE_U - 0.5))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fx = u - i
  const fy = v - j
  const k = j * p.sn + i
  const a0 = a[k]!
  const a1 = a[k + 1]!
  const a2 = a[k + p.sn]!
  const a3 = a[k + p.sn + 1]!
  return a0 + (a1 - a0) * fx + (a2 - a0) * fy + (a0 - a1 - a2 + a3) * fx * fy
}

/** 从离地 z 米的 (x, y) 往太阳那边看，被挡住多少：0 是全亮，1 是全在影子里；边上按离挡光处的远近软下去 */
function shadowRay(p: Prepared, x: number, y: number, z: number, t0: number): number {
  let occ = 0
  const step = MARCH_U
  const rise = RISE * p.mpu
  for (let t = t0; t < 14; t += step * (1 + t * 0.12)) {
    const zr = z + t * rise
    if (zr > p.top) break
    const h = gridAt(p, p.height, x + TO_SUN.x * t, y + TO_SUN.y * t)
    const over = h - zr
    if (over <= 0) continue
    occ = Math.max(occ, smooth(0, 0.12 + 0.05 * t, over))
    if (occ >= 1) break
  }
  return occ
}

/** 四围的树篱铺满整个方框：只放进看得见它的那几桶，即这一桶往下抬起它那么高的范围里有树篱 */
function hedgeSeen(g: Grids, c: number, r: number, hmax: number): boolean {
  const y1 = (r + 1) * BUCKET_U + hmax * LIFT_U
  for (let y = r * BUCKET_U; y <= y1; y += 0.25) for (let x = c * BUCKET_U; x <= (c + 1) * BUCKET_U; x += 0.25) if (sampleGrid(g, g.edge, x, y) > -0.3) return true
  return false
}

/**
 * 每个线程按同一份地图各算一遍：立着的东西与分桶；各处最高多高；地上每一点被挡住多少阳光（软边）与贴着东西的遮蔽；
 * 桌上的烛火在哪
 */
export function prepare(sc: PaintScene): Prepared {
  const grids = makeGrids(sc.plan, sc.cfg)
  const things = thingsOf(sc.plan, sc.cfg, grids)
  const bcols = Math.ceil(FRAME_U / BUCKET_U)
  const buckets: number[][] = Array.from({ length: bcols * bcols }, () => [])
  things.forEach((t, k) => {
    const c0 = Math.max(0, Math.floor(t.x0 / BUCKET_U))
    const c1 = Math.min(bcols - 1, Math.floor(t.x1 / BUCKET_U))
    const r0 = Math.max(0, Math.floor((t.y0 - t.hmax * LIFT_U) / BUCKET_U))
    const r1 = Math.min(bcols - 1, Math.floor(t.y1 / BUCKET_U))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (k === 0 && !hedgeSeen(grids, c, r, t.hmax)) continue
        buckets[r * bcols + c]!.push(k)
      }
    }
  })
  const sn = Math.round(FRAME_U / SHADE_U)
  const height = new Float32Array(sn * sn)
  const s = { lo: 0, hi: 0 }
  things.forEach((t) => {
    const i0 = Math.max(0, Math.floor(t.x0 / SHADE_U))
    const i1 = Math.min(sn - 1, Math.floor(t.x1 / SHADE_U))
    const j0 = Math.max(0, Math.floor(t.y0 / SHADE_U))
    const j1 = Math.min(sn - 1, Math.floor(t.y1 / SHADE_U))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!t.span((i + 0.5) * SHADE_U, (j + 0.5) * SHADE_U, s)) continue
        const k = j * sn + i
        if (s.hi > height[k]!) height[k] = s.hi
      }
    }
  })
  const prep0 = { grids, things, buckets, bcols, sn, height, shadow: height, ao: height, candles: [], mpu: sc.cfg.meterPerU, top: things.reduce((m, t) => Math.max(m, t.hmax), 0) }
  const shadow = new Float32Array(sn * sn)
  const ao = new Float32Array(sn * sn)
  const dirs = 8
  for (let j = 0; j < sn; j++) {
    for (let i = 0; i < sn; i++) {
      const x = (i + 0.5) * SHADE_U
      const y = (j + 0.5) * SHADE_U
      const k = j * sn + i
      if (height[k]! > 0.05 && sampleGrid(grids, grids.lawn, x, y) > 0.3) {
        shadow[k] = 1
        ao[k] = 1
        continue
      }
      shadow[k] = shadowRay(prep0, x, y, 0.02, 0.06)
      let a = 0
      for (let d = 0; d < dirs; d++) {
        const ang = (d / dirs) * Math.PI * 2
        let m = 0
        for (let r = 0.2; r <= 1.4; r += 0.2) {
          const h = gridAt(prep0, height, x + Math.cos(ang) * r, y + Math.sin(ang) * r)
          m = Math.max(m, clamp01(h / (r * prep0.mpu * 2.4 + 0.2)))
        }
        a += m
      }
      ao[k] = a / dirs
    }
  }
  const candles: { x: number; y: number; z: number }[] = []
  const tb = sc.plan.table
  for (const it of sc.plan.items) {
    if (it.kind !== 'candle') continue
    candles.push({ x: tb.horiz ? tb.x + it.u : tb.x + it.v, y: tb.horiz ? tb.y + it.v : tb.y + it.u, z: sc.cfg.table.heightM + 0.85 })
  }
  return { ...prep0, shadow, ao, candles }
}

type Rgb = [number, number, number]

/** 一点受的光：太阳（乘上没被挡住的那部分）、天光、草地的反光、烛火，再加上高光与自己发的光 */
function light(p: Prepared, s: Surf, nx: number, ny: number, nz: number, x: number, y: number, z: number, lit: number, ao: number, out: Rgb): void {
  const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z) * lit
  const sky = (0.55 + 0.45 * nz) * ao
  const bounce = (0.5 - 0.5 * nz) * ao
  let cr = 0
  let cg = 0
  let cb = 0
  for (const c of p.candles) {
    const dx = c.x - x
    const dy = c.y - y
    const dz = (c.z - z) / p.mpu
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 > CANDLE_U * CANDLE_U * 4) continue
    const d = Math.sqrt(d2) || 1
    const facing = Math.max(0, (nx * dx + ny * dy + nz * dz) / d) * 0.7 + 0.3
    const k = (facing * 0.7) / (1 + d2 / (CANDLE_U * CANDLE_U) * 4)
    cr += CANDLE_C[0] * k
    cg += CANDLE_C[1] * k
    cb += CANDLE_C[2] * k
  }
  const spec = s.spec * Math.pow(Math.max(0, nx * HV.x + ny * HV.y + nz * HV.z), s.shine) * lit
  const fill = Math.max(0, nx * V.x + ny * V.y + nz * V.z) * (1 - nz) * ao
  out[0] = s.r * (SUN_C[0] * ndl + SKY_C[0] * sky + BOUNCE_C[0] * bounce + FILL_C[0] * fill + cr) + spec * SUN_C[0] + s.er
  out[1] = s.g * (SUN_C[1] * ndl + SKY_C[1] * sky + BOUNCE_C[1] * bounce + FILL_C[1] * fill + cg) + spec * SUN_C[1] + s.eg
  out[2] = s.b * (SUN_C[2] * ndl + SKY_C[2] * sky + BOUNCE_C[2] * bounce + FILL_C[2] * fill + cb) + spec * SUN_C[2] + s.eb
}

/** 亮过头的地方往白里收，不一刀切：再转成 0–255 */
function toByte(v: number): number {
  const t = v < 0.8 ? v : 0.8 + (1 - Math.exp(-(v - 0.8) * 2.2)) * 0.2 / 1
  return Math.round(clamp01(t) * 255)
}

const surf: Surf = { r: 0, g: 0, b: 0, spec: 0, shine: 1, er: 0, eg: 0, eb: 0 }

/** 草坪上 (x, y) 处的底色：黑白格是剪草剪出来的，白格的草顺着横向倒、黑格的顺着竖向倒；草里零星的雏菊与落下的玫瑰花瓣，草坪边一圈土 */
function lawnSurf(sc: PaintScene, g: Grids, x: number, y: number, o: Surf): void {
  const plan = sc.plan
  const T = sc.cfg.tileU
  const tx = (x - plan.tile.x) / T
  const ty = (y - plan.tile.y) / T
  const ix = Math.floor(tx)
  const iy = Math.floor(ty)
  const light = (ix + iy) % 2 === 0
  // 两格交界处软一点，草尖互相探过去
  const fx = tx - ix
  const fy = ty - iy
  const edge = Math.min(fx, 1 - fx, fy, 1 - fy) * T
  const jag = (valueNoise(x * 30, y * 30, 3) - 0.5) * 0.06
  const k = smooth(-0.04, 0.06, edge + jag)
  const blade = light ? valueNoise(x * 3, y * 34, 11) : valueNoise(x * 34, y * 3, 12)
  const tone = fbm(x * 0.25, y * 0.25, 21, 3)
  const lr = 0.6 + 0.08 * blade + 0.06 * tone
  const dr = 0.12 + 0.05 * blade + 0.04 * tone
  // 白格是泛银的浅绿，黑格是墨一样的深青
  const L1: Rgb = [lr * 1.02, lr * 1.12, lr * 0.86]
  const D1: Rgb = [dr * 0.9, dr * 1.45, dr * 1.32]
  const a = light ? L1 : D1
  const b = light ? D1 : L1
  const m = 0.5 + 0.5 * k
  o.r = b[0] + (a[0] - b[0]) * m
  o.g = b[1] + (a[1] - b[1]) * m
  o.b = b[2] + (a[2] - b[2]) * m
  o.spec = 0.06
  o.shine = 6
  o.er = 0
  o.eg = 0
  o.eb = 0
  // 雏菊
  const q = cellNearest(x * 1.6, y * 1.6, 77)
  if (q.h < 0.06 && Math.hypot(q.dx, q.dy) < 0.12) {
    const c = Math.hypot(q.dx, q.dy) < 0.045
    o.r = c ? 0.95 : 0.96
    o.g = c ? 0.78 : 0.95
    o.b = c ? 0.25 : 0.9
  }
  // 草坪边：一圈压实的土，再往外藏在树篱底下
  const d = sampleGrid(g, g.lawn, x, y)
  const dirt = smooth(-0.7, -0.1, d + (valueNoise(x * 4, y * 4, 9) - 0.5) * 0.4)
  if (dirt > 0) {
    const dn = 0.18 + 0.06 * valueNoise(x * 9, y * 9, 13)
    o.r += (dn * 1.1 - o.r) * dirt
    o.g += (dn * 0.85 - o.g) * dirt
    o.b += (dn * 0.7 - o.b) * dirt
  }
  // 树篱脚下与花坛边落着玫瑰花瓣
  const near = smooth(-2.2, -0.3, d)
  const pq = cellNearest(x * 4, y * 4, 133)
  if (pq.h < 0.05 + 0.25 * near && Math.hypot(pq.dx * 1.6, pq.dy) < 0.16) {
    const white = pq.h * 7 % 1 < 0.35
    o.r = white ? 0.92 : 0.7
    o.g = white ? 0.88 : 0.1
    o.b = white ? 0.82 : 0.16
  }
}

/** 花坛里：深色的土，长着一丛丛矮玫瑰 */
function bedSurf(x: number, y: number, o: Surf): void {
  const dn = 0.2 + 0.08 * valueNoise(x * 6, y * 6, 5)
  o.r = dn * 1.05
  o.g = dn * 0.78
  o.b = dn * 0.62
  o.spec = 0.04
  o.shine = 4
  const q = cellNearest(x * 1.4, y * 1.4, 17)
  const d = Math.hypot(q.dx, q.dy)
  if (d < 0.32) {
    const leaf = cellNearest(x * 12, y * 12, 19)
    const l = 0.7 + 0.5 * leaf.h
    o.r = 0.12 * l
    o.g = 0.3 * l
    o.b = 0.16 * l
    const r = cellNearest(x * 5, y * 5, 23)
    if (Math.hypot(r.dx, r.dy) < 0.2 && r.h < 0.6) {
      const kind = q.h < 0.55 ? 0 : q.h < 0.8 ? 1 : 2
      const rr = Math.hypot(r.dx, r.dy) / 0.2
      const fold = 0.75 + 0.25 * Math.sin(Math.atan2(r.dy, r.dx) * 5 + rr * 8)
      const red = kind === 0 || (kind === 2 && r.dx > 0)
      o.r = (red ? 0.78 : 0.95) * fold
      o.g = (red ? 0.1 : 0.92) * fold
      o.b = (red ? 0.16 : 0.85) * fold
    }
  }
}

/** 躺在草上的怀表、钥匙、纸牌与洒的茶：画成扁扁的一层，有一点倒角的光 */
function decalSurf(sc: PaintScene, x: number, y: number, o: Surf): number {
  for (const d of sc.plan.decals) {
    const dx = x - d.x
    const dy = y - d.y
    if (Math.abs(dx) > d.r * 1.8 || Math.abs(dy) > d.r * 1.8) continue
    const c = Math.cos(d.a)
    const s = Math.sin(d.a)
    const u = dx * c + dy * s
    const v = -dx * s + dy * c
    switch (d.kind) {
      case 'watch': {
        const r = Math.hypot(dx, dy)
        // 链子从表冠拖出去一弯
        const chain = Math.abs(v - 0.25 * Math.sin(u * 2.2)) < 0.035 && u > d.r && u < d.r * 2.6
        if (chain && Math.sin(u * 40) > 0) {
          o.r = 0.86
          o.g = 0.68
          o.b = 0.3
          o.spec = 0.8
          o.shine = 40
          return 0.6
        }
        if (r > d.r) continue
        const t = r / d.r
        if (t > 0.86) {
          o.r = 0.9
          o.g = 0.7
          o.b = 0.3
          o.spec = 0.9
          o.shine = 40
          return t > 0.93 ? -0.6 : 0.6
        }
        o.r = 0.96
        o.g = 0.93
        o.b = 0.84
        o.spec = 0.9
        o.shine = 120
        const a = Math.atan2(v, u)
        const tick = Math.abs(Math.sin(a * 6)) < 0.08 && t > 0.68 && t < 0.8
        const h1 = Math.abs(Math.sin(a - d.k * 6.28)) < 0.04 && Math.cos(a - d.k * 6.28) > 0 && t < 0.5
        const h2 = Math.abs(Math.sin(a - d.k * 40)) < 0.03 && Math.cos(a - d.k * 40) > 0 && t < 0.72
        if (tick || h1 || h2 || t < 0.05) {
          o.r = 0.12
          o.g = 0.1
          o.b = 0.1
        }
        return 0.3
      }
      case 'key': {
        // 一把老式的铜钥匙：圈柄、长杆、齿
        const bow = Math.abs(Math.hypot(u + d.r * 0.7, v) - d.r * 0.26) < d.r * 0.08
        const shaft = Math.abs(v) < d.r * 0.06 && u > -d.r * 0.45 && u < d.r
        const bit = u > d.r * 0.62 && u < d.r * 0.95 && v > 0 && v < d.r * 0.24 && Math.sin(u * 30) > -0.3
        if (!bow && !shaft && !bit) continue
        o.r = 0.86
        o.g = 0.66
        o.b = 0.3
        o.spec = 0.85
        o.shine = 30
        return 0.5
      }
      case 'card': {
        if (Math.abs(u) > d.r * 0.72 || Math.abs(v) > d.r) continue
        o.r = 0.94
        o.g = 0.92
        o.b = 0.86
        o.spec = 0.15
        o.shine = 8
        const red = d.k < 0.5
        const pip = Math.hypot(u, v * 0.8) < d.r * 0.22
        if (pip || Math.hypot(u + d.r * 0.5, v + d.r * 0.75) < d.r * 0.08) {
          o.r = red ? 0.75 : 0.12
          o.g = red ? 0.1 : 0.1
          o.b = red ? 0.14 : 0.12
        }
        return 0.08
      }
      case 'tea': {
        const blob = Math.hypot(u / 1.3, v) + (valueNoise(dx * 3, dy * 3, 71) - 0.5) * 0.5
        if (blob > d.r) continue
        const k = 0.35 + 0.25 * smooth(d.r, d.r * 0.6, blob)
        o.r *= 1 - k * 0.3
        o.g *= 1 - k * 0.55
        o.b *= 1 - k * 0.75
        o.spec = 0.6
        o.shine = 60
        return 0
      }
    }
  }
  return -1
}

/** 像素中心的地上坐标，格 */
const ppu = GROUND_PPU

/**
 * 画一块：每个像素先找视线碰到的最前面的那样东西（树篱、茶桌、茶具、牌篱、矮篱、门拱、蘑菇），按太阳打光、投影，画进立着的那一层；
 * 底下的草坪（黑白格、花坛、躺着的东西、影子与遮蔽）总画进地面那一层。立着的东西的边多采几次，免得锯齿
 */
export function paintGround(sc: PaintScene, prep: Prepared, rect: PixelRect, ground: Uint8ClampedArray, occ: Uint8ClampedArray): void {
  const w = rect.x1 - rect.x0
  const col: Rgb = [0, 0, 0]
  const acc: Rgb = [0, 0, 0]
  const hit: Hit = { x: 0, y: 0, z: 0, top: true, nx: 0, ny: 0, nz: 1 }
  const g = prep.grids
  const beds = sc.plan.beds
  const inset = sc.cfg.beds.thickU
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      // 地面
      if (beds.some((b) => Math.abs(x - b.x) < b.hx - inset && Math.abs(y - b.y) < b.hy - inset)) bedSurf(x, y, surf)
      else lawnSurf(sc, g, x, y, surf)
      const bevel = decalSurf(sc, x, y, surf)
      const lit = 1 - gridAt(prep, prep.shadow, x, y)
      const ao = 1 - 0.7 * gridAt(prep, prep.ao, x, y)
      const tilt = bevel > -1 ? bevel * 0.25 : 0
      light(prep, surf, -tilt * 0.6, -tilt * 0.8, Math.sqrt(1 - Math.min(0.9, tilt * tilt)), x, y, 0, lit, ao, col)
      ground[o] = toByte(col[0])
      ground[o + 1] = toByte(col[1])
      ground[o + 2] = toByte(col[2])
      ground[o + 3] = 255
    }
  }
  // 立着的东西：先每个像素正中采一次，记下碰到的是哪样；和上下左右碰到的不一样的像素在边上，再采 AA×AA 次
  const ew = w + 2
  const eh = rect.y1 - rect.y0 + 2
  const idx = new Int16Array(ew * eh)
  const zs = new Float32Array(ew * eh)
  for (let j = 0; j < eh; j++) {
    for (let i = 0; i < ew; i++) {
      const x = (rect.x0 + i - 1 + 0.5) / ppu
      const y = (rect.y0 + j - 1 + 0.5) / ppu
      const r = nearest(prep, x, y)
      idx[j * ew + i] = r.k
      zs[j * ew + i] = r.z
    }
  }
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const e = (py - rect.y0 + 1) * ew + (px - rect.x0 + 1)
      const k = idx[e]!
      const edge = idx[e - 1] !== k || idx[e + 1] !== k || idx[e - ew] !== k || idx[e + ew] !== k
      if (!edge) {
        if (k < 0) {
          occ[o + 3] = 0
          continue
        }
        shade(prep, prep.things[k]!, (px + 0.5) / ppu, (py + 0.5) / ppu, zs[e]!, -1, hit, col)
        occ[o] = toByte(col[0])
        occ[o + 1] = toByte(col[1])
        occ[o + 2] = toByte(col[2])
        occ[o + 3] = 255
        continue
      }
      acc[0] = 0
      acc[1] = 0
      acc[2] = 0
      let cover = 0
      let lit = -1
      const n = AA
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const xs = (px + (sx + 0.5) / n) / ppu
          const ys = (py + (sy + 0.5) / n) / ppu
          const r = nearest(prep, xs, ys)
          if (r.k < 0) continue
          lit = shade(prep, prep.things[r.k]!, xs, ys, r.z, lit, hit, col)
          acc[0] += col[0]
          acc[1] += col[1]
          acc[2] += col[2]
          cover++
        }
      }
      if (cover === 0) {
        occ[o + 3] = 0
        continue
      }
      occ[o] = toByte(acc[0] / cover)
      occ[o + 1] = toByte(acc[1] / cover)
      occ[o + 2] = toByte(acc[2] / cover)
      occ[o + 3] = Math.round((cover / (n * n)) * 255)
    }
  }
}

const near = { k: -1, z: -1 }

/** 屏幕上 (x, y)（格）视线先碰到的那样东西：在 things 里的序号与碰到的高度，没碰到序号为 -1 */
function nearest(prep: Prepared, x: number, y: number): { k: number; z: number } {
  near.k = -1
  near.z = -1
  if (x < 0 || y < 0 || x >= FRAME_U || y >= FRAME_U) return near
  const list = prep.buckets[Math.floor(y / BUCKET_U) * prep.bcols + Math.floor(x / BUCKET_U)]!
  for (const k of list) {
    const z = sightZ(prep.things[k]!, x, y)
    if (z > near.z + 1e-6) {
      near.z = z
      near.k = k
    }
  }
  return near
}

/** 视线在 (x, y) 碰到 t 的 z 米处：打光的颜色写进 col；lit 是这个像素已经算过的阳光（-1 是还没算），返回它 */
function shade(prep: Prepared, t: Thing, x: number, y: number, z: number, lit: number, hit: Hit, col: Rgb): number {
  hitOf(t, x, y, z, prep.mpu, hit)
  t.paint(hit, surf)
  const sh = lit >= 0 ? lit : 1 - shadowRay(prep, hit.x, hit.y, hit.z + 0.04, 0.14)
  light(prep, surf, hit.nx, hit.ny, hit.nz, hit.x, hit.y, hit.z, sh, 0.75 + 0.25 * Math.max(0, hit.nz), col)
  return sh
}
