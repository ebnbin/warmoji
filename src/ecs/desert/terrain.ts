import { SUN } from '../../data/light'
import { Rng } from '../../util/rng'
import { tileFbm } from './noise'
import { LANDMARK_KINDS, landmarkShape, shadowBox, shadowCover } from './landmarks'
import type { LandmarkKind, LandmarkShape } from './landmarks'
import type { DesertConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const DEG = Math.PI / 180
/** 沙漠地图按布景种子打散出自己的种子 */
const PLAN_SEED = 0xd35e7
/** 地形格子的边长，格：背阴与沙的松实按它铺，身体在上面按双线性插值取 */
const CELL_U = 0.25
/** 往太阳方向找挡光的沙丘，每步走多远（格） */
const MARCH_U = 0.2
/** 摆沙丘与标志物，挑不出合格的位置就放宽一点再挑，每轮最多试这么多次 */
const TRIES = 120

/** 一座新月形沙丘：脊线中点（格）、下风方向的余弦与正弦、脊线最高处高（米），两角之间的半宽与两角往下风伸出多远（米） */
export interface Dune {
  readonly x: number
  readonly y: number
  readonly c: number
  readonly s: number
  readonly h: number
  readonly half: number
  readonly sweep: number
}

/** 一样标志物：种类、中心（格）与形状；一对里的两个形状一模一样 */
export interface Landmark {
  readonly kind: LandmarkKind
  readonly x: number
  readonly y: number
  readonly shape: LandmarkShape
}

/**
 * 这一局的沙漠：只有数据，能整个发给画地面的线程。沙丘与标志物都成对，一对相隔横竖各半圈；
 * 背阴（1 是晒着太阳、0 是全在阴影里）与沙的松软（1 是松沙）按 CELL_U 的格子铺满一圈
 */
export interface DesertPlan {
  readonly sizeU: number
  readonly seed: number
  readonly meterPerU: number
  /** 盛行风吹去的方向，弧度 */
  readonly windAngle: number
  /** 朝太阳的单位方向：x、y 是地图上的水平分量，z 朝上 */
  readonly light: { readonly x: number; readonly y: number; readonly z: number }
  /** 离地每高一米，影子背着太阳往外挪多少格 */
  readonly offX: number
  readonly offY: number
  readonly stoss: number
  readonly tanRepose: number
  readonly swellM: number
  readonly swellWaves: number
  readonly patches: number
  /** 丘间的地面按两张噪声分：砾石噪声高过 gravelAt 是砾石地，盐壳噪声高过 crustAt 是盐壳 */
  readonly gravelAt: number
  readonly crustAt: number
  readonly dunes: readonly Dune[]
  readonly landmarks: readonly Landmark[]
  /** 队伍出发的地方，格：离第一样标志物几步远 */
  readonly start: Point
  readonly cols: number
  readonly cell: number
  readonly sun: Float32Array
  readonly soft: Float32Array
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 环面上的最短差：落在 [−size/2, size/2) */
export function wrapU(d: number, size: number): number {
  return d - Math.round(d / size) * size
}

/** 一座沙丘在离脊线中点 (dx, dy)（米）处的高（米）：脊线往两角压低、往下风弯，迎风坡是抛物线，背风是休止角的落沙坡 */
export function duneShape(p: DesertPlan, d: Dune, dx: number, dy: number): number {
  const u = dx * d.c + dy * d.s
  const v = -dx * d.s + dy * d.c
  const t = v / d.half
  if (t <= -1 || t >= 1) return 0
  const k = 1 - t * t
  const hc = d.h * Math.pow(k, 0.75)
  const s = u - d.sweep * t * t
  if (s >= 0) return Math.max(0, hc - s * p.tanRepose)
  const q = (-s * p.stoss) / (2 * hc)
  return q >= 1 ? 0 : hc * (1 - q * q)
}

/** (x, y) 格处最高的那座沙丘有多高，米 */
export function duneAt(p: DesertPlan, x: number, y: number): number {
  let best = 0
  const m = p.meterPerU
  for (const d of p.dunes) {
    const h = duneShape(p, d, wrapU(x - d.x, p.sizeU) * m, wrapU(y - d.y, p.sizeU) * m)
    if (h > best) best = h
  }
  return best
}

/** 丘间缓缓的起伏，米 */
export function swellAt(p: DesertPlan, x: number, y: number): number {
  const k = p.swellWaves / p.sizeU
  return (tileFbm(x * k, y * k, p.swellWaves, p.seed + 1, 3) - 0.5) * 2 * p.swellM
}

/** 地面的高，米 */
export function heightAt(p: DesertPlan, x: number, y: number): number {
  return swellAt(p, x, y) + duneAt(p, x, y)
}

/** 地面的坡度（高对水平距离的导数，都按米）：沿 x 与沿 y */
export function slopeAt(p: DesertPlan, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  const e = 0.06
  const m = 2 * e * p.meterPerU
  out.x = (heightAt(p, x + e, y) - heightAt(p, x - e, y)) / m
  out.y = (heightAt(p, x, y + e) - heightAt(p, x, y - e)) / m
  return out
}

/** 丘间地面的组成：砾石地、盐壳与薄松沙各占几成 */
export function floorAt(p: DesertPlan, x: number, y: number, out: { gravel: number; crust: number; sheet: number }): { gravel: number; crust: number; sheet: number } {
  const k = p.patches / p.sizeU
  const gn = tileFbm(x * k, y * k, p.patches, p.seed + 11, 3)
  const cn = tileFbm(x * k, y * k, p.patches, p.seed + 23, 3)
  out.gravel = smooth(p.gravelAt - 0.035, p.gravelAt + 0.035, gn)
  out.crust = smooth(p.crustAt - 0.025, p.crustAt + 0.025, cn) * (1 - out.gravel)
  out.sheet = 1 - out.gravel - out.crust
  return out
}

/** 沙丘把丘间的地面盖住了几成：高过几厘米就全是沙丘的松沙 */
export function duneCover(h: number): number {
  return smooth(0.012, 0.06, h)
}

const FLOOR = { gravel: 0, crust: 0, sheet: 0 }

/** 这里的沙有多松：沙丘上全是松沙，丘间的薄松沙半松，砾石地很实，盐壳最硬 */
export function looseAt(p: DesertPlan, x: number, y: number): number {
  const cover = duneCover(duneAt(p, x, y))
  if (cover >= 1) return 1
  const f = floorAt(p, x, y, FLOOR)
  return cover + (1 - cover) * (0.6 * f.sheet + 0.15 * f.gravel)
}

/** 格子上 (x, y) 格处双线性取值，格子首尾相接 */
export function gridAt(p: DesertPlan, a: Float32Array, x: number, y: number): number {
  const n = p.cols
  const u = x / p.cell - 0.5
  const v = y / p.cell - 0.5
  const iu = Math.floor(u)
  const iv = Math.floor(v)
  const fu = u - iu
  const fv = v - iv
  const x0 = ((iu % n) + n) % n
  const y0 = ((iv % n) + n) % n
  const x1 = (x0 + 1) % n
  const y1 = (y0 + 1) % n
  const a00 = a[y0 * n + x0]!
  const a10 = a[y0 * n + x1]!
  const a01 = a[y1 * n + x0]!
  const a11 = a[y1 * n + x1]!
  return a00 + (a10 - a00) * fu + (a01 - a00) * fv + (a00 - a10 - a01 + a11) * fu * fv
}

/** 这里晒得到几成太阳：沙丘与标志物的影子 */
export function sunAt(p: DesertPlan, x: number, y: number): number {
  return gridAt(p, p.sun, x, y)
}

/** 环面上两点的距离，格 */
function torusDist(size: number, ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(wrapU(ax - bx, size), wrapU(ay - by, size))
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 噪声在一圈里取到的值从小到大第 q 成那个：丘间的砾石地、盐壳按它切，占的比例才对 */
function quantile(k: number, period: number, seed: number, size: number, q: number): number {
  const n = 96
  const vals = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = tileFbm(((i + 0.5) / n) * size * k, ((j + 0.5) / n) * size * k, period, seed, 3)
  vals.sort()
  return vals[Math.min(n * n - 1, Math.floor(q * n * n))]!
}

/** 摆沙丘：一对一对地摆，彼此（连同对方的另一半）离得开，按高定下迎风坡与落沙坡的长 */
function placeDunes(cfg: DesertConfig, rng: Rng, windAngle: number, size: number): Dune[] {
  const dc = cfg.dunes
  const m = cfg.meterPerU
  const tanRep = Math.tan(dc.reposeDeg * DEG)
  const pairs = dc.pairs[0] + Math.floor(rng.next() * (dc.pairs[1] - dc.pairs[0] + 1))
  const out: Dune[] = []
  const lengthU = (h: number): number => ((2 * h) / dc.stossSlope + h / tanRep) / m
  for (let k = 0; k < pairs; k++) {
    const h = between(rng, dc.heightM)
    const a = windAngle + (rng.next() * 2 - 1) * dc.turnDeg * DEG
    const len = (2 * h) / dc.stossSlope + h / tanRep
    let spacing = 0.6
    let at: Point | null = null
    for (let round = 0; round < 8 && !at; round++, spacing *= 0.85) {
      for (let i = 0; i < TRIES && !at; i++) {
        const x = rng.next() * size
        const y = rng.next() * size
        const ok = out.every((d) => torusDist(size, x, y, d.x, d.y) >= spacing * (lengthU(h) + lengthU(d.h)) && torusDist(size, x + size / 2, y + size / 2, d.x, d.y) >= spacing * (lengthU(h) + lengthU(d.h)))
        if (ok) at = { x, y }
      }
    }
    const p = at ?? { x: rng.next() * size, y: rng.next() * size }
    const dune = { c: Math.cos(a), s: Math.sin(a), h, half: (dc.width * len) / 2, sweep: dc.sweep * len }
    out.push({ x: p.x, y: p.y, ...dune }, { x: (p.x + size / 2) % size, y: (p.y + size / 2) % size, ...dune })
  }
  return out
}

/** 摆标志物：挑几种，每种一对，摆在沙丘脚下或丘间，彼此至少隔 gapU 格 */
function placeLandmarks(cfg: DesertConfig, rng: Rng, windAngle: number, size: number, high: (x: number, y: number) => number): Landmark[] {
  const kinds = [...LANDMARK_KINDS]
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = kinds[i]!
    kinds[i] = kinds[j]!
    kinds[j] = t
  }
  const out: Landmark[] = []
  for (let k = 0; k < cfg.landmarks.pairs; k++) {
    const kind = kinds[k % kinds.length]!
    const shape = landmarkShape(kind, Math.floor(rng.next() * 0x7fffffff), windAngle)
    let gap = cfg.landmarks.gapU
    let at: Point | null = null
    for (let round = 0; round < 8 && !at; round++, gap *= 0.85) {
      for (let i = 0; i < TRIES && !at; i++) {
        const x = rng.next() * size
        const y = rng.next() * size
        if (high(x, y) > 0.12) continue
        const ok = out.every((l) => torusDist(size, x, y, l.x, l.y) >= gap && torusDist(size, x + size / 2, y + size / 2, l.x, l.y) >= gap)
        if (ok) at = { x, y }
      }
    }
    const p = at ?? { x: rng.next() * size, y: rng.next() * size }
    out.push({ kind, x: p.x, y: p.y, shape }, { kind, x: (p.x + size / 2) % size, y: (p.y + size / 2) % size, shape })
  }
  return out
}

/** 每个格子晒得到几成太阳：往太阳方向找比光线高的沙丘，再扣掉标志物的影子；背着太阳的陡坡自己就在阴影里 */
function sunGrid(p: DesertPlan, heights: Float32Array): Float32Array {
  const n = p.cols
  const out = new Float32Array(n * n)
  const lxy = Math.hypot(p.light.x, p.light.y)
  const sx = p.light.x / lxy
  const sy = p.light.y / lxy
  const rise = (p.light.z / lxy) * p.meterPerU
  let top = 0
  for (const d of p.dunes) top = Math.max(top, d.h)
  const reach = ((top + 2 * p.swellM) / rise) * 1.05
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * p.cell
      const y = (j + 0.5) * p.cell
      const z = heights[j * n + i]!
      let over = -Infinity
      for (let d = MARCH_U; d <= reach; d += MARCH_U) over = Math.max(over, gridAt(p, heights, x + sx * d, y + sy * d) - z - d * rise)
      out[j * n + i] = 1 - smooth(-0.004, 0.02, over)
    }
  }
  for (const l of p.landmarks) {
    const box = shadowBox(l.shape, p.offX, p.offY)
    for (let j = Math.floor((l.y + box.y0) / p.cell); j <= Math.ceil((l.y + box.y1) / p.cell); j++) {
      for (let i = Math.floor((l.x + box.x0) / p.cell); i <= Math.ceil((l.x + box.x1) / p.cell); i++) {
        const k = (((j % n) + n) % n) * n + (((i % n) + n) % n)
        const c = shadowCover(l.shape, p.offX, p.offY, (i + 0.5) * p.cell - l.x, (j + 0.5) * p.cell - l.y, p.cell * 0.5)
        out[k] = out[k]! * (1 - c)
      }
    }
  }
  return out
}

/** 出发点：离第一样标志物几步远、在丘间平地上、不压着别的标志物 */
function startNear(p: DesertPlan, rng: Rng): Point {
  const first = p.landmarks[0]!
  let best: Point = { x: first.x, y: first.y }
  let bestScore = -Infinity
  for (let k = 0; k < 48; k++) {
    const a = rng.next() * Math.PI * 2
    const d = first.shape.reach + 2.2 + rng.next() * 1.5
    const x = (((first.x + Math.cos(a) * d) % p.sizeU) + p.sizeU) % p.sizeU
    const y = (((first.y + Math.sin(a) * d) % p.sizeU) + p.sizeU) % p.sizeU
    const clear = Math.min(...p.landmarks.map((l) => torusDist(p.sizeU, x, y, l.x, l.y) - l.shape.reach))
    const score = Math.min(clear, 2) - duneAt(p, x, y) * 6
    if (score > bestScore) {
      bestScore = score
      best = { x, y }
    }
  }
  return best
}

/** 按种子生成这一局的沙漠：盛行风大体背着太阳吹，一对对的沙丘与标志物，再铺背阴与沙的松实 */
export function makePlan(cfg: DesertConfig, sizeU: number, decorSeed: number): DesertPlan {
  const seed = (decorSeed ^ PLAN_SEED) >>> 0
  const rng = new Rng(seed)
  const away = Math.atan2(-SUN.y, -SUN.x)
  const windAngle = away + (rng.next() * 2 - 1) * cfg.windSpreadDeg * DEG
  const sxy = Math.hypot(SUN.x, SUN.y)
  const elev = cfg.sunDeg * DEG
  const light = { x: (SUN.x / sxy) * Math.cos(elev), y: (SUN.y / sxy) * Math.cos(elev), z: Math.sin(elev) }
  const per = 1 / Math.tan(elev) / cfg.meterPerU
  const dunes = placeDunes(cfg, rng, windAngle, sizeU)
  const noiseSeed = Math.floor(rng.next() * 0x7fffffff)
  const patches = cfg.floor.patches
  const k = patches / sizeU
  const base = {
    sizeU,
    seed: noiseSeed,
    meterPerU: cfg.meterPerU,
    windAngle,
    light,
    offX: -(SUN.x / sxy) * per,
    offY: -(SUN.y / sxy) * per,
    stoss: cfg.dunes.stossSlope,
    tanRepose: Math.tan(cfg.dunes.reposeDeg * DEG),
    swellM: cfg.swell.heightM,
    swellWaves: cfg.swell.waves,
    patches,
    gravelAt: quantile(k, patches, noiseSeed + 11, sizeU, 1 - cfg.floor.gravel),
    crustAt: quantile(k, patches, noiseSeed + 23, sizeU, 1 - cfg.floor.crust),
    dunes,
    landmarks: [] as Landmark[],
    start: { x: sizeU / 2, y: sizeU / 2 },
    cols: Math.round(sizeU / CELL_U),
    cell: CELL_U,
    sun: new Float32Array(0),
    soft: new Float32Array(0),
  }
  const landmarks = placeLandmarks(cfg, rng, windAngle, sizeU, (x, y) => duneAt(base, x, y))
  const n = base.cols
  const heights = new Float32Array(n * n)
  const soft = new Float32Array(n * n)
  const draft = { ...base, landmarks }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * CELL_U
      const y = (j + 0.5) * CELL_U
      heights[j * n + i] = heightAt(draft, x, y)
      soft[j * n + i] = looseAt(draft, x, y)
    }
  }
  const sun = sunGrid(draft, heights)
  const plan = { ...draft, sun, soft }
  return { ...plan, start: startNear(plan, rng) }
}

const cache = new WeakMap<DesertConfig, { readonly seed: number; readonly plan: DesertPlan }>()

/** 同一个种子与配置只生成一次：视图排版时与模拟开局时各要一次 */
export function desertPlanFor(cfg: DesertConfig, sizeU: number, decorSeed: number): DesertPlan {
  const hit = cache.get(cfg)
  if (hit?.seed === decorSeed && hit.plan.sizeU === sizeU) return hit.plan
  const plan = makePlan(cfg, sizeU, decorSeed)
  cache.set(cfg, { seed: decorSeed, plan })
  return plan
}
