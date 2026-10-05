import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { NexusConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 生成不出合格的大厅就换一组随机数重来，最多这么多次 */
const TRIES = 40
/** 立柱、全息台、检修口离幕墙内侧的玻璃地面、离电梯井至少再空出这么多格，走得过去 */
const WALK_U = 1.6
/** 电梯井在墙中点两边最多挪这么多格 */
const CORE_SHIFT_U = 3
/** 检修口两两至少隔这么多格，离开局空地、立柱、全息台至少这么多格 */
const HATCH_APART_U = 7
const HATCH_CLEAR_U = 1.5
/** 全息台两两至少隔这么多格 */
const PEDESTAL_APART_U = 6
/** 门线两侧的空地与门线两头每一点离障碍至少这么多格 */
const APRON_ROOM_U = 0.45
/** 门的中点离开局空地、检修口、电梯门至少多远，格 */
const WARP_PLAZA_U = 1.5
const WARP_HATCH_U = 2
const WARP_DOOR_U = 3.5

const SQRT1_2 = Math.SQRT1_2

/** 种子打散：相邻的种子也生成很不一样的大厅 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x2f6b9e13) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 大厅：幕墙内侧围出的外接方形 [x0, x1] × [y0, y1]，四个角斜切 cut，格 */
export interface Hall {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly cut: number
}

/** (x, y)（格）离幕墙内侧多远，厅里为正，格 */
export function hallRoom(h: Hall, x: number, y: number): number {
  const w = x - h.x0
  const e = h.x1 - x
  const n = y - h.y0
  const s = h.y1 - y
  return Math.min(w, e, n, s, (w + n - h.cut) * SQRT1_2, (e + n - h.cut) * SQRT1_2, (w + s - h.cut) * SQRT1_2, (e + s - h.cut) * SQRT1_2)
}

/** 顶到天花板的圆立柱，格 */
export interface Pillar {
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 全息台上投出的东西：地球仪、双螺旋、楼群模型 */
export type HoloKind = 'globe' | 'helix' | 'towers'
const HOLOS: readonly HoloKind[] = ['globe', 'helix', 'towers']

/** 齐腰的圆全息台，格；phase 让各台的转动错开 */
export interface Pedestal {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly holo: HoloKind
  readonly phase: number
}

/** 电梯门：门的正中在电梯井朝厅里的那一面上，(nx, ny) 朝厅里，格 */
export interface Door {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/** 靠墙的电梯井：方块 [x0, x1] × [y0, y1]（格，伸进幕墙里），(nx, ny) 是朝厅里那一面的朝向，那一面上两扇门 */
export interface Core {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly nx: number
  readonly ny: number
  readonly doors: readonly Door[]
}

/** 一扇传送门的位置：门线从格点 (x, y) 起，axis 0 竖着往下（x 不变），1 横着往右（y 不变），长度按地图的门长，格 */
export interface WarpSpot {
  readonly x: number
  readonly y: number
  readonly axis: 0 | 1
}

/** 按种子生成的大厅：全是数据，能整个发给画画的线程 */
export interface NexusPlan {
  readonly seed: number
  readonly hall: Hall
  /** 能走的地面 */
  readonly basin: Basin
  readonly start: Point
  readonly pillars: readonly Pillar[]
  readonly pedestals: readonly Pedestal[]
  readonly cores: readonly Core[]
  /** 检修口：盖板占的那一格的左上角，格 */
  readonly hatches: readonly Point[]
  /** 摆得下一扇门的位置：门线两侧都空着，离开局空地、检修口、电梯门够远 */
  readonly spots: readonly WarpSpot[]
  /** 开局的门：第 k 对是第 2k 与 2k + 1 扇 */
  readonly warps: readonly WarpSpot[]
}

/** 点到方块 [x0, x1] × [y0, y1] 的距离，块里为 0 */
export function boxDist(x0: number, y0: number, x1: number, y1: number, x: number, y: number): number {
  const dx = Math.max(x0 - x, 0, x - x1)
  const dy = Math.max(y0 - y, 0, y - y1)
  return Math.hypot(dx, dy)
}

/** 门线的中点，格 */
export function warpMid(w: WarpSpot, len: number): Point {
  return w.axis === 0 ? { x: w.x, y: w.y + len / 2 } : { x: w.x + len / 2, y: w.y }
}

/** 门线的另一头，格 */
export function warpEnd(w: WarpSpot, len: number): Point {
  return w.axis === 0 ? { x: w.x, y: w.y + len } : { x: w.x + len, y: w.y }
}

/** 点到门线的距离，格 */
export function warpDist(w: WarpSpot, len: number, x: number, y: number): number {
  return w.axis === 0 ? Math.hypot(x - w.x, Math.max(w.y - y, 0, y - w.y - len)) : Math.hypot(Math.max(w.x - x, 0, x - w.x - len), y - w.y)
}

/** 立柱：按种子挑几根，等分地摆在厅心外的一圈上；一圈摆不下就缩小一圈再试 */
function placePillars(cfg: NexusConfig, rng: Rng, hall: Hall, mid: Point, cores: readonly Core[]): Pillar[] | null {
  const p = cfg.pillars
  const n = 2 * Math.round(between(rng, p.count) / 2)
  if (n === 0) return []
  const turn = rng.next() < 0.5 ? 0 : Math.PI / n
  const r = p.radiusU
  for (let ring = between(rng, p.ringU); ring >= p.ringU[0] - 1e-9; ring -= 0.5) {
    const out: Pillar[] = []
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2
      out.push({ x: mid.x + Math.cos(a) * ring, y: mid.y + Math.sin(a) * ring, r })
    }
    const fits = out.every((q) => hallRoom(hall, q.x, q.y) >= cfg.glassU + r + WALK_U && cores.every((c) => boxDist(c.x0, c.y0, c.x1, c.y1, q.x, q.y) >= r + WALK_U))
    if (fits) return out
  }
  return null
}

/** 电梯井：一座靠在随便一面墙上，两座靠在相对的两面墙上；都在墙的中段，门开在朝厅里那一面的两边 */
function placeCores(cfg: NexusConfig, rng: Rng, hall: Hall, mid: Point): Core[] {
  const c = cfg.cores
  const n = Math.round(between(rng, c.count))
  const first = Math.floor(rng.next() * 4)
  const sides = n >= 2 ? [first, (first + 2) % 4] : n === 1 ? [first] : []
  return sides.map((side) => {
    const shift = Math.round((rng.next() * 2 - 1) * CORE_SHIFT_U)
    const half = c.widthU / 2
    const d = c.depthU
    // 0 靠西墙、1 靠北墙、2 靠东墙、3 靠南墙；电梯井往墙里多伸一格，盖住幕墙
    const nx = side === 0 ? 1 : side === 2 ? -1 : 0
    const ny = side === 1 ? 1 : side === 3 ? -1 : 0
    const along = nx !== 0 ? mid.y + shift : mid.x + shift
    const wall = side === 0 ? hall.x0 : side === 1 ? hall.y0 : side === 2 ? hall.x1 : hall.y1
    const inner = wall + (nx + ny) * d
    const outer = wall - (nx + ny)
    const a0 = Math.min(inner, outer)
    const a1 = Math.max(inner, outer)
    const box = nx !== 0 ? { x0: a0, x1: a1, y0: along - half, y1: along + half } : { x0: along - half, x1: along + half, y0: a0, y1: a1 }
    const doors: Door[] = [-1, 1].map((k) => {
      const t = along + k * (half / 2)
      return nx !== 0 ? { x: inner, y: t, nx, ny } : { x: t, y: inner, nx, ny }
    })
    return { ...box, nx, ny, doors }
  })
}

/** 全息台：在厅里随便挑点，离幕墙、立柱、电梯井、开局空地和别的全息台都够远 */
function placePedestals(cfg: NexusConfig, rng: Rng, hall: Hall, mid: Point, pillars: readonly Pillar[], cores: readonly Core[]): Pedestal[] {
  const p = cfg.pedestals
  const n = Math.round(between(rng, p.count))
  const r = p.radiusU
  const out: Pedestal[] = []
  for (let k = 0; k < 400 && out.length < n; k++) {
    const x = hall.x0 + rng.next() * (hall.x1 - hall.x0)
    const y = hall.y0 + rng.next() * (hall.y1 - hall.y0)
    if (hallRoom(hall, x, y) < cfg.glassU + r + WALK_U + 0.5) continue
    if (Math.hypot(x - mid.x, y - mid.y) < cfg.plazaU + r + 1) continue
    if (pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + r + WALK_U)) continue
    if (cores.some((c) => boxDist(c.x0, c.y0, c.x1, c.y1, x, y) < r + WALK_U + 1)) continue
    if (out.some((q) => Math.hypot(x - q.x, y - q.y) < PEDESTAL_APART_U)) continue
    out.push({ x, y, r, holo: HOLOS[out.length % HOLOS.length]!, phase: rng.next() * Math.PI * 2 })
  }
  return out
}

/** 检修口：瓷砖地面上随便几格，离开局空地、立柱、全息台、电梯井和别的检修口都够远 */
function placeHatches(cfg: NexusConfig, rng: Rng, hall: Hall, mid: Point, pillars: readonly Pillar[], pedestals: readonly Pedestal[], cores: readonly Core[]): Point[] {
  const n = Math.round(between(rng, cfg.hatches))
  const out: Point[] = []
  for (let k = 0; k < 400 && out.length < n; k++) {
    const i = Math.floor(hall.x0 + rng.next() * (hall.x1 - hall.x0))
    const j = Math.floor(hall.y0 + rng.next() * (hall.y1 - hall.y0))
    const x = i + 0.5
    const y = j + 0.5
    if (hallRoom(hall, x, y) < cfg.glassU + 1.2) continue
    if (Math.hypot(x - mid.x, y - mid.y) < cfg.plazaU + HATCH_CLEAR_U) continue
    if (pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + HATCH_CLEAR_U)) continue
    if (pedestals.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + HATCH_CLEAR_U)) continue
    if (cores.some((c) => boxDist(c.x0, c.y0, c.x1, c.y1, x, y) < HATCH_CLEAR_U + 1)) continue
    if (out.some((q) => Math.hypot(x - q.x - 0.5, y - q.y - 0.5) < HATCH_APART_U)) continue
    out.push({ x: i, y: j })
  }
  return out
}

/** 摆得下门的位置：门线落在格线上，门线两侧 apronU 格与门线两头都是空着的瓷砖地面 */
function warpSpots(cfg: NexusConfig, hall: Hall, basin: Basin, mid: Point, hatches: readonly Point[], cores: readonly Core[]): WarpSpot[] {
  const w = cfg.warps
  const len = w.lenU
  const out: WarpSpot[] = []
  const room = (x: number, y: number): number => roomAt(basin, x * UNIT, y * UNIT) / UNIT
  const doors = cores.flatMap((c) => c.doors)
  for (const axis of [0, 1] as const) {
    for (let a = Math.ceil(hall.x0); a <= Math.floor(hall.x1); a++) {
      for (let b = Math.ceil(hall.y0); b <= Math.floor(hall.y1); b++) {
        const spot: WarpSpot = { x: a, y: b, axis }
        const end = warpEnd(spot, len)
        if (room(a, b) < APRON_ROOM_U || room(end.x, end.y) < APRON_ROOM_U) continue
        let clear = true
        for (let t = 0.25; clear && t < len; t += 0.5) {
          for (let s = 0.25; clear && s <= w.apronU; s += 0.5) {
            for (const side of [-1, 1]) {
              const x = axis === 0 ? a + side * s : a + t
              const y = axis === 0 ? b + t : b + side * s
              if (room(x, y) < APRON_ROOM_U || hallRoom(hall, x, y) < cfg.glassU + 0.25) {
                clear = false
                break
              }
            }
          }
        }
        if (!clear) continue
        const m = warpMid(spot, len)
        if (Math.hypot(m.x - mid.x, m.y - mid.y) < cfg.plazaU + WARP_PLAZA_U + len / 2) continue
        if (hatches.some((h) => warpDist(spot, len, h.x + 0.5, h.y + 0.5) < WARP_HATCH_U)) continue
        if (doors.some((d) => warpDist(spot, len, d.x, d.y) < WARP_DOOR_U)) continue
        out.push(spot)
      }
    }
  }
  return out
}

/** 两扇门的中点隔多远，格 */
export function warpApart(a: WarpSpot, b: WarpSpot, len: number): number {
  const p = warpMid(a, len)
  const q = warpMid(b, len)
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** 开局的门：一对对挑，同一对朝向相同、隔得够远，任两扇门不挤在一起；第一对的朝向随机，往后横竖交替 */
function pickWarps(cfg: NexusConfig, rng: Rng, spots: readonly WarpSpot[]): WarpSpot[] | null {
  const w = cfg.warps
  const pairs = Math.round(between(rng, w.pairs))
  const first = rng.next() < 0.5 ? 0 : 1
  const out: WarpSpot[] = []
  const pick = (list: readonly WarpSpot[]): WarpSpot | null => list[Math.floor(rng.next() * list.length)] ?? null
  for (let k = 0; k < pairs; k++) {
    const axis = (first + k) % 2
    const free = spots.filter((s) => s.axis === axis && out.every((o) => warpApart(o, s, w.lenU) >= w.apartU))
    const a = pick(free)
    if (!a) return null
    const b = pick(free.filter((s) => warpApart(a, s, w.lenU) >= w.pairU))
    if (!b) return null
    out.push(a, b)
  }
  return out
}

/** 一次尝试：定大厅与电梯井，摆立柱、全息台、检修口，算能走的地面，再挑开局的门；哪一步不合格返回 null */
function attempt(cfg: NexusConfig, rng: Rng): NexusPlan | null {
  const mid: Point = { x: FRAME_U / 2, y: FRAME_U / 2 }
  const half = cfg.sizeU / 2
  const hall: Hall = { x0: mid.x - half, y0: mid.y - half, x1: mid.x + half, y1: mid.y + half, cut: Math.round(between(rng, cfg.chamferU)) }
  const cores = placeCores(cfg, rng, hall, mid)
  const pillars = placePillars(cfg, rng, hall, mid, cores)
  if (!pillars) return null
  const pedestals = placePedestals(cfg, rng, hall, mid, pillars, cores)
  if (pedestals.length < cfg.pedestals.count[0]) return null
  const hatches = placeHatches(cfg, rng, hall, mid, pillars, pedestals, cores)
  if (hatches.length < cfg.hatches[0]) return null
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    if (hallRoom(hall, x, y) <= 0) return false
    if (cores.some((c) => x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1)) return false
    if (pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r)) return false
    return pedestals.every((q) => Math.hypot(x - q.x, y - q.y) >= q.r)
  }
  const cells = Math.round(FRAME_U / BASIN_CELL_U)
  const basin = makeBasin(open, 0, 0, cells, cells, BASIN_CELL_U * UNIT, { x: mid.x * UNIT, y: mid.y * UNIT }, cfg.neckU * UNIT)
  if (roomAt(basin, mid.x * UNIT, mid.y * UNIT) < cfg.plazaU * UNIT) return null
  const spots = warpSpots(cfg, hall, basin, mid, hatches, cores)
  const warps = pickWarps(cfg, rng, spots)
  if (!warps) return null
  return { seed: Math.floor(rng.next() * 0x7fffffff), hall, basin, start: mid, pillars, pedestals, cores, hatches, spots, warps }
}

let last: { cfg: NexusConfig; seed: number; plan: NexusPlan } | null = null

/** 按种子生成大厅：哪一步不合格就换一组随机数。同一个大厅视图与规则各要一次，记住最近一个 */
export function nexusPlan(cfg: NexusConfig, seed: number): NexusPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(scramble(seed))
  for (let k = 0; k < TRIES; k++) {
    const plan = attempt(cfg, rng)
    if (!plan) continue
    last = { cfg, seed, plan }
    return plan
  }
  throw new Error(`天枢的大厅生成不出来：种子 ${seed}`)
}
