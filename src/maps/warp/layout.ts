import { FRAME_U, SPAWN_CLEAR_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { WarpConfig, WarpOrnament } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 方框正中，格：四只缸绕着它，给料塔立在这里 */
const MID = FRAME_U / 2
/** 摆管子时最多试几回：同一只缸的进口与出口要隔得开 */
const TUBE_TRIES = 256
const ORNAMENT_TRIES = 64
/** 投料口落饲料的碗在进口往缸里多远，格 */
export const FEEDER_U = 2

/** 四季各两件摆件，按季节排：春、夏、秋、冬；r 是摆件占的圆的半径，格 */
export const ORNAMENTS: Readonly<Record<WarpOrnament, { readonly season: number; readonly r: number }>> = {
  daisy: { season: 0, r: 0.9 },
  bonsai: { season: 0, r: 1.3 },
  cactus: { season: 1, r: 1 },
  submarine: { season: 1, r: 1.5 },
  column: { season: 2, r: 1.1 },
  geode: { season: 2, r: 1.3 },
  ice: { season: 3, r: 1.1 },
  volcano: { season: 3, r: 1.5 },
}

const BY_SEASON: readonly (readonly WarpOrnament[])[] = [0, 1, 2, 3].map((s) => (Object.keys(ORNAMENTS) as WarpOrnament[]).filter((k) => ORNAMENTS[k].season === s))

/** 格上的一块方形：[x0, x1) × [y0, y1) */
export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 一块出怪板：板占的方形与板心，格 */
export interface Plate {
  readonly box: Box
  readonly x: number
  readonly y: number
}

/** 缸里的一件摆件：哪一件、圆心与半径，格 */
export interface Ornament {
  readonly kind: WarpOrnament
  readonly x: number
  readonly y: number
  readonly r: number
}

/**
 * 一只饲养缸，格：在环上排第 index，方框里的象限 quad（0 左上、1 右上、2 右下、3 左下）；主色（palette 的 SIGNS 第几种）、敌人配方（cfg.recipes 的第几种）、
 * 摆件借的季节（0 春到 3 冬）；缸的外沿与能走的缸底；中心；进口、出口的圆心，管子穿出缸壁的方向（单位向量）；出怪板；摆件
 */
export interface WarpRoom {
  readonly index: number
  readonly quad: number
  readonly sign: number
  readonly recipe: number
  readonly season: number
  readonly slab: Box
  readonly floor: Box
  readonly center: Point
  readonly entry: Point
  readonly exit: Point
  readonly entryDir: Point
  readonly exitDir: Point
  readonly plates: readonly Plate[]
  readonly ornaments: readonly Ornament[]
}

/**
 * 一根管子，格：从第 i 只缸的出口 from 到下一只缸的进口；ahead 是顺着管子走到的那个进口——总往前（往右或往左、往下）接，
 * 接到方框外时 ahead 落在平铺出去的那一份上，shift 是它比方框里那个进口多出的整圈
 */
export interface Tube {
  readonly from: Point
  readonly ahead: Point
  readonly shift: Point
}

/**
 * 这一局的实验台，格：四只缸按环排（第 i 只的出口接到第 i + 1 只的进口），mirror 为真时往左走；队伍从第 0 只的中心出发；
 * 四根管子；能走的地面；每块瓷砖属于哪只缸（不会亮的为 −1）；给料塔在正中
 */
export interface WarpPlan {
  readonly mirror: boolean
  readonly rooms: readonly WarpRoom[]
  readonly tubes: readonly Tube[]
  readonly start: Point
  readonly basin: Basin
  /** 每只缸自己能走的地面，按环的次序：身体只在自己那只里挪 */
  readonly basins: readonly Basin[]
  readonly tiles: Int8Array
  readonly core: Point
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
}

/** 点到方形的距离，格：里面为 0 */
export function boxDist(b: Box, x: number, y: number): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1))
}

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** 一只缸的外沿与缸底在一个方向上的两条边，格：k 是这一格在方框里排第几（0 或 1） */
export function roomSpan(cfg: WarpConfig, k: number): { readonly s0: number; readonly s1: number; readonly f0: number; readonly f1: number } {
  const s0 = k * MID + cfg.room.gapU
  const s1 = (k + 1) * MID - cfg.room.gapU
  return { s0, s1, f0: s0 + cfg.room.lipU, f1: s1 - cfg.room.lipU }
}

/** 不翻的方框里四只缸按环所在的象限：左上、右上、右下、左下 */
const RING = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const

/**
 * 四根管子在不翻的方框里摆在哪：a、c 是上下两排横管的 y，b、d 是左右两列竖管的 x。第 0 只出口在右壁、进口在上壁，
 * 第 1 只进口在左壁、出口在下壁，第 2 只同第 0 只，第 3 只同第 1 只；第 2、3 只的管子穿过方框的右边、下边接到平铺出去的那一份
 */
function tubeSpots(cfg: WarpConfig, a: number, b: number, c: number, d: number): { entry: Point; exit: Point }[] {
  const lo = roomSpan(cfg, 0)
  const hi = roomSpan(cfg, 1)
  const i = cfg.pad.insetU
  return [
    { entry: { x: d, y: lo.f0 + i }, exit: { x: lo.f1 - i, y: a } },
    { entry: { x: hi.f0 + i, y: a }, exit: { x: b, y: lo.f1 - i } },
    { entry: { x: b, y: hi.f0 + i }, exit: { x: hi.f1 - i, y: c } },
    { entry: { x: lo.f0 + i, y: c }, exit: { x: d, y: hi.f1 - i } },
  ]
}

/** 管子穿出缸壁的方向，不翻的方框里：第 0、2 只往右，第 1、3 只往下 */
const EXIT_DIR: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
]

/** 一块沿缸壁的出怪板：板心离壁半格，沿壁摆 */
function plateAt(cfg: WarpConfig, floor: Box, side: number, t: number): Plate {
  const h = cfg.emitters.plateU / 2
  const box: Box =
    side === 0
      ? { x0: t - h, y0: floor.y0, x1: t + h, y1: floor.y0 + 1 }
      : side === 1
        ? { x0: floor.x1 - 1, y0: t - h, x1: floor.x1, y1: t + h }
        : side === 2
          ? { x0: t - h, y0: floor.y1 - 1, x1: t + h, y1: floor.y1 }
          : { x0: floor.x0, y0: t - h, x1: floor.x0 + 1, y1: t + h }
  return { box, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
}

/** 沿四面缸壁挑 count 块出怪板：离进口、出口够远，彼此隔开 */
function platesOf(cfg: WarpConfig, rng: Rng, floor: Box, pads: readonly Point[]): Plate[] {
  const away = cfg.pad.radiusU + 2.5
  const all: Plate[] = []
  for (let side = 0; side < 4; side++) {
    const [lo, hi] = side % 2 === 0 ? [floor.x0, floor.x1] : [floor.y0, floor.y1]
    for (let t = Math.ceil(lo + 2); t <= hi - 2; t++) {
      const p = plateAt(cfg, floor, side, t)
      if (pads.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= away)) all.push(p)
    }
  }
  const out: Plate[] = []
  for (const p of shuffled(rng, all)) {
    if (out.length >= cfg.emitters.count) break
    if (out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 5)) continue
    out.push(p)
  }
  return out
}

/** 这只缸按季节摆的摆件：圆心离缸壁、管口、出怪板、开局站位与别的摆件都隔开 */
function ornamentsOf(cfg: WarpConfig, rng: Rng, season: number, floor: Box, pads: readonly Point[], plates: readonly Plate[], start: Point | null): Ornament[] {
  const [lo, hi] = cfg.ornaments.count
  const n = lo + Math.floor(rng.next() * (hi - lo + 1))
  const clear = cfg.ornaments.clearU
  const kinds = shuffled(rng, BY_SEASON[season]!).slice(0, n)
  const out: Ornament[] = []
  for (const kind of kinds) {
    const r = ORNAMENTS[kind].r
    for (let k = 0; k < ORNAMENT_TRIES; k++) {
      const x = floor.x0 + r + clear + rng.next() * (floor.x1 - floor.x0 - 2 * (r + clear))
      const y = floor.y0 + r + clear + rng.next() * (floor.y1 - floor.y0 - 2 * (r + clear))
      if (pads.some((p) => Math.hypot(x - p.x, y - p.y) < r + cfg.pad.radiusU + clear)) continue
      if (plates.some((p) => Math.hypot(x - p.x, y - p.y) < r + clear + 1)) continue
      if (out.some((o) => Math.hypot(x - o.x, y - o.y) < r + o.r + clear * 2)) continue
      if (start && Math.hypot(x - start.x, y - start.y) < r + SPAWN_CLEAR_U + 0.5) continue
      out.push({ kind, x, y, r })
      break
    }
  }
  return out
}

/** 身体在 (x, y) 能不能站：落在这只缸能走的缸底上、不碰摆件 */
function openIn(room: Pick<WarpRoom, 'floor' | 'ornaments'>, x: number, y: number): boolean {
  if (!inBox(room.floor, x, y)) return false
  return !room.ornaments.some((o) => Math.hypot(x - o.x, y - o.y) < o.r)
}

/**
 * 按种子摆一张实验台：往哪边走；四根管子在缸壁上的位置；四种主色、四种配方、四个季节各自打乱分给四只缸，每只按季节摆一两件摆件。
 * 先在不翻的方框里摆，翻的那一局整张左右翻过来。能走的地面四只各算一遍距离场，取最大合成一张
 */
export function warpPlan(cfg: WarpConfig, seed: number): WarpPlan {
  const rng = new Rng(seed)
  const mirror = rng.next() < 0.5
  const signs = shuffled(rng, [0, 1, 2, 3])
  const recipes = shuffled(rng, [0, 1, 2, 3])
  const seasons = shuffled(rng, [0, 1, 2, 3])
  const lo = roomSpan(cfg, 0)
  const hi = roomSpan(cfg, 1)
  const pick = (s: { f0: number; f1: number }): number => s.f0 + cfg.pad.cornerU + rng.next() * (s.f1 - s.f0 - 2 * cfg.pad.cornerU)
  let spots = tubeSpots(cfg, pick(lo), pick(hi), pick(hi), pick(lo))
  for (let k = 0; k < TUBE_TRIES && spots.some((s) => Math.hypot(s.entry.x - s.exit.x, s.entry.y - s.exit.y) < cfg.pad.apartU); k++) spots = tubeSpots(cfg, pick(lo), pick(hi), pick(hi), pick(lo))
  const fx = (x: number): number => (mirror ? FRAME_U - x : x)
  const fp = (p: Point): Point => ({ x: fx(p.x), y: p.y })
  const fb = (b: Box): Box => (mirror ? { x0: FRAME_U - b.x1, y0: b.y0, x1: FRAME_U - b.x0, y1: b.y1 } : b)
  const rooms: WarpRoom[] = RING.map(([qx, qy], i) => {
    const sx = roomSpan(cfg, qx)
    const sy = roomSpan(cfg, qy)
    const floor0: Box = { x0: sx.f0, y0: sy.f0, x1: sx.f1, y1: sy.f1 }
    const entry = spots[i]!.entry
    const exit = spots[i]!.exit
    const plates = platesOf(cfg, rng, floor0, [entry, exit])
    const center0 = { x: (floor0.x0 + floor0.x1) / 2, y: (floor0.y0 + floor0.y1) / 2 }
    const ornaments = ornamentsOf(cfg, rng, seasons[i]!, floor0, [entry, exit], plates, i === 0 ? center0 : null)
    const out = EXIT_DIR[i]!
    const into = EXIT_DIR[(i + 3) % 4]!
    const floor = fb(floor0)
    return {
      index: i,
      quad: (mirror ? 1 - qx : qx) === 0 ? (qy === 0 ? 0 : 3) : qy === 0 ? 1 : 2,
      sign: signs[i]!,
      recipe: recipes[i]!,
      season: seasons[i]!,
      slab: fb({ x0: sx.s0, y0: sy.s0, x1: sx.s1, y1: sy.s1 }),
      floor,
      center: fp(center0),
      entry: fp(entry),
      exit: fp(exit),
      entryDir: { x: mirror ? into.x : -into.x, y: -into.y },
      exitDir: { x: mirror ? -out.x : out.x, y: out.y },
      plates: plates.map((p) => ({ box: fb(p.box), x: fx(p.x), y: p.y })),
      ornaments: ornaments.map((o) => ({ ...o, x: fx(o.x) })),
    }
  })
  const tubes: Tube[] = rooms.map((r, i) => {
    const to = rooms[(i + 1) % rooms.length]!.entry
    const wrapU = (d: number): number => (d > MID ? d - FRAME_U : d < -MID ? d + FRAME_U : d)
    const ahead = { x: r.exit.x + wrapU(to.x - r.exit.x), y: r.exit.y + wrapU(to.y - r.exit.y) }
    return { from: r.exit, ahead, shift: { x: ahead.x - to.x, y: ahead.y - to.y } }
  })
  const cell = BASIN_CELL_U * UNIT
  const n = Math.round(FRAME_U / BASIN_CELL_U)
  const parts = rooms.map((room) => makeBasin((x, y) => openIn(room, x / UNIT, y / UNIT), 0, 0, n, n, cell, { x: room.exit.x * UNIT, y: room.exit.y * UNIT }, cfg.neckU * UNIT))
  const room = new Float32Array(n * n)
  for (let i = 0; i < room.length; i++) room[i] = Math.max(...parts.map((b) => b.room[i]!))
  const tiles = new Int8Array(FRAME_U * FRAME_U).fill(-1)
  for (const r of rooms) {
    for (let j = Math.floor(r.floor.y0); j < Math.ceil(r.floor.y1); j++) {
      for (let i = Math.floor(r.floor.x0); i < Math.ceil(r.floor.x1); i++) {
        const x = i + 0.5
        const y = j + 0.5
        if (!openIn(r, x, y) || r.plates.some((p) => inBox(p.box, x, y))) continue
        if ([r.entry, r.exit].some((p) => Math.hypot(x - p.x, y - p.y) < cfg.pad.radiusU + 0.25)) continue
        tiles[j * FRAME_U + i] = r.index
      }
    }
  }
  return { mirror, rooms, tubes, start: rooms[0]!.center, basin: { cols: n, rows: n, cell, x0: 0, y0: 0, room }, basins: parts, tiles, core: { x: MID, y: MID } }
}

/** (x, y)（格）落在哪只缸的象限里：在环上的次序 */
export function roomIndexAt(plan: WarpPlan, x: number, y: number): number {
  const q = x < MID ? (y < MID ? 0 : 3) : y < MID ? 1 : 2
  return plan.rooms.find((r) => r.quad === q)!.index
}

/** 第 i 只的下一只：它的出口接到那里 */
export function nextRoom(plan: WarpPlan, i: number): WarpRoom {
  return plan.rooms[(i + 1) % plan.rooms.length]!
}

/** 方框外的点挪回方框里那一份，格 */
export function wrapU(v: number): number {
  return v - FRAME_U * Math.floor(v / FRAME_U)
}
