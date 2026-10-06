import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { TrainSpec, TransitConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 建距离场时窄过两倍这么宽（格）的缝填掉 */
const NECK_U = 0.3
/** 方框正中，格 */
const MID = FRAME_U / 2
/** 柱子、座椅离站台边的警示带外沿、离站厅两头至少空出这么多格，走得过去 */
const WALK_U = 1.3
/** 站台上摆设施的那一条深色石材多宽，格 */
const STRIP_U = 1.5
/** 开局站的地方四周空出这么多格，设施不摆进来 */
const PLAZA_U = 4.6
/** 检票口两边的闸机柜多宽，格 */
const CABINET_U = 0.4
/** 各种口子离站厅两头至少多远，格 */
const END_KEEP_U = 3
/** 每节车厢的门往车厢正中收拢：门之间按车厢长的这么多倍均分 */
const DOOR_SPREAD = 0.8
/** 线路色：一号线青、二号线珊瑚、三号线紫，专列金 */
export const LINE_COLORS = [0x18b8b0, 0xf2735b, 0x8a6cf0] as const
export const EXPRESS_COLOR = 0xe8a92a

/** 种子打散：相邻的种子也生成很不一样的车站 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x7a2b15c3) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 一条轨道：从站厅一侧数起的序号与线路号，道床中线横过轨道的位置（格），列车往哪个方向开（沿轨道的 +1 或 −1），线路色 */
export interface Track {
  readonly index: number
  readonly label: number
  readonly v: number
  readonly dir: 1 | -1
  readonly color: number
}

/** 一块站台：横过轨道从 v0 到 v1（格）；outer 是贴着站厅边的侧式站台在哪一侧（0 是 v0 那侧、1 是 v1 那侧），岛式站台为 −1 */
export interface Platform {
  readonly v0: number
  readonly v1: number
  readonly outer: -1 | 0 | 1
}

/** 站台上的设施，局部坐标（格）：圆柱、候车座椅（沿轨道摆，长 len、深 dep，靠背朝 back 那侧）与全息时刻表的底座；h 是高，米 */
export type Fixture =
  | { readonly kind: 'pillar'; readonly u: number; readonly v: number; readonly r: number; readonly h: number }
  | { readonly kind: 'bench'; readonly u: number; readonly v: number; readonly len: number; readonly dep: number; readonly back: 1 | -1 | 0; readonly h: number }
  | { readonly kind: 'kiosk'; readonly u: number; readonly v: number; readonly r: number; readonly h: number; readonly tracks: readonly number[] }
  | { readonly kind: 'vending'; readonly u: number; readonly v: number; readonly len: number; readonly dep: number; readonly back: 1 | -1; readonly h: number; readonly hue: number }
  | { readonly kind: 'bin'; readonly u: number; readonly v: number; readonly r: number; readonly h: number }

/** 站台上摆设施的那一条：横过轨道的中线与宽（格），铺着深一点的石材 */
export interface Strip {
  readonly v: number
  readonly w: number
}

/** 站厅边上的一个口子，局部坐标（格）：沿轨道的中点与宽 */
export interface Opening {
  readonly u: number
  readonly w: number
}

/**
 * 一座车站，局部坐标以格计：u 沿着轨道，v 横过轨道。横屏时 u 是屏幕的 x，竖屏时 u 是屏幕的 y（列车总是沿屏幕的长边开）。
 * 站厅能走的范围是 [u0, u1] × [v0, v1]；轨道与站台按 v 从小到大排；检票口与电梯在 gateSide 那一侧的站厅边上，玻璃栏板与扶梯在另一侧；
 * 开局站的地方，能走的地面（世界坐标、像素），地标（世界坐标、像素）
 */
export interface TransitPlan {
  readonly horiz: boolean
  readonly u0: number
  readonly u1: number
  readonly v0: number
  readonly v1: number
  readonly tracks: readonly Track[]
  readonly platforms: readonly Platform[]
  readonly fixtures: readonly Fixture[]
  readonly strips: readonly Strip[]
  readonly gateSide: 0 | 1
  readonly lanes: readonly Opening[]
  readonly lifts: readonly Opening[]
  readonly escalators: readonly Opening[]
  /** 列车停在站台正中：车身中点沿轨道的位置，格 */
  readonly berth: number
  /** 专列停哪条轨道 */
  readonly expressTrack: number
  readonly start: Point
  readonly basin: Basin
  readonly marks: Readonly<Record<'ticket' | 'lift' | 'escalator' | 'express', readonly Landmark[]>>
  readonly seed: number
}

/** 局部坐标（格）换成世界坐标（格） */
export function toWorld(plan: { readonly horiz: boolean }, u: number, v: number): Point {
  return plan.horiz ? { x: u, y: v } : { x: v, y: u }
}

/** 世界坐标（格）换成局部坐标（格），写进 out */
export function toLocal(plan: { readonly horiz: boolean }, x: number, y: number, out: { u: number; v: number }): { u: number; v: number } {
  out.u = plan.horiz ? x : y
  out.v = plan.horiz ? y : x
  return out
}

/** 列车全长，格 */
export function trainLength(t: TrainSpec): number {
  return t.cars * t.carU + (t.cars - 1) * t.gapU
}

/** 列车上每扇门的中点离车身中点多远（沿轨道，格），从车尾往车头排；两侧的门对着开 */
export function doorOffsets(t: TrainSpec): number[] {
  const len = trainLength(t)
  const out: number[] = []
  for (let c = 0; c < t.cars; c++) {
    const c0 = -len / 2 + c * (t.carU + t.gapU)
    for (let k = 0; k < t.doors; k++) out.push(c0 + t.carU / 2 + ((k + 0.5) / t.doors - 0.5) * t.carU * DOOR_SPREAD)
  }
  return out
}

/** 这块站台离 (u, v) 最近的警示带外沿往里多远，格；不在这块站台上为负 */
function platformRoom(p: Platform, edgeU: number, v: number): number {
  const lo = p.outer === 0 ? v - p.v0 : v - p.v0 - edgeU
  const hi = p.outer === 1 ? p.v1 - v : p.v1 - edgeU - v
  return Math.min(lo, hi)
}

/** 站台与轨道横过站厅怎么排：一串宽度，站台与轨道交替，最外两块是侧式站台；三条轨道时可能有两条并在一起、中间没有站台 */
function bands(cfg: TransitConfig, rng: Rng, width: number, n: number): { kind: 'platform' | 'track'; w: number }[] {
  const bed = cfg.tracks.bedU
  const paired = n === 3 && rng.next() < 0.45
  const seq: ('platform' | 'track')[] = ['platform']
  for (let i = 0; i < n; i++) {
    seq.push('track')
    if (!(paired && i === 1)) seq.push('platform')
  }
  if (paired && rng.next() < 0.5) {
    // 并在一起的两条换到另一头
    seq.reverse()
  }
  const plats = seq.filter((k) => k === 'platform').length
  const free = width - n * bed
  const weights = seq.map((k, i) => (k === 'track' ? 0 : (i === 0 || i === seq.length - 1 ? 0.8 : 1.15) * (0.85 + 0.3 * rng.next())))
  const sum = weights.reduce((a, b) => a + b, 0)
  const spare = free - plats * cfg.platformU
  return seq.map((k, i) => ({ kind: k, w: k === 'track' ? bed : cfg.platformU + (spare * weights[i]!) / sum }))
}

/** 设施的占地，局部坐标（格）：在里面为正、外面为负的大致距离 */
export function fixtureRoom(f: Fixture, u: number, v: number): number {
  if (f.kind === 'bench' || f.kind === 'vending') {
    const du = Math.abs(u - f.u) - f.len / 2
    const dv = Math.abs(v - f.v) - f.dep / 2
    const out = Math.hypot(Math.max(du, 0), Math.max(dv, 0))
    return -(out + Math.min(Math.max(du, dv), 0))
  }
  return f.r - Math.hypot(u - f.u, v - f.v)
}

/**
 * 按种子摆一座车站：几条轨道、站台多宽、并没并线、检票口在哪一侧，柱子、座椅、全息时刻表摆在哪，检票口、电梯与扶梯开在哪；
 * horiz 为真时轨道沿屏幕的 x 方向
 */
export function transitPlan(cfg: TransitConfig, seed: number, horiz: boolean): TransitPlan {
  const rng = new Rng(scramble(seed))
  const L = cfg.hall.lengthU
  const W = cfg.hall.widthU
  const u0 = MID - L / 2
  const u1 = MID + L / 2
  const v0 = MID - W / 2
  const v1 = MID + W / 2
  const n = Math.round(between(rng, [cfg.tracks.count[0] - 0.49, cfg.tracks.count[1] + 0.49]))
  const seq = bands(cfg, rng, W, n)
  const tracks: Track[] = []
  const platforms: Platform[] = []
  let at = v0
  const firstDir: 1 | -1 = rng.next() < 0.5 ? 1 : -1
  seq.forEach((b, i) => {
    if (b.kind === 'track') {
      const k = tracks.length
      tracks.push({ index: k, label: k + 1, v: at + b.w / 2, dir: (k % 2 === 0 ? firstDir : -firstDir) as 1 | -1, color: LINE_COLORS[k]! })
    } else platforms.push({ v0: at, v1: at + b.w, outer: i === 0 ? 0 : i === seq.length - 1 ? 1 : -1 })
    at += b.w
  })
  const edge = cfg.tracks.edgeU
  // 开局站在最靠站厅中线的岛式站台正中（没有岛式的就站最宽的那块）
  const islands = platforms.filter((p) => p.outer === -1)
  const home = (islands.length > 0 ? islands : platforms).reduce((a, b) => (Math.abs((a.v0 + a.v1) / 2 - MID) + 0.01 * (a.v1 - a.v0) <= Math.abs((b.v0 + b.v1) / 2 - MID) + 0.01 * (b.v1 - b.v0) ? a : b))
  const startU = MID + (rng.next() - 0.5) * 4
  const start = { u: startU, v: (home.v0 + home.v1) / 2 }
  const berth = MID + (rng.next() - 0.5) * 2
  const near = tracks.filter((t) => Math.abs(t.v - start.v) < (home.v1 - home.v0) / 2 + cfg.tracks.bedU)
  const expressTrack = (near[Math.floor(rng.next() * near.length)] ?? tracks[0]!).index

  const fixtures: Fixture[] = []
  const strips: Strip[] = []
  const f = cfg.fixtures
  const clearOf = (u: number, v: number, r: number): boolean => Math.hypot(u - start.u, v - start.v) >= PLAZA_U + r && fixtures.every((o) => fixtureRoom(o, u, v) < -(r + WALK_U))
  for (const p of platforms) {
    const wide = p.v1 - p.v0
    // 侧式站台的设施靠着站厅边摆，岛式的摆在正中
    const mid = (p.v0 + p.v1) / 2
    const room = (v: number): number => platformRoom(p, edge, v)
    const every = between(rng, f.pillarEveryU)
    const phase = rng.next() * every
    const pv = p.outer === -1 ? mid : p.outer === 0 ? p.v0 + f.pillarU + 0.9 : p.v1 - f.pillarU - 0.9
    strips.push({ v: pv, w: p.outer === -1 ? Math.min(STRIP_U, wide - 2 * edge - 2 * WALK_U) : STRIP_U })
    if (room(pv) >= f.pillarU + WALK_U && wide >= f.pillarU * 2 + WALK_U * 2) {
      for (let u = u0 + 1.5 + phase; u <= u1 - 1.5; u += every) {
        if (clearOf(u, pv, f.pillarU)) fixtures.push({ kind: 'pillar', u, v: pv, r: f.pillarU, h: Infinity })
      }
    }
    const benches = Math.round(between(rng, [f.benches[0] - 0.49, f.benches[1] + 0.49]))
    const b = f.bench
    const bv = p.outer === -1 ? mid : p.outer === 0 ? p.v0 + b.depthU / 2 : p.v1 - b.depthU / 2
    const back: 1 | -1 | 0 = p.outer === -1 ? 0 : p.outer === 0 ? -1 : 1
    if (room(bv) >= b.depthU / 2 + WALK_U || (p.outer !== -1 && room(bv + (p.outer === 0 ? b.depthU / 2 : -b.depthU / 2)) >= WALK_U)) {
      for (let k = 0, tries = 0; k < benches && tries < 40; tries++) {
        const u = u0 + END_KEEP_U + b.lengthU / 2 + rng.next() * (L - 2 * END_KEEP_U - b.lengthU)
        if (!clearOf(u, bv, b.lengthU / 2)) continue
        fixtures.push({ kind: 'bench', u, v: bv, len: b.lengthU, dep: b.depthU, back, h: b.heightM })
        k++
        const bu = u + (rng.next() < 0.5 ? -1 : 1) * (b.lengthU / 2 + f.bin.radiusU + 0.35)
        if (rng.next() < 0.6 && bu > u0 + END_KEEP_U && bu < u1 - END_KEEP_U && clearOf(bu, bv, f.bin.radiusU)) fixtures.push({ kind: 'bin', u: bu, v: bv, r: f.bin.radiusU, h: f.bin.heightM })
      }
    }
    if (p.outer !== -1) {
      const vm = f.vending
      const side: 1 | -1 = p.outer === 0 ? -1 : 1
      const vv = p.outer === 0 ? p.v0 + vm.depthU / 2 : p.v1 - vm.depthU / 2
      const count = Math.round(between(rng, [vm.count[0] - 0.49, vm.count[1] + 0.49]))
      for (let k = 0, tries = 0; k < count && tries < 40; tries++) {
        const u = u0 + END_KEEP_U + vm.lengthU / 2 + rng.next() * (L - 2 * END_KEEP_U - vm.lengthU)
        if (!clearOf(u, vv, vm.lengthU / 2)) continue
        fixtures.push({ kind: 'vending', u, v: vv, len: vm.lengthU, dep: vm.depthU, back: side, h: vm.heightM, hue: rng.next() })
        k++
      }
    }
    if (p.outer === -1 && room(mid) >= f.kiosk.radiusU + WALK_U) {
      const beside = tracks.filter((t) => Math.abs(t.v - mid) < wide / 2 + cfg.tracks.bedU).map((t) => t.index)
      for (let tries = 0; tries < 30; tries++) {
        const u = u0 + END_KEEP_U + rng.next() * (L - 2 * END_KEEP_U)
        if (!clearOf(u, mid, f.kiosk.radiusU + 0.5)) continue
        fixtures.push({ kind: 'kiosk', u, v: mid, r: f.kiosk.radiusU, h: f.kiosk.heightM, tracks: beside })
        break
      }
    }
  }

  const gateSide: 0 | 1 = rng.next() < 0.5 ? 0 : 1
  const e = cfg.edges
  const spread = (count: number, w: number, avoid: readonly Opening[]): Opening[] => {
    const out: Opening[] = []
    for (let tries = 0; out.length < count && tries < 80; tries++) {
      const u = u0 + END_KEEP_U + w / 2 + rng.next() * (L - 2 * END_KEEP_U - w)
      if ([...out, ...avoid].some((o) => Math.abs(o.u - u) < (o.w + w) / 2 + 2.5)) continue
      out.push({ u, w })
    }
    return out.sort((a, b) => a.u - b.u)
  }
  const laneCount = Math.round(between(rng, [e.lanes[0] - 0.49, e.lanes[1] + 0.49]))
  const bank = laneCount * e.laneU + (laneCount + 1) * CABINET_U
  const bankAt = spread(1, bank, [])[0]!
  const lanes: Opening[] = []
  for (let k = 0; k < laneCount; k++) lanes.push({ u: bankAt.u - bank / 2 + CABINET_U + e.laneU / 2 + k * (e.laneU + CABINET_U), w: e.laneU })
  const lifts = spread(Math.round(between(rng, [e.lifts[0] - 0.49, e.lifts[1] + 0.49])), e.liftU, [bankAt])
  const escalators = spread(Math.round(between(rng, [e.escalators[0] - 0.49, e.escalators[1] + 0.49])), e.escalatorU, [])

  const cell = BASIN_CELL_U * UNIT
  const cols = Math.round(FRAME_U / BASIN_CELL_U)
  const L2 = { u: 0, v: 0 }
  const open = (x: number, y: number): boolean => {
    const l = toLocal({ horiz }, x / UNIT, y / UNIT, L2)
    if (l.u < u0 || l.u > u1 || l.v < v0 || l.v > v1) return false
    return fixtures.every((o) => fixtureRoom(o, l.u, l.v) < 0)
  }
  const sw = toWorld({ horiz }, start.u, start.v)
  const basin = makeBasin(open, 0, 0, cols, cols, cell, { x: sw.x * UNIT, y: sw.y * UNIT }, NECK_U * UNIT)

  const mark = (u: number, v: number, inward: number, r: number): Landmark => {
    const w = toWorld({ horiz }, u, v)
    const nrm = toWorld({ horiz }, 0, inward)
    return { x: w.x * UNIT, y: w.y * UNIT, r: r * UNIT, nx: nrm.x, ny: nrm.y }
  }
  const gateV = gateSide === 0 ? v0 : v1
  const gateIn = gateSide === 0 ? 1 : -1
  const escV = gateSide === 0 ? v1 : v0
  const xt = tracks[expressTrack]!
  const xLen = trainLength(cfg.express)
  const xDoors = doorOffsets(cfg.express).map((d) => berth + d)
  const homeSide = Math.sign(start.v - xt.v) || 1
  const xEdge = xt.v + homeSide * (cfg.express.widthU / 2)
  const marks = {
    ticket: lanes.map((o) => mark(o.u, gateV, gateIn, o.w / 2)),
    lift: lifts.map((o) => mark(o.u, gateV, gateIn, o.w / 2)),
    escalator: escalators.map((o) => mark(o.u, escV, -gateIn, o.w / 2)),
    express: xDoors.filter((u) => Math.abs(u - berth) < xLen / 2).map((u) => mark(u, xEdge, homeSide, cfg.express.doorU / 2)),
  }
  return {
    horiz,
    u0,
    u1,
    v0,
    v1,
    tracks,
    platforms,
    fixtures,
    strips,
    gateSide,
    lanes,
    lifts,
    escalators,
    berth,
    expressTrack,
    start: sw,
    basin,
    marks,
    seed: scramble(seed ^ 0x51),
  }
}
