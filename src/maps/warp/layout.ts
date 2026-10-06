import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { WarpConfig, WarpShape } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 方框正中，格：四间房绕着它，真正的出口浮在这里 */
const MID = FRAME_U / 2

export const SHAPES: readonly WarpShape[] = ['hall', 'pillars', 'cloister', 'narrow']

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

/**
 * 一扇门，格：门洞的中点 (x, y) 落在能走的方块的边上，in 是朝房里的单位方向；门槛是门前踩上去就走的那一块；
 * 送到的身体落在 land 四周；style 是门的样子（隔着缝对开的两扇是同一扇门的两面，按出口那间的签名）
 */
export interface Door {
  readonly x: number
  readonly y: number
  readonly in: Point
  readonly zone: Box
  readonly land: Point
  readonly style: number
}

/**
 * 一间房，格：在环上排第 index，方框里的象限 quad（0 左上、1 右上、2 右下、3 左下）；形状、签名（主色与地板的待机律动）、敌人配方（cfg.recipes 的第几种）；
 * 平台与能走的方块；中心；出口（通往下一间）与入口（从上一间来）；出怪板；立柱、凹槽与机柜台
 */
export interface WarpRoom {
  readonly index: number
  readonly quad: number
  readonly shape: WarpShape
  readonly sign: number
  readonly recipe: number
  readonly slab: Box
  readonly floor: Box
  readonly center: Point
  readonly exit: Door
  readonly entry: Door
  readonly plates: readonly Plate[]
  readonly pillars: readonly Box[]
  readonly pit: Box | null
  readonly deck: Box | null
}

/**
 * 这一局的跃迁站，格：四间房按环排（第 i 间的出口通到第 i + 1 间的入口），mirror 为真时环逆时针；队伍从开局那间的中心出发；
 * 能走的地面；每块瓷砖属于哪间房（不会亮的为 −1）；真正的出口在正中
 */
export interface WarpPlan {
  readonly mirror: boolean
  readonly rooms: readonly WarpRoom[]
  readonly start: Point
  readonly basin: Basin
  /** 每间房自己能走的地面，按环的次序：身体只在自己那间里挪 */
  readonly basins: readonly Basin[]
  readonly tiles: Int8Array
  readonly core: Point
}

/** 一间房局部的坐标（左上那间、内角朝右下）转到方框里：绕方框中心顺时针转 turn 个直角，再按 mirror 左右翻 */
function place(turn: number, mirror: boolean, u: number, v: number): Point {
  let x = u
  let y = v
  for (let k = 0; k < turn; k++) {
    const nx = FRAME_U - y
    y = x
    x = nx
  }
  return { x: mirror ? FRAME_U - x : x, y }
}

function placeBox(turn: number, mirror: boolean, b: Box): Box {
  const a = place(turn, mirror, b.x0, b.y0)
  const c = place(turn, mirror, b.x1, b.y1)
  return { x0: Math.min(a.x, c.x), y0: Math.min(a.y, c.y), x1: Math.max(a.x, c.x), y1: Math.max(a.y, c.y) }
}

/** 方向只转不平移 */
function placeDir(turn: number, mirror: boolean, dx: number, dy: number): Point {
  const a = place(turn, mirror, MID, MID)
  const b = place(turn, mirror, MID + dx, MID + dy)
  return { x: b.x - a.x, y: b.y - a.y }
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1
}

/** 两块方形之间隔多远，格：挨着或交叠为 0 */
function boxGap(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1))
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

/** 一间房局部的尺寸：平台、能走的方块的两条边，格 */
export function roomFrame(cfg: WarpConfig): { readonly slab0: number; readonly slab1: number; readonly f0: number; readonly f1: number } {
  const r = cfg.room
  const slab1 = MID - r.gapU
  return { slab0: r.gapU, slab1, f0: r.gapU + r.lipU, f1: slab1 - r.lipU }
}

/** 送到的身体离门洞多远（格）落下：排成几圈也碰不到墙 */
export const LAND_U = 2.2

/**
 * 一间房局部的一扇门：出口开在朝下一间的那面墙（x = f1）上、离外角 v 格，入口开在朝上一间的那面墙（y = f1）上；
 * 转到方框里以后，这一间的出口正对着下一间的入口
 */
function localDoor(cfg: WarpConfig, exit: boolean, v: number, style: number): Door {
  const { f1 } = roomFrame(cfg)
  const h = cfg.exit.widthU / 2
  const z = cfg.exit.zoneU
  if (exit) return { x: f1, y: v, in: { x: -1, y: 0 }, zone: { x0: f1 - z, y0: v - h, x1: f1, y1: v + h }, land: { x: f1 - LAND_U, y: v }, style }
  return { x: v, y: f1, in: { x: 0, y: -1 }, zone: { x0: v - h, y0: f1 - z, x1: v + h, y1: f1 }, land: { x: v, y: f1 - LAND_U }, style }
}

function placeDoor(turn: number, mirror: boolean, d: Door): Door {
  const at = place(turn, mirror, d.x, d.y)
  const land = place(turn, mirror, d.land.x, d.land.y)
  return { x: at.x, y: at.y, in: placeDir(turn, mirror, d.in.x, d.in.y), zone: placeBox(turn, mirror, d.zone), land, style: d.style }
}

/** 一块沿墙的出怪板：板心在 (u, v)，沿 u（along 为 0）或沿 v 摆，局部坐标 */
function plate(cfg: WarpConfig, u: number, v: number, along: 0 | 1): Box {
  const h = cfg.emitters.plateU / 2
  return along === 0 ? { x0: u - h, y0: v - 0.5, x1: u + h, y1: v + 0.5 } : { x0: u - 0.5, y0: v - h, x1: u + 0.5, y1: v + h }
}

/** 一间房局部的布置：能走的方块，立柱、凹槽、机柜台与出怪板；doors 是两扇门的门槛，立柱让开它们 */
function localRoom(cfg: WarpConfig, shape: WarpShape, tall: boolean, doors: readonly Box[]): { floor: Box; pillars: Box[]; pit: Box | null; deck: Box | null; plates: Box[] } {
  const { f0, f1 } = roomFrame(cfg)
  const full: Box = { x0: f0, y0: f0, x1: f1, y1: f1 }
  const mid = (f0 + f1) / 2
  const near = cfg.emitters.plateU / 2 + 2
  const far = Math.round(f1 - (f1 - f0) * 0.38)
  const walls = [plate(cfg, f0 + near + 1, f0 + 0.5, 0), plate(cfg, far, f0 + 0.5, 0), plate(cfg, f0 + 0.5, f0 + near + 1, 1), plate(cfg, f0 + 0.5, far, 1)]
  if (shape === 'narrow') {
    const n = cfg.room.narrowU
    const cut = f1 - n
    if (tall) {
      return {
        floor: { x0: cut, y0: f0, x1: f1, y1: f1 },
        pillars: [],
        pit: null,
        deck: { x0: f0, y0: f0, x1: cut, y1: f1 },
        plates: [plate(cfg, cut + n / 2, f0 + 0.5, 0), plate(cfg, cut + 0.5, f0 + near + 1, 1), plate(cfg, cut + 0.5, far - 1, 1)],
      }
    }
    return {
      floor: { x0: f0, y0: cut, x1: f1, y1: f1 },
      pillars: [],
      pit: null,
      deck: { x0: f0, y0: f0, x1: f1, y1: cut },
      plates: [plate(cfg, f0 + 0.5, cut + n / 2, 1), plate(cfg, f0 + near + 1, cut + 0.5, 0), plate(cfg, far - 1, cut + 0.5, 0)],
    }
  }
  if (shape === 'cloister') {
    const h = cfg.pitU / 2
    return { floor: full, pillars: [], pit: { x0: mid - h, y0: mid - h, x1: mid + h, y1: mid + h }, deck: null, plates: walls }
  }
  if (shape === 'pillars') {
    const p = cfg.pillars
    const list: Box[] = []
    for (let i = 0; i < p.count; i++) {
      for (let j = 0; j < p.count; j++) {
        const b: Box = { x0: f0 + p.firstU + i * p.stepU, y0: f0 + p.firstU + j * p.stepU, x1: f0 + p.firstU + i * p.stepU + p.sizeU, y1: f0 + p.firstU + j * p.stepU + p.sizeU }
        if (doors.some((d) => boxGap(b, d) < p.clearU)) continue
        list.push(b)
      }
    }
    return { floor: full, pillars: list, pit: null, deck: null, plates: walls }
  }
  return { floor: full, pillars: [], pit: null, deck: null, plates: walls }
}

/** 半径 rad 格的身体在 (x, y) 能不能站：落在这间能走的方块里、不碰立柱与凹槽 */
function openIn(room: Pick<WarpRoom, 'floor' | 'pillars' | 'pit'>, x: number, y: number): boolean {
  if (!inBox(room.floor, x, y)) return false
  if (room.pit && inBox(room.pit, x, y)) return false
  return !room.pillars.some((b) => inBox(b, x, y))
}

/**
 * 按种子摆一座跃迁站：环的方向；四种形状、四种签名、四种配方各自打乱分给四间房（狭长那间横竖也按种子）；
 * 每对门离外角多远也按种子，狭长那间那面窄墙放不下就挪到窄墙正中。队伍从大厅出发。能走的地面四间各算一遍距离场，取最大合成一张
 */
export function warpPlan(cfg: WarpConfig, seed: number): WarpPlan {
  const rng = new Rng(seed)
  const mirror = rng.next() < 0.5
  const shapes = shuffled(rng, SHAPES)
  const signs = shuffled(rng, [0, 1, 2, 3])
  const recipes = shuffled(rng, [0, 1, 2, 3])
  const tall = rng.next() < 0.5
  const frame = roomFrame(cfg)
  // 第 i 对门：第 i 间的出口（狭长又横着时那面墙窄）对着第 i + 1 间的入口（狭长又竖着时那面墙窄）
  const gaps = shapes.map((shape, i) => {
    const narrow = (shape === 'narrow' && !tall) || (shapes[(i + 1) % shapes.length] === 'narrow' && tall)
    const jitter = Math.round(rng.next() * 4) / 2
    return narrow ? frame.f1 - cfg.room.narrowU / 2 : frame.f0 + cfg.exit.outerU + jitter
  })
  const quads = [0, 1, 2, 3].map((i) => {
    const p = place(i, mirror, MID / 2, MID / 2)
    return (p.x < MID ? 0 : 1) + (p.y < MID ? 0 : 1) * 2
  })
  const rooms: WarpRoom[] = shapes.map((shape, i) => {
    const before = (i + shapes.length - 1) % shapes.length
    const exit = localDoor(cfg, true, gaps[i]!, signs[i]!)
    const entry = localDoor(cfg, false, gaps[before]!, signs[before]!)
    const l = localRoom(cfg, shape, tall, [exit.zone, entry.zone])
    const at = (b: Box): Box => placeBox(i, mirror, b)
    const floor = at(l.floor)
    const plates = l.plates.map((b) => {
      const box = at(b)
      return { box, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
    })
    return {
      index: i,
      quad: quads[i]! === 2 ? 3 : quads[i]! === 3 ? 2 : quads[i]!,
      shape,
      sign: signs[i]!,
      recipe: recipes[i]!,
      slab: at({ x0: frame.slab0, y0: frame.slab0, x1: frame.slab1, y1: frame.slab1 }),
      floor,
      center: { x: (floor.x0 + floor.x1) / 2, y: (floor.y0 + floor.y1) / 2 },
      exit: placeDoor(i, mirror, exit),
      entry: placeDoor(i, mirror, entry),
      plates,
      pillars: l.pillars.map(at),
      pit: l.pit && at(l.pit),
      deck: l.deck && at(l.deck),
    }
  })
  const hall = rooms.find((r) => r.shape === 'hall')!
  const cell = BASIN_CELL_U * UNIT
  const n = Math.round(FRAME_U / BASIN_CELL_U)
  const parts = rooms.map((room) => {
    const keep = room.pit ? { x: (room.floor.x0 + 0.5) * UNIT, y: (room.floor.y0 + 0.5) * UNIT } : { x: room.center.x * UNIT, y: room.center.y * UNIT }
    const q = room.pillars.some((b) => inBox(b, keep.x / UNIT, keep.y / UNIT)) ? { x: (room.floor.x0 + 0.5) * UNIT, y: (room.floor.y0 + 0.5) * UNIT } : keep
    return makeBasin((x, y) => openIn(room, x / UNIT, y / UNIT), 0, 0, n, n, cell, q, cfg.neckU * UNIT)
  })
  const room = new Float32Array(n * n)
  for (let i = 0; i < room.length; i++) room[i] = Math.max(...parts.map((b) => b.room[i]!))
  const tiles = new Int8Array(FRAME_U * FRAME_U).fill(-1)
  for (const r of rooms) {
    for (let j = Math.floor(r.floor.y0); j < Math.ceil(r.floor.y1); j++) {
      for (let i = Math.floor(r.floor.x0); i < Math.ceil(r.floor.x1); i++) {
        const x = i + 0.5
        const y = j + 0.5
        if (!openIn(r, x, y) || r.plates.some((p) => inBox(p.box, x, y))) continue
        if (inBox(r.exit.zone, x, y) || inBox(r.entry.zone, x, y)) continue
        tiles[j * FRAME_U + i] = r.index
      }
    }
  }
  return { mirror, rooms, start: hall.center, basin: { cols: n, rows: n, cell, x0: 0, y0: 0, room }, basins: parts, tiles, core: { x: MID, y: MID } }
}

/** (x, y)（格）落在哪间房的象限里：在环上的次序 */
export function roomIndexAt(plan: WarpPlan, x: number, y: number): number {
  const quad = (x < MID ? 0 : 1) + (y < MID ? 0 : 1) * 2
  const q = quad === 2 ? 3 : quad === 3 ? 2 : quad
  return plan.rooms.find((r) => r.quad === q)!.index
}

/** 第 i 间的下一间：它的出口通到那里 */
export function nextRoom(plan: WarpPlan, i: number): WarpRoom {
  return plan.rooms[(i + 1) % plan.rooms.length]!
}
