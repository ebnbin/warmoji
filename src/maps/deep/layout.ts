import { FRAME_U, SPAWN_CLEAR_U, UNIT } from '../../util/units.ts'
import { fbm, valueNoise } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的谷底按这么细的格子算距离场，格 */
export const BASIN_CELL_U = 0.25
/** 壁脚、堆脚、坎沿往里留出这么宽（格）不能走：身子不贴进岩壁、不悬在坎沿上 */
const EDGE_CLEAR_U = 0.15
/** 两侧壁脚与两头交汇的内角按这么大（格）磨圆 */
const CORNER_U = 2.5
/** 生成不出合格的谷底就换一组随机数重来，最多这么多次 */
const TRIES = 40
/** 陡坎沿上、岩堆脚下每隔这么远（格）一处出怪的地标，口子的半径（格） */
const MARK_STEP_U = 2.5
const MARK_R_U = 1
/** 地标往里这么远（格）还得能站：怪从那里落进谷底 */
const MARK_IN_U = 1.2
/** 鲸骨的头骨占鲸长的比例、头骨最宽处的半宽占鲸长的比例 */
export const SKULL_FRAC = 0.24
export const SKULL_HALF = 0.085

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
/** 多项式平滑取小：两者相差 k 以内时圆滑过渡 */
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return b + (a - b) * h - k * h * (1 - h)
}

/** 分形噪声拉开到 [−1, 1]：它大多挤在中间 */
export function swing(x: number, y: number, seed: number, octaves: number): number {
  return Math.max(-1, Math.min(1, (fbm(x, y, seed, octaves) - 0.5) * 2.6))
}

/** 种子打散：相邻的种子也生成很不一样的谷底 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x5ea1d07b) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 本地坐标：a 横过峡谷、从一侧岩壁那条地图边量起，b 顺着峡谷、从上游岩堆那条地图边量起，都以格计、在 [0, size] 里。地图坐标 = o + a·n + b·t */
export interface Frame {
  readonly ox: number
  readonly oy: number
  readonly nx: number
  readonly ny: number
  readonly tx: number
  readonly ty: number
}

export interface Local {
  a: number
  b: number
}

/** 峡谷顺着哪条轴、往哪头下去（上、右、下、左），mirror 让两侧岩壁换个边；本地的 [0, size]² 落在方框正中 */
function frameOf(dir: number, mirror: boolean, size: number): Frame {
  const t = [
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
  ][dir]!
  const n = mirror ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x }
  const c = FRAME_U / 2
  return { ox: c - (size / 2) * (n.x + t.x), oy: c - (size / 2) * (n.y + t.y), nx: n.x, ny: n.y, tx: t.x, ty: t.y }
}

export function toLocal(f: Frame, x: number, y: number, out: Local): Local {
  const dx = x - f.ox
  const dy = y - f.oy
  out.a = dx * f.nx + dy * f.ny
  out.b = dx * f.tx + dy * f.ty
  return out
}

export function toMap(f: Frame, a: number, b: number): Point {
  return { x: f.ox + f.nx * a + f.tx * b, y: f.oy + f.ny * a + f.ty * b }
}

/** 一条弯弯曲曲的边：离它那条地图边 inset 格，按噪声弯出最多 bend（波长 wave） */
export interface Edge {
  readonly inset: number
  readonly bend: number
  readonly wave: number
  readonly seed: number
}

/**
 * 峡谷的边，本地坐标，格：两侧壁脚（low 在 a 小的一边，high 在 a 大的一边）、上游的堆脚、下游的坎沿；
 * 两侧岩壁各多高（米）、从壁脚到壁顶多宽（格），岩堆多高、多宽、石块多大，坎下的坡起头每格降多少米；谷底的起伏
 */
export interface Edges {
  readonly size: number
  readonly seed: number
  readonly floor: DeepConfig['floor']
  readonly low: Edge
  readonly high: Edge
  readonly rubble: Edge
  readonly lip: Edge
  readonly wallM: readonly [number, number]
  readonly wallU: readonly [number, number]
  readonly rubbleM: number
  readonly rubbleU: number
  readonly blockU: readonly [number, number]
  readonly dropM: number
}

function bent(e: Edge, u: number): number {
  return e.inset + e.bend * swing(u / e.wave + 3.1, 1.7, e.seed, 3)
}

/** 本地 (a, b) 离四条边各有多远（格），往谷底里为正：low 壁脚、high 壁脚、上游堆脚、下游坎沿 */
export interface Reach {
  low: number
  high: number
  rubble: number
  lip: number
}

export function reachOf(e: Edges, a: number, b: number, out: Reach): Reach {
  out.low = a - bent(e.low, b)
  out.high = e.size - bent(e.high, b) - a
  out.rubble = b - bent(e.rubble, a)
  out.lip = e.size - bent(e.lip, a) - b
  return out
}

const R: Reach = { low: 0, high: 0, rubble: 0, lip: 0 }

/** 在谷底里多深，格，谷底里为正：四条边取平滑的最小，内角磨圆 */
export function floorDepth(e: Edges, a: number, b: number): number {
  reachOf(e, a, b, R)
  return smin(smin(R.low, R.high, CORNER_U), smin(R.rubble, R.lip, CORNER_U), CORNER_U)
}

/** 一块大石头：中心（地图坐标，格）、底半径（格）、多高（米）；轮廓按方位角起伏 */
export interface Boulder {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly seed: number
}

/** 大石头在 (x, y) 那个方位上的半径，格 */
export function boulderRadius(s: Boulder, x: number, y: number): number {
  const a = Math.atan2(y - s.y, x - s.x)
  return s.r * (1 + 0.24 * (valueNoise(Math.cos(a) * 1.4 + 9, Math.sin(a) * 1.4 + 9, s.seed) - 0.5) * 2)
}

/** (x, y) 在大石头里多深，占它那个方位半径的比例，石头外为负 */
export function inBoulder(s: Boulder, x: number, y: number): number {
  const far = s.r * 1.3
  if (Math.abs(x - s.x) > far || Math.abs(y - s.y) > far) return -1
  const d = Math.hypot(x - s.x, y - s.y)
  if (d > far) return -1
  return 1 - d / boulderRadius(s, x, y)
}

/** 一副鲸骨：头尖（地图坐标，格），从头往尾的单位方向，鲸长（格），脊椎往一边弯的幅度（占鲸长，带符号），画骨头用的种子 */
export interface Whale {
  readonly x: number
  readonly y: number
  readonly dx: number
  readonly dy: number
  readonly length: number
  readonly bend: number
  readonly seed: number
}

/** 鲸骨上的坐标：u 从头尖往尾量，v 横着量、扣掉脊椎的弯，都以格计 */
export function whaleUV(w: Whale, x: number, y: number, out: Local): Local {
  const px = x - w.x
  const py = y - w.y
  const u = px * w.dx + py * w.dy
  const L = w.length
  const q = clamp01((u - SKULL_FRAC * L) / ((1 - SKULL_FRAC) * L))
  out.a = u
  out.b = px * -w.dy + py * w.dx - w.bend * L * 4 * q * (1 - q)
  return out
}

/** 头骨在 u 处的半宽，格：前面的吻部窄，后面的脑颅宽、收成圆头；头骨以外为负 */
export function skullHalf(w: Whale, u: number): number {
  const sk = SKULL_FRAC * w.length
  if (u < 0 || u > sk) return -1
  const ws = SKULL_HALF * w.length
  const back = 0.8 * sk
  if (u <= back) return ws * (0.3 + 0.7 * Math.sqrt(u / back))
  return ws * Math.sqrt(Math.max(0, 1 - ((u - back) / (sk - back)) ** 2))
}

const UV: Local = { a: 0, b: 0 }

/** (x, y) 在不在头骨里 */
export function inSkull(w: Whale, x: number, y: number): boolean {
  whaleUV(w, x, y, UV)
  return Math.abs(UV.b) <= skullHalf(w, UV.a)
}

/** 一处冷泉：中心（地图坐标，格）、半径（格） */
export interface Seep {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly seed: number
}

/**
 * 按种子生成的谷底，地图坐标以格计：地图是 size 见方的方形；边、能走的地面（像素）、开局站位（方框正中）；
 * 大石头、鲸骨、冷泉；出怪口用的地标（像素）：陡坎沿、岩堆脚、两头合起来、鲸骨边、冷泉
 */
export interface DeepPlan {
  readonly seed: number
  readonly size: number
  readonly frame: Frame
  readonly edges: Edges
  readonly boulders: readonly Boulder[]
  readonly whale: Whale
  readonly seeps: readonly Seep[]
  readonly basin: Basin
  readonly start: Point
  readonly marks: Readonly<Record<'abyss' | 'rubble' | 'ends' | 'bones' | 'seep', readonly Landmark[]>>
}

const L0: Local = { a: 0, b: 0 }

/** 地图坐标 (x, y)（格）能不能走：在谷底里、不在大石头里、不在头骨里 */
function openAt(f: Frame, e: Edges, boulders: readonly Boulder[], whale: Whale | null, x: number, y: number): boolean {
  toLocal(f, x, y, L0)
  if (floorDepth(e, L0.a, L0.b) <= EDGE_CLEAR_U) return false
  for (const s of boulders) if (inBoulder(s, x, y) > 0) return false
  return !whale || !inSkull(whale, x, y)
}

function edgesOf(cfg: DeepConfig, rng: Rng, seed: number): Edges {
  const w = cfg.walls
  const r = cfg.rubble
  const l = cfg.lip
  const side = (inset: readonly [number, number], bend: number, wave: number, k: number): Edge => ({ inset: between(rng, inset), bend, wave, seed: seed + k * 101 })
  return {
    size: cfg.sizeU,
    seed,
    floor: cfg.floor,
    low: side(w.insetU, w.bendU, w.waveU, 1),
    high: side(w.insetU, w.bendU, w.waveU, 2),
    rubble: side(r.insetU, r.bendU, r.waveU, 3),
    lip: side(l.insetU, l.bendU, l.waveU, 4),
    wallM: [between(rng, w.heightM), between(rng, w.heightM)],
    wallU: [between(rng, w.slopeU), between(rng, w.slopeU)],
    rubbleM: between(rng, r.heightM),
    rubbleU: r.slopeU,
    blockU: r.blockU,
    dropM: l.dropM,
  }
}

/** 大石头：一部分靠着壁脚（从岩壁上滚落的），其余散在谷底；离开局站位、彼此都隔开 */
function bouldersOf(cfg: DeepConfig, rng: Rng, f: Frame, e: Edges, start: Point): Boulder[] {
  const c = cfg.boulders
  const n = rng.int(c.count[0], c.count[1])
  const out: Boulder[] = []
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const r = between(rng, c.radiusU)
    const byWall = rng.next() < c.wallShare
    let a: number
    let b = e.size * (0.15 + 0.7 * rng.next())
    if (byWall) {
      const low = rng.next() < 0.5
      reachOf(e, e.size / 2, b, R)
      a = low ? e.size / 2 - R.low + r * (0.2 + 0.5 * rng.next()) : e.size / 2 + R.high - r * (0.2 + 0.5 * rng.next())
    } else {
      a = e.size * (0.15 + 0.7 * rng.next())
      b = e.size * (0.15 + 0.7 * rng.next())
    }
    if (!byWall && floorDepth(e, a, b) < r + 1.2) continue
    const p = toMap(f, a, b)
    if (Math.hypot(p.x - start.x, p.y - start.y) < c.clearU + r) continue
    if (out.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r + r + c.gapU)) continue
    out.push({ x: p.x, y: p.y, r, h: between(rng, c.heightM), seed: rng.int(1, 1 << 30) })
  }
  return out
}

/** 鲸骨横着占多宽：肋骨张开到脊椎两侧鲸长的这么多 */
export const WHALE_HALF = 0.2

/** 离鲸骨的脊椎线多远，格：头尖到尾尖那一段 */
export function fromWhale(w: Whale, x: number, y: number): number {
  const px = x - w.x
  const py = y - w.y
  const u = Math.max(0, Math.min(w.length, px * w.dx + py * w.dy))
  return Math.hypot(px - w.dx * u, py - w.dy * u)
}

/** 鲸骨：大致顺着峡谷躺在谷底里，整副骨头都在谷底以内；头骨离开局站位 clearU 格以上，骨头不压开局站位，也不压大石头 */
function whaleOf(cfg: DeepConfig, rng: Rng, f: Frame, e: Edges, start: Point, boulders: readonly Boulder[]): Whale | null {
  const L = between(rng, cfg.whale.lengthM) / cfg.meterPerU
  const along = Math.atan2(f.ty, f.tx)
  for (let tries = 0; tries < 120; tries++) {
    const ang = along + (rng.next() * 2 - 1) * 0.6 + (rng.next() < 0.5 ? Math.PI : 0)
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const c = toMap(f, e.size * (0.2 + 0.6 * rng.next()), e.size * (0.2 + 0.6 * rng.next()))
    const w: Whale = { x: c.x - (dx * L) / 2, y: c.y - (dy * L) / 2, dx, dy, length: L, bend: (rng.next() * 2 - 1) * 0.06, seed: rng.int(1, 1 << 30) }
    const skull = { x: w.x + dx * SKULL_FRAC * L * 0.5, y: w.y + dy * SKULL_FRAC * L * 0.5 }
    if (Math.hypot(skull.x - start.x, skull.y - start.y) < cfg.whale.clearU + SKULL_FRAC * L * 0.5) continue
    if (fromWhale(w, start.x, start.y) < SPAWN_CLEAR_U + WHALE_HALF * L) continue
    let fits = true
    for (let u = 0; u <= L && fits; u += 0.75) {
      for (const side of [-1, 0, 1]) {
        const x = w.x + dx * u - dy * side * WHALE_HALF * L
        const y = w.y + dy * u + dx * side * WHALE_HALF * L
        toLocal(f, x, y, L0)
        if (floorDepth(e, L0.a, L0.b) < 0.8 || boulders.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 0.6)) fits = false
      }
    }
    if (fits) return w
  }
  return null
}

function seepsOf(cfg: DeepConfig, rng: Rng, f: Frame, e: Edges, start: Point, boulders: readonly Boulder[], whale: Whale): Seep[] {
  const c = cfg.seeps
  const n = rng.int(c.count[0], c.count[1])
  const out: Seep[] = []
  for (let tries = 0; out.length < n && tries < 120; tries++) {
    const r = between(rng, c.radiusU)
    const a = e.size * (0.15 + 0.7 * rng.next())
    const b = e.size * (0.15 + 0.7 * rng.next())
    if (floorDepth(e, a, b) < r + 1.5) continue
    const p = toMap(f, a, b)
    if (Math.hypot(p.x - start.x, p.y - start.y) < c.clearU + r) continue
    if (fromWhale(whale, p.x, p.y) < WHALE_HALF * whale.length + r + 1) continue
    if (boulders.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r + r + 1)) continue
    if (out.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r + r + 3)) continue
    out.push({ x: p.x, y: p.y, r, seed: rng.int(1, 1 << 30) })
  }
  return out
}

/** 沿一条边每隔 MARK_STEP_U 格取一处地标（像素）：边上那一点往谷底里 MARK_IN_U 格还得能站；朝谷底里 */
function edgeMarks(f: Frame, basin: Basin, size: number, along: (u: number) => Local | null, inward: Local): Landmark[] {
  const out: Landmark[] = []
  const n = { x: f.nx * inward.a + f.tx * inward.b, y: f.ny * inward.a + f.ty * inward.b }
  for (let u = MARK_STEP_U / 2; u < size; u += MARK_STEP_U) {
    const at = along(u)
    if (!at) continue
    const p = toMap(f, at.a, at.b)
    const ix = (p.x + n.x * MARK_IN_U) * UNIT
    const iy = (p.y + n.y * MARK_IN_U) * UNIT
    if (roomAt(basin, ix, iy) < 0.5 * UNIT) continue
    out.push({ x: p.x * UNIT, y: p.y * UNIT, r: MARK_R_U * UNIT, nx: n.x, ny: n.y })
  }
  return out
}

/** 鲸骨边上几处：肋骨两侧与尾巴那头，食腐的从骨头底下钻出来 */
function boneMarks(w: Whale, basin: Basin): Landmark[] {
  const L = w.length
  const spots = [
    { u: 0.38, v: 0.17 },
    { u: 0.38, v: -0.17 },
    { u: 0.62, v: 0.12 },
    { u: 0.62, v: -0.12 },
    { u: 0.9, v: 0 },
  ]
  const out: Landmark[] = []
  for (const s of spots) {
    const x = (w.x + w.dx * s.u * L - w.dy * s.v * L) * UNIT
    const y = (w.y + w.dy * s.u * L + w.dx * s.v * L) * UNIT
    if (roomAt(basin, x, y) < 0.6 * UNIT) continue
    out.push({ x, y, r: 0.8 * UNIT, nx: 0, ny: 0 })
  }
  return out
}

/** 生成一次：边、大石头、鲸骨、冷泉、能走的地面与地标；不合格返回 null */
function attempt(cfg: DeepConfig, seed: number): DeepPlan | null {
  const rng = new Rng(seed)
  const size = cfg.sizeU
  const frame = frameOf(rng.int(0, 3), rng.next() < 0.5, size)
  const edges = edgesOf(cfg, rng, seed)
  const start = { x: FRAME_U / 2, y: FRAME_U / 2 }
  const boulders = bouldersOf(cfg, rng, frame, edges, start)
  const whale = whaleOf(cfg, rng, frame, edges, start, boulders)
  if (!whale) return null
  const seeps = seepsOf(cfg, rng, frame, edges, start, boulders, whale)
  if (seeps.length < cfg.seeps.count[0]) return null
  const o = (FRAME_U - size) / 2
  const cell = BASIN_CELL_U * UNIT
  const n = Math.round(size / BASIN_CELL_U)
  const basin = makeBasin((x, y) => openAt(frame, edges, boulders, whale, x / UNIT, y / UNIT), o * UNIT, o * UNIT, n, n, cell, { x: start.x * UNIT, y: start.y * UNIT }, cfg.neckU * UNIT)
  let open = 0
  for (const v of basin.room) if (v > 0) open++
  const area = open * BASIN_CELL_U * BASIN_CELL_U
  if (area < cfg.areaU2[0] || area > cfg.areaU2[1]) return null
  if (roomAt(basin, start.x * UNIT, start.y * UNIT) < SPAWN_CLEAR_U * UNIT) return null
  const e = edges
  const abyss = edgeMarks(frame, basin, size, (u) => (floorDepth(e, u, size - bent(e.lip, u) - 0.5) > 0 ? { a: u, b: size - bent(e.lip, u) } : null), { a: 0, b: -1 })
  const rubble = edgeMarks(frame, basin, size, (u) => (floorDepth(e, u, bent(e.rubble, u) + 0.5) > 0 ? { a: u, b: bent(e.rubble, u) } : null), { a: 0, b: 1 })
  if (abyss.length < 3 || rubble.length < 2) return null
  const bones = boneMarks(whale, basin)
  if (bones.length < 2) return null
  return {
    seed,
    size,
    frame,
    edges,
    boulders,
    whale,
    seeps,
    basin,
    start,
    marks: {
      abyss,
      rubble,
      ends: [...abyss, ...rubble],
      bones,
      seep: seeps.map((s) => ({ x: s.x * UNIT, y: s.y * UNIT, r: s.r * UNIT, nx: 0, ny: 0 })),
    },
  }
}

/** 按种子生成谷底：不合格就换一组随机数，一直不合格是参数写错了 */
export function deepPlan(cfg: DeepConfig, seed: number): DeepPlan {
  for (let k = 0; k < TRIES; k++) {
    const plan = attempt(cfg, scramble(seed + k * 7919))
    if (plan) return plan
  }
  throw new Error(`深海的谷底按种子 ${seed} 换了 ${TRIES} 组随机数都生成不出来`)
}

/** 壁面的剖面：出了壁脚、占壁宽 t 处升到壁高的多少；中间一级级的岩架，壁顶以外的台地再慢慢往上 */
function wallShape(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1 + (t - 1) * 0.08
  const s = t * t * (3 - 2 * t)
  const k = t * 3
  const terrace = (Math.floor(k) + clamp01((k - Math.floor(k) - 0.55) / 0.45)) / 3
  return s * 0.55 + terrace * 0.45
}

/** 岩堆里一块块石头：最近的那块石头顶在这里多高，占石块高的比例 */
function blocks(x: number, y: number, size: number, seed: number): number {
  const gx = x / size
  const gy = y / size
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  let best = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const px = cx + valueNoise(cx * 7.13, cy * 3.71, seed)
      const py = cy + valueNoise(cx * 2.91, cy * 8.37, seed + 5)
      const rr = 0.55 + 0.35 * valueNoise(cx * 5.3, cy * 1.9, seed + 9)
      const d = Math.max(Math.abs(gx - px), Math.abs(gy - py) * 0.85) / rr
      if (d < 1) best = Math.max(best, Math.sqrt(1 - d * d) * (0.6 + 0.4 * valueNoise(cx * 1.7, cy * 4.1, seed + 13)))
    }
  }
  return best
}

/**
 * (x, y)（地图坐标，格）处的海底高出开局站位多少米：谷底按噪声起伏、往下游慢慢低下去；出了壁脚是岩壁、壁顶外是台地，
 * 出了堆脚是一块块石头堆起的岩堆，出了坎沿是越来越陡、没进黑暗的坡；大石头鼓起一块。鲸骨、冷泉这类细节由画地面的另算
 */
export function seabedM(plan: DeepPlan, x: number, y: number): number {
  const e = plan.edges
  toLocal(plan.frame, x, y, L0)
  const a = L0.a
  const b = L0.b
  reachOf(e, a, b, R)
  const fl = e.floor
  let z = fl.reliefM * swing(a / fl.waveU + 0.3, b / fl.waveU + 1.1, e.seed + 7, 3) - fl.tiltM * (b - e.size / 2)
  const rock = 0.35 * swing(a / 1.3, b / 1.3, e.seed + 17, 3)
  const lowRise = e.wallM[0] * wallShape(-R.low / e.wallU[0])
  const highRise = e.wallM[1] * wallShape(-R.high / e.wallU[1])
  const pile = R.rubble < 0 ? e.rubbleM * Math.min(1, (-R.rubble / e.rubbleU) ** 0.8) * (0.55 + 0.45 * blocks(a, b, (e.blockU[0] + e.blockU[1]) * 0.5, e.seed + 23)) : 0
  const rise = Math.max(lowRise, highRise, pile)
  if (rise > 0) z += rise + rock * Math.min(1, rise)
  if (R.lip < 0) {
    const d = -R.lip
    z -= e.dropM * d * (1 + d / 5)
  }
  for (const s of plan.boulders) {
    const k = inBoulder(s, x, y)
    if (k > 0) z = Math.max(z, s.h * Math.pow(1 - (1 - k) * (1 - k), 0.55) + rock * 0.4)
  }
  return z
}
