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
/** 剖面 (1 − t²)² 最陡处的坡度是高除以半长再乘这个数 */
const BUMP_SLOPE = 8 / (3 * Math.sqrt(3))

/** 一团沙包：中心相对沙丘中心顺风、横风的偏移（米），最高处多高（米），迎风、背风的半长与横风的半宽（米） */
export interface Lobe {
  readonly du: number
  readonly dv: number
  readonly h: number
  readonly back: number
  readonly front: number
  readonly half: number
}

/** 一座沙丘：中心（格）、下风方向的余弦与正弦、几团沙包、伸出中心多远（格）、最高处多高（米） */
export interface Dune {
  readonly x: number
  readonly y: number
  readonly c: number
  readonly s: number
  readonly lobes: readonly Lobe[]
  readonly reach: number
  readonly top: number
}

/** 一样标志物：种类、中心（格）与形状；一对里的两个形状一模一样 */
export interface Landmark {
  readonly kind: LandmarkKind
  readonly x: number
  readonly y: number
  readonly shape: LandmarkShape
}

/**
 * 这一局的沙漠：只有数据，能整个发给画地面的线程。沙丘与标志物都成对，一对相隔横竖各半圈，起伏与沙的松实也按同样的平移对称，
 * 成对的两处连周围的沙地都一模一样；晒得到几成太阳（平地为 1、阴影里为 0）与沙的松软（1 是松沙）按 CELL_U 的格子铺满一圈
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
  readonly swellM: number
  readonly swellWaves: number
  /** 丘间的沙最实与最松各是多松，一圈里成片起伏几次 */
  readonly flatLoose: readonly [number, number]
  readonly flatPatches: number
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

/** 成对对称的噪声：按 (x − y, x + y) 取一圈有 waves 个格点的噪声，横竖各挪半圈不变 */
export function twinFbm(p: DesertPlan, x: number, y: number, waves: number, seed: number, octaves: number): number {
  const k = waves / p.sizeU
  return tileFbm((x - y) * k, (x + y) * k, waves, seed, octaves)
}

const GRAD = { h: 0, x: 0, y: 0 }

/**
 * (x, y) 格处沙丘的高（米）与坡度（高对水平距离，米/米）：每团沙包是迎风长、背风短的圆顶，剖面 (1 − r²)² 处处圆滑；
 * 各团按四次方合起来，两团之间的鞍部比两边的顶低，又没有折痕
 */
export function duneGrad(p: DesertPlan, x: number, y: number, out: { h: number; x: number; y: number }): { h: number; x: number; y: number } {
  const m = p.meterPerU
  let sum = 0
  let gx = 0
  let gy = 0
  for (const d of p.dunes) {
    const ex = wrapU(x - d.x, p.sizeU)
    const ey = wrapU(y - d.y, p.sizeU)
    if (ex * ex + ey * ey >= d.reach * d.reach) continue
    const u0 = (ex * d.c + ey * d.s) * m
    const v0 = (-ex * d.s + ey * d.c) * m
    for (const l of d.lobes) {
      const u = u0 - l.du
      const v = v0 - l.dv
      const len = u < 0 ? l.back : l.front
      const r2 = (u / len) ** 2 + (v / l.half) ** 2
      if (r2 >= 1) continue
      const k = 1 - r2
      const h = l.h * k * k
      const fall = -4 * l.h * k
      const hu = (fall * u) / (len * len)
      const hv = (fall * v) / (l.half * l.half)
      const h3 = h * h * h
      sum += h3 * h
      gx += h3 * (hu * d.c - hv * d.s)
      gy += h3 * (hu * d.s + hv * d.c)
    }
  }
  if (sum <= 0) {
    out.h = 0
    out.x = 0
    out.y = 0
    return out
  }
  const top = Math.sqrt(Math.sqrt(sum))
  const t3 = top * top * top
  out.h = top
  out.x = gx / t3
  out.y = gy / t3
  return out
}

/** (x, y) 格处沙丘有多高，米 */
export function duneAt(p: DesertPlan, x: number, y: number): number {
  return duneGrad(p, x, y, GRAD).h
}

/** 丘间缓缓的起伏，米 */
export function swellAt(p: DesertPlan, x: number, y: number): number {
  return (twinFbm(p, x, y, p.swellWaves, p.seed + 1, 3) - 0.5) * 2 * p.swellM
}

/** 地面的高，米 */
export function heightAt(p: DesertPlan, x: number, y: number): number {
  return swellAt(p, x, y) + duneAt(p, x, y)
}

/** 地面的坡度（高对水平距离的导数，都按米）：沙丘按解析式，起伏左右各取一点 */
export function slopeAt(p: DesertPlan, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  const e = 0.06
  const m = 2 * e * p.meterPerU
  duneGrad(p, x, y, GRAD)
  out.x = GRAD.x + (swellAt(p, x + e, y) - swellAt(p, x - e, y)) / m
  out.y = GRAD.y + (swellAt(p, x, y + e) - swellAt(p, x, y - e)) / m
  return out
}

/** 丘间的沙有多松：在 flatLoose 的范围里成片起伏 */
export function flatLooseAt(p: DesertPlan, x: number, y: number): number {
  const n = twinFbm(p, x, y, p.flatPatches, p.seed + 11, 3)
  return p.flatLoose[0] + (p.flatLoose[1] - p.flatLoose[0]) * smooth(0.3, 0.7, n)
}

/** 沙丘把丘间的地面盖住了几成：高过几厘米就全是沙丘的松沙 */
export function duneCover(h: number): number {
  return smooth(0.012, 0.06, h)
}

/** 这里的沙有多松：沙丘上全是松沙，丘间成片地松一些、实一些 */
export function looseAt(p: DesertPlan, x: number, y: number): number {
  const cover = duneCover(duneAt(p, x, y))
  return cover + (1 - cover) * flatLooseAt(p, x, y)
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

/** 这里晒得到几成太阳：背着太阳的坡斜着受光少，再扣掉沙丘与标志物的影子 */
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

/** 一座沙丘的几团沙包：横着风排开，中间那团最高，两头矮一点、往下风偏一点，连成一道微弯的缓丘；相邻两团隔它们半宽之和的一半多一点 */
function lobesOf(cfg: DesertConfig, rng: Rng, top: number): Lobe[] {
  const dc = cfg.dunes
  const n = dc.lobes[0] + Math.floor(rng.next() * (dc.lobes[1] - dc.lobes[0] + 1))
  const out: Lobe[] = []
  let v = 0
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    const h = top * (1 - 0.35 * f * f) * (0.88 + 0.12 * rng.next())
    const back = (BUMP_SLOPE * h) / dc.stossSlope
    const front = (BUMP_SLOPE * h) / dc.leeSlope
    const half = (dc.width * (back + front)) / 2
    if (i > 0) v += (out[i - 1]!.half + half) * 0.55
    out.push({ du: f * f * front * 0.5 + (rng.next() * 2 - 1) * front * 0.15, dv: v, h, back, front, half })
  }
  return out.map((l) => ({ ...l, dv: l.dv - v / 2 }))
}

/** 摆沙丘：一对一对地摆，彼此（连同对方的另一半）离得开 */
function placeDunes(cfg: DesertConfig, rng: Rng, windAngle: number, size: number): Dune[] {
  const dc = cfg.dunes
  const m = cfg.meterPerU
  const pairs = dc.pairs[0] + Math.floor(rng.next() * (dc.pairs[1] - dc.pairs[0] + 1))
  const out: Dune[] = []
  for (let k = 0; k < pairs; k++) {
    const a = windAngle + (rng.next() * 2 - 1) * dc.turnDeg * DEG
    const lobes = lobesOf(cfg, rng, between(rng, dc.heightM))
    const reach = Math.max(...lobes.map((l) => Math.hypot(Math.abs(l.du) + Math.max(l.back, l.front), Math.abs(l.dv) + l.half))) / m
    let spacing = 0.75
    let at: Point | null = null
    for (let round = 0; round < 8 && !at; round++, spacing *= 0.85) {
      for (let i = 0; i < TRIES && !at; i++) {
        const x = rng.next() * size
        const y = rng.next() * size
        const ok = out.every((d) => torusDist(size, x, y, d.x, d.y) >= spacing * (reach + d.reach) && torusDist(size, x + size / 2, y + size / 2, d.x, d.y) >= spacing * (reach + d.reach))
        if (ok) at = { x, y }
      }
    }
    const p = at ?? { x: rng.next() * size, y: rng.next() * size }
    const dune = { c: Math.cos(a), s: Math.sin(a), lobes, reach, top: Math.max(...lobes.map((l) => l.h)) }
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
        if (high(x, y) > 0.08) continue
        const ok = out.every((l) => torusDist(size, x, y, l.x, l.y) >= gap && torusDist(size, x + size / 2, y + size / 2, l.x, l.y) >= gap)
        if (ok) at = { x, y }
      }
    }
    const p = at ?? { x: rng.next() * size, y: rng.next() * size }
    out.push({ kind, x: p.x, y: p.y, shape }, { kind, x: (p.x + size / 2) % size, y: (p.y + size / 2) % size, shape })
  }
  return out
}

const SLOPE = { x: 0, y: 0 }

/** 每个格子晒得到几成太阳：背着太阳的坡按斜射少受的光算，往太阳方向找比光线高的地面，再扣掉标志物的影子 */
function sunGrid(p: DesertPlan, heights: Float32Array): Float32Array {
  const n = p.cols
  const out = new Float32Array(n * n)
  const L = p.light
  const lxy = Math.hypot(L.x, L.y)
  const sx = L.x / lxy
  const sy = L.y / lxy
  const rise = (L.z / lxy) * p.meterPerU
  let top = 0
  for (const d of p.dunes) top = Math.max(top, d.top)
  const reach = ((top + 2 * p.swellM) / rise) * 1.05
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * p.cell
      const y = (j + 0.5) * p.cell
      const z = heights[j * n + i]!
      let over = -Infinity
      for (let d = MARCH_U; d <= reach; d += MARCH_U) over = Math.max(over, gridAt(p, heights, x + sx * d, y + sy * d) - z - d * rise)
      slopeAt(p, x, y, SLOPE)
      const lit = Math.max(0, -SLOPE.x * L.x - SLOPE.y * L.y + L.z) / Math.sqrt(SLOPE.x * SLOPE.x + SLOPE.y * SLOPE.y + 1) / L.z
      out[j * n + i] = Math.min(1, lit) * (1 - smooth(-0.004, 0.02, over))
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

/** 按种子生成这一局的沙漠：盛行风大体背着太阳吹，一对对的沙丘与标志物，再铺晒到的太阳与沙的松实 */
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
  const base = {
    sizeU,
    seed: Math.floor(rng.next() * 0x7fffffff),
    meterPerU: cfg.meterPerU,
    windAngle,
    light,
    offX: -(SUN.x / sxy) * per,
    offY: -(SUN.y / sxy) * per,
    swellM: cfg.swell.heightM,
    swellWaves: cfg.swell.waves,
    flatLoose: cfg.flats.loose,
    flatPatches: cfg.flats.patches,
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
