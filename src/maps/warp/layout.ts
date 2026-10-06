import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { WarpConfig, WarpShape } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 方框正中，格：四个象限各归一季 */
const MID = FRAME_U / 2
/** 方框竖着切成几列 */
export const COLS = 3

/** 四季各拿前面两张图里的一件东西装进标本罐：草甸的小花、樱庭的樱花；沙漠的驼骨、深海的气泡；残垣的枫叶、紫水晶；浮冰的冰块、火山 */
export const TOKENS: readonly (readonly [string, string])[] = [
  ['1f33c', '1f338'],
  ['1f9b4', '1fae7'],
  ['1f341', '1f48e'],
  ['1f9ca', '1f30b'],
]

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

/** 一扇门，格：全图第 index 扇，在第 room 间舱室、靠第 wall 面墙（0 上 1 右 2 下 3 左），台心与朝屋里的方向；通往第 to 间舱室的入口；exit 为真是标着「出口」的那扇 */
export interface Door {
  readonly index: number
  readonly room: number
  readonly wall: number
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly to: number
  readonly exit: boolean
}

/** 墙边一处圆台：台心、靠哪面墙、朝屋里的方向 */
interface Spot {
  readonly wall: number
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/**
 * 一间舱室，格：第 index 间，门牌 code；季节、敌人配方（cfg.recipes 的第几种）、标本罐里装的东西；里面的样子；
 * 分到的格、平台与能走的方块、中心；入口（只进不出）与它靠的墙；门；出怪板；机柜、凹槽与标本罐；两台监控装在平台的哪两个角上
 */
export interface Chamber {
  readonly index: number
  readonly code: number
  readonly season: number
  readonly recipe: number
  readonly token: string
  readonly shape: WarpShape
  readonly cell: Box
  readonly slab: Box
  readonly floor: Box
  readonly center: Point
  readonly entry: Point
  readonly entryWall: number
  readonly doors: readonly Door[]
  readonly plates: readonly Plate[]
  readonly racks: readonly Box[]
  readonly pit: Box | null
  readonly jar: Box
  readonly cams: readonly Point[]
}

/**
 * 这一局的迷宫，格：舱室、全图的门（按 index 排）；队伍从 start 那间的中心出发；顺着「出口」走一圈的次序 loop；
 * 能走的地面，每间舱室自己能走的地面；每块瓷砖属于哪间舱室（不会亮的为 −1）；每一格属于哪间舱室分到的格
 */
export interface WarpPlan {
  readonly rooms: readonly Chamber[]
  readonly doors: readonly Door[]
  readonly start: number
  readonly loop: readonly number[]
  readonly basin: Basin
  readonly basins: readonly Basin[]
  readonly tiles: Int8Array
  readonly owner: Int8Array
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
}

/** 点到方形的距离，格：里面为 0 */
export function boxDist(b: Box, x: number, y: number): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1))
}

function shrink(b: Box, d: number): Box {
  return { x0: b.x0 + d, y0: b.y0 + d, x1: b.x1 - d, y1: b.y1 - d }
}

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** total 拆成 n 段、每段是 [lo, hi] 里的整数的所有拆法 */
export function splits(total: number, n: number, lo: number, hi: number): number[][] {
  if (n === 1) return total >= lo && total <= hi ? [[total]] : []
  const out: number[][] = []
  for (let a = lo; a <= hi; a++) for (const rest of splits(total - a, n - 1, lo, hi)) out.push([a, ...rest])
  return out
}

/** 一段一段排开，返回各段的起点与终点 */
function spans(parts: readonly number[]): [number, number][] {
  let at = 0
  return parts.map((p) => {
    const s: [number, number] = [at, at + p]
    at += p
    return s
  })
}

/** 三列各切成 cfg.maze.rows 的哪一种（按列排），加起来正好 total 间的所有搭法 */
export function stacks(cfg: WarpConfig, total: number): number[][] {
  const out: number[][] = []
  const walk = (left: number, acc: number[]): void => {
    if (acc.length === COLS) {
      if (left === 0) out.push(acc)
      return
    }
    cfg.maze.rows.forEach((r, k) => walk(left - r.n, [...acc, k]))
  }
  walk(total, [])
  return out
}

/** 舱室的格切法：先定一共几间，再定每列切成哪一种、列宽与每列的行高；切出来的格铺满整个方框 */
function cells(cfg: WarpConfig, rng: Rng): Box[] {
  const m = cfg.maze
  const [lo, hi] = rng.next() < m.fewP ? m.few : m.rooms
  const options = stacks(cfg, lo + Math.floor(rng.next() * (hi - lo + 1)))
  const pick = options[Math.floor(rng.next() * options.length)]!
  const cols = splits(FRAME_U, COLS, m.colU[0], m.colU[1])
  const out: Box[] = []
  spans(cols[Math.floor(rng.next() * cols.length)]!).forEach(([x0, x1], c) => {
    const r = m.rows[pick[c]!]!
    const rows = splits(FRAME_U, r.n, r.u[0], r.u[1])
    for (const [y0, y1] of spans(rows[Math.floor(rng.next() * rows.length)]!)) out.push({ x0, y0, x1, y1 })
  })
  return out
}

/** 能走的方块里靠第 wall 面墙、沿墙偏 off 格的圆台 */
function wallSpot(cfg: WarpConfig, f: Box, wall: number, off: number): Spot {
  const d = cfg.pad.insetU + cfg.pad.radiusU
  const mx = (f.x0 + f.x1) / 2 + off
  const my = (f.y0 + f.y1) / 2 + off
  if (wall === 0) return { wall, x: mx, y: f.y0 + d, nx: 0, ny: 1 }
  if (wall === 1) return { wall, x: f.x1 - d, y: my, nx: -1, ny: 0 }
  if (wall === 2) return { wall, x: mx, y: f.y1 - d, nx: 0, ny: -1 }
  return { wall, x: f.x0 + d, y: my, nx: 1, ny: 0 }
}

/** 第 wall 面墙有多长 */
function wallLen(f: Box, wall: number): number {
  return wall % 2 === 0 ? f.x1 - f.x0 : f.y1 - f.y0
}

/** 第 k 个角（0 左上 1 右上 2 右下 3 左下）上的 (x, y) 与往屋里的两个方向 */
function corner(f: Box, k: number): { x: number; y: number; sx: number; sy: number } {
  const right = k === 1 || k === 2
  const low = k === 2 || k === 3
  return { x: right ? f.x1 : f.x0, y: low ? f.y1 : f.y0, sx: right ? -1 : 1, sy: low ? -1 : 1 }
}

/**
 * 每间舱室的去处：先把所有舱室打乱排成一圈，每间的「出口」通往圈上的下一间；再给每间添一两扇别的门，沿圈往前跳 2 到 (n − 1) / 2 间，跳几间随手挑。
 * 所有的门都只往前通、往前跳不过半圈，两扇门往前跳的间数加起来到不了一整圈，所以没有两间舱室的门互相通着——从哪扇门来，那间都没有门通回去
 */
function wire(n: number, extraP: number, rng: Rng): { loop: number[]; out: number[][] } {
  const loop = shuffled(
    rng,
    Array.from({ length: n }, (_, i) => i),
  )
  const reach = Math.floor((n - 1) / 2)
  const out: number[][] = Array.from({ length: n }, () => [])
  loop.forEach((c, i) => {
    out[c]!.push(loop[(i + 1) % n]!)
    const jumps = shuffled(
      rng,
      Array.from({ length: reach - 1 }, (_, k) => k + 2),
    )
    for (const k of jumps.slice(0, rng.next() < extraP ? 2 : 1)) out[c]!.push(loop[(i + k) % n]!)
  })
  return { loop, out }
}

/** 半径 rad 格的身体在 (x, y) 能不能站：落在这间能走的方块里、不碰机柜、凹槽与标本罐 */
function openIn(room: Pick<Chamber, 'floor' | 'racks' | 'pit' | 'jar'>, x: number, y: number): boolean {
  if (!inBox(room.floor, x, y)) return false
  if (room.pit && inBox(room.pit, x, y)) return false
  if (inBox(room.jar, x, y)) return false
  return !room.racks.some((b) => inBox(b, x, y))
}

/**
 * 按种子摆一座迷宫：切格；按象限分四季，每季一种配方、两件东西轮着装进标本罐；门牌号打乱；
 * 连线（见 wire）；每间舱室的入口与门各占一面墙，两个空角放出怪板，剩下的一角立标本罐；最大的那间做开局的空舱，其余按大小挑样子。
 * 能走的地面每间各算一遍距离场，取最大合成一张
 */
export function warpPlan(cfg: WarpConfig, seed: number): WarpPlan {
  const rng = new Rng(seed)
  const boxes = cells(cfg, rng)
  const n = boxes.length
  const seasonOf = shuffled(rng, [0, 1, 2, 3])
  const recipeOf = shuffled(rng, [0, 1, 2, 3])
  const codes = shuffled(
    rng,
    Array.from({ length: 90 }, (_, i) => i + 10),
  )
  const { loop, out } = wire(n, cfg.maze.extraP, rng)
  const edge = cfg.maze.gapU + cfg.maze.lipU
  const floors = boxes.map((b) => shrink(b, edge))
  const span = (f: Box): number => Math.min(f.x1 - f.x0, f.y1 - f.y0)
  let start = 0
  floors.forEach((f, i) => {
    if (span(f) > span(floors[start]!)) start = i
  })
  const turns = [0, 0, 0, 0]
  const doors: Door[] = []
  const rooms: Chamber[] = boxes.map((cell, i) => {
    const floor = floors[i]!
    const center = { x: (floor.x0 + floor.x1) / 2, y: (floor.y0 + floor.y1) / 2 }
    const season = seasonOf[(center.x < MID ? 0 : 1) + (center.y < MID ? 0 : 2)]!
    const token = TOKENS[season]![(turns[season]!++ + (seed & 1)) % 2]!
    const walls = shuffled(rng, [0, 1, 2, 3])
    const spot = (wall: number): Spot => {
      const room = Math.max(0, wallLen(floor, wall) / 2 - cfg.pad.cornerU)
      return wallSpot(cfg, floor, wall, (rng.next() * 2 - 1) * room)
    }
    const entry = spot(walls[0]!)
    const mine = out[i]!.map((to, k): Door => {
      const s = spot(walls[k + 1]!)
      return { index: doors.length + k, room: i, wall: s.wall, x: s.x, y: s.y, nx: s.nx, ny: s.ny, to, exit: k === 0 }
    })
    doors.push(...mine)
    const pads: Point[] = [entry, ...mine]
    const corners = shuffled(rng, [0, 1, 2, 3])
    const plates = corners.slice(0, 2).map((k): Plate => {
      const c = corner(floor, k)
      const h = cfg.emitters.plateU
      const along = rng.next() < 0.5
      const x0 = along ? c.x + c.sx * 0.5 : c.x
      const y0 = along ? c.y : c.y + c.sy * 0.5
      const x1 = along ? x0 + c.sx * h : x0 + c.sx
      const y1 = along ? y0 + c.sy : y0 + c.sy * h
      const box = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }
      return { box, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
    })
    const jc = corner(floor, corners[2]!)
    const js = cfg.jar.sizeU
    const jx = jc.x + jc.sx * 0.3
    const jy = jc.y + jc.sy * 0.3
    const jar: Box = { x0: Math.min(jx, jx + jc.sx * js), y0: Math.min(jy, jy + jc.sy * js), x1: Math.max(jx, jx + jc.sx * js), y1: Math.max(jy, jy + jc.sy * js) }
    const cams = [corners[2]!, corners[3]!].map((k) => {
      const c = corner(cell, k)
      return { x: c.x + c.sx * (cfg.maze.gapU + cfg.maze.lipU * 0.5), y: c.y + c.sy * (cfg.maze.gapU + cfg.maze.lipU * 0.5) }
    })
    const w = floor.x1 - floor.x0
    const h = floor.y1 - floor.y0
    const roll = rng.next()
    const racks: Box[] = []
    if (i !== start && Math.min(w, h) >= cfg.racks.minU && roll >= 0.35 && roll < 0.75) {
      const r = cfg.racks
      const inner = shrink(floor, cfg.pad.insetU + 2 * cfg.pad.radiusU + cfg.racks.clearU)
      const iw = inner.x1 - inner.x0
      const ih = inner.y1 - inner.y0
      // 机柜排成一两排长条，顺着舱室长的那一边，排与排、排与墙之间都留着过道
      const along = iw >= ih
      const n = Math.max(1, Math.floor(((along ? ih : iw) - r.sizeU) / r.stepU) + 1)
      const o = ((along ? ih : iw) - (n - 1) * r.stepU - r.sizeU) / 2
      for (let k = 0; k < n; k++) {
        const box = along
          ? { x0: inner.x0, y0: inner.y0 + o + k * r.stepU, x1: inner.x1, y1: inner.y0 + o + k * r.stepU + r.sizeU }
          : { x0: inner.x0 + o + k * r.stepU, y0: inner.y0, x1: inner.x0 + o + k * r.stepU + r.sizeU, y1: inner.y1 }
        if (pads.some((p) => boxDist(box, p.x, p.y) < cfg.pad.radiusU + r.clearU - 1e-6)) continue
        racks.push(box)
      }
    }
    const shape: WarpShape = i !== start && Math.min(w, h) >= cfg.pit.minU && roll < 0.35 ? 'pit' : racks.length > 0 ? 'racks' : 'hall'
    const pit = shape === 'pit' ? shrink(floor, cfg.pit.marginU) : null
    return {
      index: i,
      code: codes[i]!,
      season,
      recipe: recipeOf[season]!,
      token,
      shape,
      cell,
      slab: shrink(cell, cfg.maze.gapU),
      floor,
      center,
      entry: { x: entry.x, y: entry.y },
      entryWall: entry.wall,
      doors: mine,
      plates,
      racks,
      pit,
      jar,
      cams,
    }
  })
  const cell = BASIN_CELL_U * UNIT
  const g = Math.round(FRAME_U / BASIN_CELL_U)
  const basins = rooms.map((room) => makeBasin((x, y) => openIn(room, x / UNIT, y / UNIT), 0, 0, g, g, cell, { x: room.entry.x * UNIT, y: room.entry.y * UNIT }, cfg.neckU * UNIT))
  const merged = new Float32Array(g * g)
  for (let i = 0; i < merged.length; i++) merged[i] = Math.max(...basins.map((b) => b.room[i]!))
  const owner = new Int8Array(FRAME_U * FRAME_U)
  const tiles = new Int8Array(FRAME_U * FRAME_U).fill(-1)
  for (const r of rooms) {
    for (let j = r.cell.y0; j < r.cell.y1; j++) for (let i = r.cell.x0; i < r.cell.x1; i++) owner[j * FRAME_U + i] = r.index
    for (let j = r.floor.y0; j < r.floor.y1; j++) {
      for (let i = r.floor.x0; i < r.floor.x1; i++) {
        const x = i + 0.5
        const y = j + 0.5
        if (!openIn(r, x, y) || r.plates.some((p) => inBox(p.box, x, y))) continue
        if ([r.entry, ...r.doors].some((p) => Math.hypot(x - p.x, y - p.y) < cfg.pad.radiusU + 0.25)) continue
        tiles[j * FRAME_U + i] = r.index
      }
    }
  }
  return { rooms, doors, start, loop, basin: { cols: g, rows: g, cell, x0: 0, y0: 0, room: merged }, basins, tiles, owner }
}

/** (x, y)（格）落在哪间舱室分到的格里 */
export function roomIndexAt(plan: WarpPlan, x: number, y: number): number {
  const i = Math.min(FRAME_U - 1, Math.max(0, Math.floor(x)))
  const j = Math.min(FRAME_U - 1, Math.max(0, Math.floor(y)))
  return plan.owner[j * FRAME_U + i]!
}
