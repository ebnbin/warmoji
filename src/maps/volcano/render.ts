import { UNIT } from '../../util/units'
import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { awayFromWall, roomAt } from '../basin'
import type { LavaField } from './model'
import type { VolcanoConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 刚凝固的岩石裂缝里透出的红光多久褪尽 */
export const EMBER_MS = 11000

/** 画面上算作有熔岩的最薄厚度 */
const LAVA_THIN = 0.005

/** 熔岩在画面上要连续有这么多步才显示、连续没有这么多步才消失：边缘的格子常在有无之间来回跳一两步（凝了又被邻格流进来） */
const SETTLE_STEPS = { on: 1.5, off: 2.5 } as const

/** 每格熔岩在画面上有没有：原始的有无从什么时候起没变过，以及最近一次有熔岩时的厚度与温度 */
export interface LavaShown {
  readonly on: Uint8Array
  readonly raw: Uint8Array
  readonly since: Float64Array
  readonly depth: Float32Array
  readonly heat: Float32Array
}

export function lavaShown(f: LavaField, now: number): LavaShown {
  const n = f.cols * f.rows
  const s = { on: new Uint8Array(n), raw: new Uint8Array(n), since: new Float64Array(n).fill(now), depth: new Float32Array(n), heat: new Float32Array(n) }
  for (let i = 0; i < n; i++) {
    if (f.lava[i]! < LAVA_THIN) continue
    s.on[i] = s.raw[i] = 1
    s.depth[i] = f.lava[i]!
    s.heat[i] = f.heat[i]!
  }
  return s
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 场里 (u, v) 处按格心双线性取值，u、v 以格计、格心在整数处 */
function bilinear(a: ArrayLike<number>, f: Pick<LavaField, 'cols' | 'rows'>, u: number, v: number): number {
  const x = Math.min(f.cols - 1.001, Math.max(0, u))
  const y = Math.min(f.rows - 1.001, Math.max(0, v))
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const i = iy * f.cols + ix
  const a00 = a[i]!
  const a10 = a[i + 1]!
  const a01 = a[i + f.cols]!
  const a11 = a[i + f.cols + 1]!
  return a00 + (a10 - a00) * fx + (a01 - a00) * fy + (a00 - a10 - a01 + a11) * fx * fy
}

/** 按 1-2-1 的核平滑一遍：格子上阶跃的量双线性插值后等值线是锯齿，先平滑再取等值线就圆了 */
function soften(src: ArrayLike<number>, cols: number, rows: number, out: Float32Array): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let s = 0
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(rows - 1, Math.max(0, y + j))
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(cols - 1, Math.max(0, x + i))
          s += src[yy * cols + xx]! * (i === 0 ? 2 : 1) * (j === 0 ? 2 : 1)
        }
      }
      out[y * cols + x] = s / 16
    }
  }
}

const LIGHT_X = SUN.x
const LIGHT_Y = SUN.y
const LIGHT_Z = SUN.z

/** 往光源方向看这么远（格）找挡光的地形 */
const SHADOW_STEPS = [0.4, 0.9, 1.5, 2.3] as const

/** 岩石的遮罩：凝固过的格子与开局后才凝固的格子，都平滑过一遍 */
export interface RockMasks {
  readonly rocky: Float32Array
  readonly fresh: Float32Array
}

export function rockMasks(f: Pick<LavaField, 'cols' | 'rows' | 'rockAt'>): RockMasks {
  const rocky = new Float32Array(f.cols * f.rows)
  const fresh = new Float32Array(f.cols * f.rows)
  const hard = new Float32Array(f.cols * f.rows)
  for (let i = 0; i < hard.length; i++) hard[i] = f.rockAt[i]! > -Infinity ? 1 : 0
  soften(hard, f.cols, f.rows, rocky)
  for (let i = 0; i < hard.length; i++) hard[i] = f.rockAt[i]! >= 0 ? 1 : 0
  soften(hard, f.cols, f.rows, fresh)
  return { rocky, fresh }
}

/** 画地面用到的那部分熔岩场：只有数据，能整个发给画地面的线程 */
export type GroundField = Pick<LavaField, 'basin' | 'cols' | 'rows' | 'cell' | 'x0' | 'y0' | 'ground' | 'rockAt' | 'craterX' | 'craterY' | 'seed'>

/** 地面上以格计的一块：[c0, c1) × [r0, r1) */
export interface CellRect {
  readonly c0: number
  readonly r0: number
  readonly c1: number
  readonly r1: number
}

/** 地面上要画的地标，像素：喷气孔，与崖脚的洞口（口子正中在崖脚，n 朝盆地，r 是口子的半宽） */
export interface GroundMarks {
  readonly vents: readonly Point[]
  readonly caves: readonly { readonly x: number; readonly y: number; readonly nx: number; readonly ny: number; readonly r: number }[]
}

/** 洞往崖里伸进去多深，格 */
const CAVE_DEPTH_U = 1

/** 发给画地面的线程：先 setup 一次，每批活先给 state（当下的地形与岩石），再一块一块要 paint */
export type GroundJob =
  | { readonly kind: 'setup'; readonly field: GroundField; readonly cfg: VolcanoConfig; readonly marks: GroundMarks; readonly ppc: number }
  | { readonly kind: 'state'; readonly ground: Float32Array; readonly rockAt: Float32Array }
  | { readonly kind: 'paint'; readonly index: number; readonly rect: CellRect }

/** 装得下一块地面像素的缓冲：按 paintGround 的排法 */
export function groundBuffer(rect: CellRect, ppc: number): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.c1 - rect.c0) * (rect.r1 - rect.r0) * ppc * ppc * 4)
}

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface GroundPiece {
  readonly index: number
  readonly rect: CellRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

/**
 * 地表：盆地里是灰黑的火山灰地面，火山是红褐色的火山渣，凝固的熔岩是偏冷的黑色玄武岩；盆地外是崖壁与柱状节理的玄武岩高地，越往外越暗。
 * 按高度场打光，高处朝背光一侧投下影子；所有岩壁脚下都堆着碎石，陡峭的山体上有顺坡的碎石纹，灰地上有干裂纹，喷气孔周围有硫磺；崖脚的洞口黑洞洞的，深处透着熔岩的暗红。
 * ppc 是每格多少像素，只画 [c0, c1) × [r0, r1) 的格子，out 里按这块的范围逐行排。
 */
export function paintGround(
  f: GroundField,
  cfg: VolcanoConfig,
  ppc: number,
  marks: GroundMarks,
  masks: RockMasks,
  out: Uint8ClampedArray,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
): void {
  const w = (c1 - c0) * ppc
  const seed = f.seed
  const cone = cfg.cone
  const mountain = cone.blockU * (1 + cone.blockJitter)
  const sulfur = marks.vents.map((p) => ({ u: (p.x - f.x0) / f.cell - 0.5, v: (p.y - f.y0) / f.cell - 0.5 }))
  const caves = marks.caves.map((c) => ({ x: c.x / UNIT, y: c.y / UNIT, nx: c.nx, ny: c.ny, w: c.r / UNIT }))
  const sr = 1.4 / cfg.cellU
  const lxy = Math.hypot(LIGHT_X, LIGHT_Y)
  const sunU = LIGHT_X / lxy / cfg.cellU
  const sunV = LIGHT_Y / lxy / cfg.cellU
  const sunRise = LIGHT_Z / lxy
  const { rocky, fresh } = masks
  for (let py = r0 * ppc; py < r1 * ppc; py++) {
    for (let px = c0 * ppc; px < c1 * ppc; px++) {
      const u = (px + 0.5) / ppc - 0.5
      const v = (py + 0.5) / ppc - 0.5
      const e = 0.5
      const g0 = bilinear(f.ground, f, u, v)
      const hx = bilinear(f.ground, f, u + e, v) - bilinear(f.ground, f, u - e, v)
      const hy = bilinear(f.ground, f, u, v + e) - bilinear(f.ground, f, u, v - e)
      const nx = -hx / (2 * e * cfg.cellU)
      const ny = -hy / (2 * e * cfg.cellU)
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const lambert = Math.max(0, (nx * LIGHT_X + ny * LIGHT_Y + LIGHT_Z) * nl)
      const wx = (f.x0 + (u + 0.5) * f.cell) / UNIT
      const wy = (f.y0 + (v + 0.5) * f.cell) / UNIT
      const ox = wx - f.craterX / UNIT
      const oy = wy - f.craterY / UNIT
      const dU = Math.sqrt(ox * ox + oy * oy)
      const roomU = roomAt(f.basin, wx * UNIT, wy * UNIT) / UNIT
      const edgeU = roomU < 2.5 ? roomU + (fbm(wx * 1.3, wy * 1.3, seed + 141, 2) - 0.5) * 0.5 : roomU
      const steep = smooth(cone.blockU + 0.3, cone.blockU - 0.6, dU) * smooth(cone.craterU, cone.craterU + 0.5, dU)
      const cliff = smooth(0, 0.3, -edgeU) * smooth(cfg.rim.cliffU + 0.4, cfg.rim.cliffU - 0.2, -edgeU)
      const shade = 0.5 - steep * 0.18 - cliff * 0.12 + lambert * (0.75 + steep * 0.35 + cliff * 0.25)
      const big = fbm(wx / 5, wy / 5, seed + 3, 2)
      const grain = valueNoise(wx * 5.5, wy * 5.5, seed + 9) * 0.5 + valueNoise(wx * 13, wy * 13, seed + 11) * 0.5
      const ash = big * 20 + grain * 12
      let r = 54 + ash
      let g = 59 + ash
      let b = 63 + ash
      const crust = smooth(0.45, 0.66, fbm(wx / 3.2, wy / 3.2, seed + 25, 2)) * smooth(cone.blockU, cone.blockU + 3, dU)
      if (crust > 0) {
        const wide = smooth(0.05, 0.012, cellEdge(wx * 0.55, wy * 0.55, seed + 21)) * (0.2 + 0.8 * valueNoise(wx * 1.3, wy * 1.3, seed + 29))
        const fine = smooth(0.032, 0.008, cellEdge(wx * 1.35, wy * 1.35, seed + 23)) * smooth(0.45, 0.75, fbm(wx / 1.6, wy / 1.6, seed + 27, 2))
        const k = 1 - Math.max(wide * 0.22, fine * 0.14) * crust
        r *= k
        g *= k
        b *= k
      }
      if (dU < cone.blockU + 3) {
        const cinder = smooth(cone.blockU + 3, cone.blockU - 0.5, dU) * (0.8 + grain * 0.35)
        r += (118 - r) * cinder
        g += (58 - g) * cinder
        b += (40 - b) * cinder
        const summit = smooth(cone.craterU + 1.6, cone.craterU + 0.1, dU) * 0.6
        r += (131 - r) * summit
        g += (136 - g) * summit
        b += (141 - b) * summit
        if (steep > 0) {
          const a = Math.atan2(oy, ox)
          const scree = fbm(Math.cos(a) * 14 + 5, Math.sin(a) * 14 + dU * 0.35, seed + 81, 2)
          const k = 1 + (scree - 0.5) * 0.7 * steep
          r *= k
          g *= k
          b *= k
        }
        const lip = Math.exp(-(((dU - cone.craterU) / 0.28) ** 2))
        r += (150 - r) * lip * 0.55
        g += (80 - g) * lip * 0.55
        b += (56 - b) * lip * 0.55
        if (dU < cone.craterU) {
          const pit = smooth(cone.craterU * 0.95, cone.craterU * 0.5, dU)
          r += (19 - r) * pit
          g += (24 - g) * pit
          b += (28 - b) * pit
        }
      }
      const high = smooth(0, 0.4, -edgeU) * smooth(mountain - 0.3, mountain + 1.5, dU)
      if (high > 0) {
        const q = cellNearest(wx * 1.7, wy * 1.7, seed + 121)
        const joint = 0.64 + 0.36 * smooth(0.008, 0.06, cellEdge(wx * 1.7, wy * 1.7, seed + 121))
        const rift = 0.45 + 0.55 * smooth(0, 0.035, cellEdge(wx * 0.45, wy * 0.45, seed + 171))
        const dust = smooth(0.5, 0.78, fbm(wx / 3, wy / 3, seed + 131, 2)) * 0.35
        const stone = q.h * 15 + grain * 10
        let hr = (45 + stone) * (1 - dust) + 94 * dust
        let hg = (50 + stone) * (1 - dust) + 99 * dust
        let hb = (54 + stone) * (1 - dust) + 104 * dust
        if (cliff > 0) {
          const n = awayFromWall(f.basin, wx * UNIT, wy * UNIT)
          const fall = valueNoise((wx * -n.y + wy * n.x) * 4.5, (wx * n.x + wy * n.y) * 0.8, seed + 161)
          const k = 1 + (fall - 0.5) * 0.6 * cliff
          hr *= k
          hg *= k
          hb *= k
        }
        const k = joint * rift
        r += (hr * k - r) * high
        g += (hg * k - g) * high
        b += (hb * k - b) * high
      }
      for (const s of sulfur) {
        const d = Math.hypot(u - s.u, v - s.v) / sr
        if (d >= 1) continue
        const stain = smooth(0.3, 0.75, valueNoise(wx * 2.6, wy * 2.6, seed + 41) * (1 - d) * 1.5) * (1 - d)
        r += (196 - r) * stain * 0.55
        g += (170 - g) * stain * 0.55
        b += (58 - b) * stain * 0.55
      }
      const rock = smooth(0.35, 0.6, bilinear(rocky, f, u, v) + (valueNoise(wx * 2.2, wy * 2.2, seed + 61) - 0.5) * 0.35) * (1 - steep * 0.6)
      if (rock > 0) {
        const ropes = 0.5 + 0.5 * Math.sin((wx * 0.8 + wy * 1.1) * 5 + fbm(wx * 0.9, wy * 0.9, seed + 51, 2) * 9)
        const young = clamp01(bilinear(fresh, f, u, v) * 1.6)
        const joint =
          1 -
          0.32 * smooth(0.05, 0.012, cellEdge(wx * 0.9, wy * 0.9, seed + 33)) * (0.45 + 0.55 * valueNoise(wx * 1.6, wy * 1.6, seed + 39)) -
          0.14 * smooth(0.035, 0.008, cellEdge(wx * 2.1, wy * 2.1, seed + 35)) * smooth(0.5, 0.8, fbm(wx / 1.4, wy / 1.4, seed + 37, 2))
        const basalt = grain * 16 + ropes * 7 + big * 6 + (1 - young) * (18 + big * 10)
        const rr = (32 + basalt) * joint
        const rg = (37 + basalt) * joint
        const rb = (41 + basalt) * joint
        r += (rr - r) * rock
        g += (rg - g) * rock
        b += (rb - b) * rock
      }
      let over = 0
      for (const k of SHADOW_STEPS) over = Math.max(over, bilinear(f.ground, f, u + sunU * k, v + sunV * k) - g0 - k * sunRise)
      const foot = 1 - 0.25 * smooth(0.7, 0, edgeU) * smooth(-0.3, 0, edgeU)
      const far = 1 - 0.45 * smooth(0.6, 4.5, -roomU)
      const dark = shade * foot * far * (1 - 0.38 * smooth(0, 0.5, over))
      r *= dark
      g *= dark
      b *= dark
      for (const c of caves) {
        const dx = wx - c.x
        const dy = wy - c.y
        if (dx * dx + dy * dy > (c.w + CAVE_DEPTH_U) ** 2) continue
        const into = -(dx * c.nx + dy * c.ny)
        const across = (dx * -c.ny + dy * c.nx) / c.w
        const e = Math.hypot(across, Math.max(0, into) / CAVE_DEPTH_U)
        if (into < -0.15 || e > 1.1) continue
        const hole = smooth(1, 0.78, e) * smooth(-0.15, 0.05, into)
        const glow = smooth(0.25, 1, into / CAVE_DEPTH_U) * 0.6
        r += (14 + 80 * glow - r) * hole
        g += (10 + 24 * glow - g) * hole
        b += (9 + 10 * glow - b) * hole
        const lip = smooth(0.82, 0.97, e) * smooth(1.1, 0.97, e) * smooth(-0.15, 0.1, into)
        r *= 1 + lip * 0.25
        g *= 1 + lip * 0.25
        b *= 1 + lip * 0.25
      }
      const fan = edgeU < 2.2 && edgeU > -1.2 ? smooth(0.3, 0.75, fbm(wx / 2.5, wy / 2.5, seed + 151, 2)) : 0
      const reach = 0.3 + 0.9 * fan
      const band = smooth(reach + 0.3, reach * 0.4, Math.abs(edgeU + 0.05 - reach * 0.4))
      const strays = edgeU > 0 && edgeU < 2.2 ? 1 : 0
      if (band > 0 || strays > 0) {
        const q = cellNearest(wx * 1.6, wy * 1.6, seed + 71)
        const size = (0.26 + 0.24 * q.h) * (band > 0 ? 0.5 + 0.5 * band : 0.55)
        const d = Math.hypot(q.dx, q.dy) / size
        if ((band > 0 ? q.h > 0.1 + 0.5 * (1 - fan) : q.h > 0.93) && d < 1.4) {
          if (d < 1) {
            const lz = Math.sqrt(1 - d * d)
            const lit = Math.max(0, (q.dx / size) * LIGHT_X + (q.dy / size) * LIGHT_Y + lz * LIGHT_Z)
            const tone = 0.35 + lit * 0.95
            const k = smooth(1, 0.82, d)
            r += ((63 + q.h * 15) * tone - r) * k
            g += ((68 + q.h * 15) * tone - g) * k
            b += ((72 + q.h * 15) * tone - b) * k
          } else {
            const k = 1 - 0.35 * smooth(1.4, 1, d)
            r *= k
            g *= k
            b *= k
          }
        }
      }
      const o = ((py - r0 * ppc) * w + px - c0 * ppc) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }
}

/** 地面图层每个熔岩格多少像素：和其他地图的地面一样细 */
export function groundPpc(cfg: VolcanoConfig): number {
  return GROUND_PPU * cfg.cellU
}

/** 地面图层按这么多格见方分块重画 */
export const GROUND_TILE = 4

/** 这一格的岩石变了，哪些块要重画：岩石的边平滑出去一格，影子朝背光一侧投出去 SHADOW_STEPS 那么远 */
export function markGround(f: LavaField, cfg: VolcanoConfig, i: number, dirty: Uint8Array): void {
  const tiles = Math.ceil(f.cols / GROUND_TILE)
  const cx = i % f.cols
  const cy = (i - cx) / f.cols
  const reach = Math.ceil(SHADOW_STEPS[SHADOW_STEPS.length - 1]! / cfg.cellU) + 1
  const lxy = Math.hypot(LIGHT_X, LIGHT_Y)
  const sx = -Math.sign(LIGHT_X / lxy)
  const sy = -Math.sign(LIGHT_Y / lxy)
  const xa = Math.max(0, Math.floor((cx - 2 + Math.min(0, sx * reach)) / GROUND_TILE))
  const xb = Math.min(tiles - 1, Math.floor((cx + 2 + Math.max(0, sx * reach)) / GROUND_TILE))
  const ya = Math.max(0, Math.floor((cy - 2 + Math.min(0, sy * reach)) / GROUND_TILE))
  const yb = Math.min(Math.ceil(f.rows / GROUND_TILE) - 1, Math.floor((cy + 2 + Math.max(0, sy * reach)) / GROUND_TILE))
  for (let ty = ya; ty <= yb; ty++) for (let tx = xa; tx <= xb; tx++) dirty[ty * tiles + tx] = 1
}


/**
 * 给熔岩着色器的两张数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * lava 的 R 是平滑过的有无熔岩（取 0.5 的等值线就是圆滑的边）、G 是温度（凝固温度处为 0）、B 是刚凝固岩石的余烬；
 * aux 的 R 是模糊后的辉光、G、B 是熔岩顺坡往下流的方向。
 * 有无按 shown 去抖：短暂没了的格子照旧按最近一次的厚度与温度画，短暂冒出来的格子先不画。
 */
export function encodeLava(f: LavaField, cfg: VolcanoConfig, now: number, shown: LavaShown, lava: Uint8ClampedArray, aux: Uint8ClampedArray, glow: Float32Array, soft: Float32Array): void {
  const { cols, rows, ground } = f
  const solidus = cfg.lava.solidus
  const onMs = SETTLE_STEPS.on * cfg.lava.stepMs
  const offMs = SETTLE_STEPS.off * cfg.lava.stepMs
  for (let i = 0; i < cols * rows; i++) {
    const r = f.lava[i]! >= LAVA_THIN ? 1 : 0
    if (r !== shown.raw[i]) {
      shown.raw[i] = r
      shown.since[i] = now
    }
    if (r !== shown.on[i] && now - shown.since[i]! >= (r ? onMs : offMs)) shown.on[i] = r
    if (r) {
      shown.depth[i] = f.lava[i]!
      shown.heat[i] = f.heat[i]!
    }
    glow[i] = shown.on[i]!
  }
  soften(glow, cols, rows, soft)
  for (let i = 0; i < cols * rows; i++) {
    const l = shown.on[i] ? shown.depth[i]! : 0
    const t = l > 0 ? clamp01((shown.heat[i]! - solidus) / (1 - solidus)) : 0
    const at = f.rockAt[i]!
    const age = now - at
    const ember = l <= 0 && at > -Infinity && age >= 0 && age < EMBER_MS ? (1 - age / EMBER_MS) ** 2 : 0
    lava[i * 4] = soft[i]! * 255
    lava[i * 4 + 1] = t * 255
    lava[i * 4 + 2] = ember * 255
    lava[i * 4 + 3] = 255
    glow[i] = t ** 1.5 * smooth(0.002, 0.03, l)
  }
  blur(glow, cols, rows, 2)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const gx = ground[cy * cols + Math.max(0, cx - 1)]! - ground[cy * cols + Math.min(cols - 1, cx + 1)]!
      const gy = ground[Math.max(0, cy - 1) * cols + cx]! - ground[Math.min(rows - 1, cy + 1) * cols + cx]!
      const gl = Math.hypot(gx, gy) || 1
      aux[i * 4] = Math.min(1, glow[i]! * 1.6) * 255
      aux[i * 4 + 1] = (gx / gl) * 127.5 + 127.5
      aux[i * 4 + 2] = (gy / gl) * 127.5 + 127.5
      aux[i * 4 + 3] = 255
    }
  }
}

let blurLine = new Float32Array(0)

/** 横竖各一遍的方框模糊，半径 r 格 */
function blur(a: Float32Array, cols: number, rows: number, r: number): void {
  if (blurLine.length < Math.max(cols, rows)) blurLine = new Float32Array(Math.max(cols, rows))
  const line = blurLine
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) line[x] = a[y * cols + x]!
    for (let x = 0; x < cols; x++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += line[Math.min(cols - 1, Math.max(0, x + d))]!
      a[y * cols + x] = s * k
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) line[y] = a[y * cols + x]!
    for (let y = 0; y < rows; y++) {
      let s = 0
      for (let d = -r; d <= r; d++) s += line[Math.min(rows - 1, Math.max(0, y + d))]!
      a[y * cols + x] = s * k
    }
  }
}

/**
 * 熔岩的片元着色器，四边形盖住整块场地，坐标以格计、y 朝下。四边形的纹理坐标 y 朝上，画布纹理上传时也上下翻了，所以直接按它采样。熔岩按温度从白黄到暗红，冷下来结出暗色硬壳，壳块之间的缝透出熔岩；
 * 壳块与热熔岩上漂着的硬壳按流向图顺坡往下漂，火山口里的熔岩湖打着转，喷发时湖面随流量涨到口沿；按扭曲过的坐标采样，边缘不顺着格子走。
 * 输出按预乘透明度：熔岩盖在地上，辉光、余烬叠加发亮。
 */
export const LAVA_FRAG = `
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
uniform sampler2D uLava;
uniform sampler2D uAux;
uniform float uTime;
uniform vec2 uGrid;
uniform vec3 uCrater;
uniform float uWarn;
uniform float uErupt;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i).x;
  float b = hash2(i + vec2(1.0, 0.0)).x;
  float c = hash2(i + vec2(0.0, 1.0)).x;
  float d = hash2(i + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float plates(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g) * 0.8 + 0.1;
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return d2 - d1;
}

vec3 ramp(float t) {
  vec3 c0 = vec3(0.30, 0.05, 0.03);
  vec3 c1 = vec3(0.62, 0.10, 0.04);
  vec3 c2 = vec3(0.90, 0.26, 0.05);
  vec3 c3 = vec3(1.0, 0.47, 0.08);
  vec3 c4 = vec3(1.0, 0.68, 0.20);
  vec3 c5 = vec3(1.0, 0.88, 0.52);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.72) return mix(c2, c3, (t - 0.5) / 0.22);
  if (t < 0.9) return mix(c3, c4, (t - 0.72) / 0.18);
  return mix(c4, c5, (t - 0.9) / 0.1);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 cell = vec2(tc.x, 1.0 - tc.y) * uGrid;
  vec2 wob = vec2(vnoise(cell * 0.8 + 3.0), vnoise(cell * 0.8 + 21.0)) - 0.5;
  vec2 at = tc + vec2(wob.x, -wob.y) * 0.9 / uGrid;
  vec4 lv = texture2D(uLava, at);
  vec4 ax = texture2D(uAux, at);
  float shape = lv.r;
  float heat = lv.g;
  float ember = lv.b;
  vec3 add = vec3(1.0, 0.36, 0.08) * ax.r * (0.3 + 0.3 * uErupt);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float ragged = (vnoise(cell * 1.9) - 0.5) * 0.22 + (vnoise(cell * 4.3 + 11.0) - 0.5) * 0.1;
  float cover = smoothstep(0.42, 0.52, shape + ragged * smoothstep(0.0, 0.2, shape));
  vec2 rc = cell - uCrater.xy;
  float lake = 1.0 - smoothstep(uCrater.z * 0.6, uCrater.z * 0.95, length(rc));
  float brim = uCrater.z * (0.8 + 0.32 * uErupt) + ragged * 0.6;
  float swell = 1.0 - smoothstep(brim - 0.12, brim, length(rc));
  cover = max(cover, swell);
  heat = max(heat, swell);
  if (cover > 0.001) {
    vec2 dir = ax.gb * 2.0 - 1.0;
    vec2 swirl = vec2(-rc.y, rc.x) / max(length(rc), 0.001);
    dir = mix(dir, swirl, lake);
    float speed = (0.3 + 0.8 * heat) * 2.1 * (1.0 - lake * 0.8);
    float ph = fract(uTime / 2.2);
    float ph2 = fract(ph + 0.5);
    float w = abs(1.0 - 2.0 * ph);
    vec2 p = cell * 0.55;
    vec2 a = p - dir * ph * speed;
    vec2 b = p - dir * ph2 * speed + vec2(0.37, 0.61);
    float e = mix(plates(a), plates(b), w);
    float fine = mix(plates(a * 2.3), plates(b * 2.3 + 1.7), w);
    float churn = mix(vnoise(a * 1.3), vnoise(b * 1.3 + 3.1), w);
    float hot = clamp(heat * (0.64 + 0.42 * churn), 0.0, 1.0);
    vec3 molten = ramp(hot);
    molten += vec3(0.25, 0.22, 0.12) * smoothstep(0.78, 0.95, churn) * smoothstep(0.85, 1.0, heat);
    float rafts = smoothstep(0.6, 0.72, churn) * (1.0 - lake) * (1.0 - swell);
    float skin = max(max(1.0 - smoothstep(0.4, 1.02, heat), lake * (0.92 - 0.55 * uErupt)), rafts * 0.9);
    float seam = mix(0.025 + 0.2 * heat * heat, 0.05 + 0.04 * sin(uTime * 1.3 + churn * 5.0), lake);
    float crust = skin * smoothstep(seam, seam + 0.06, e) * smoothstep(0.02, 0.07 + 0.1 * heat, fine + 0.05);
    float rim = (1.0 - smoothstep(0.55, 0.8, shape)) * (1.0 - lake) * (1.0 - swell);
    crust = max(crust, rim * 0.85);
    vec3 crustCol = vec3(0.12, 0.075, 0.065) + vec3(0.08, 0.025, 0.0) * churn + vec3(0.25, 0.05, 0.0) * (1.0 - smoothstep(0.0, 0.08, e)) * heat;
    col = mix(molten, crustCol, crust);
    alpha = cover;
    add += molten * (1.0 - crust) * cover * hot * (0.05 + 0.25 * lake * max(uWarn, uErupt));
  }
  if (ember > 0.004) {
    vec2 warp = cell * 0.8 + vec2(vnoise(cell * 0.7), vnoise(cell * 0.7 + 9.0)) * 1.3;
    float crack = (1.0 - smoothstep(0.0, 0.06, plates(warp + 5.3))) * smoothstep(0.25, 0.6, vnoise(cell * 1.1 + 2.0) + ember * 0.4);
    add += vec3(1.0, 0.28 + 0.35 * ember, 0.05) * crack * ember * (1.0 - cover) * 0.85;
  }
  gl_FragColor = vec4(col * alpha + add, alpha);
}
`

/** 火山弹：一块不规则的黑石头，裂缝和边缘透着红光 */
export function drawBomb(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c
      const dy = (y - c) / c
      const a = Math.atan2(dy, dx)
      const edge = 0.72 + 0.16 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 7 + 2.1)
      const d = Math.hypot(dx, dy) / edge
      const o = (y * size + x) * 4
      if (d > 1.25) {
        img.data[o + 3] = 0
        continue
      }
      const crack = cellEdge(x / 5, y / 5, 13)
      const hot = Math.max(smooth(0.12, 0, crack) * 0.9, smooth(0.75, 1, d))
      const shade = 0.75 + 0.35 * (-dx - dy) * 0.5
      const rr = 40 * shade + (255 - 40 * shade) * hot
      const gg = 28 * shade + (120 - 28 * shade) * hot
      const bb = 24 * shade + (30 - 24 * shade) * hot
      img.data[o] = rr
      img.data[o + 1] = gg
      img.data[o + 2] = bb
      img.data[o + 3] = (d <= 1 ? 1 : smooth(1.25, 1, d) * 0.6) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
