import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { WarpConfig, WarpShape } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 方框正中，格：四间房绕着它，核心柱立在这里 */
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

/** 一根立着的圆柱的底面，格 */
export interface Disc {
  readonly x: number
  readonly y: number
  readonly r: number
}

/**
 * 一间房，格：在环上排第 index，方框里的象限 quad（0 左上、1 右上、2 右下、3 左下）；形状；季节（0 春到 3 冬，也是签名：主色与地板的待机律动）；
 * 平台与能走的方块；中心；传送台的圆心；出怪板；立柱、凹槽与机柜台；标本管；toward 是传送台朝下一间的方向
 */
export interface WarpRoom {
  readonly index: number
  readonly quad: number
  readonly shape: WarpShape
  readonly sign: number
  readonly slab: Box
  readonly floor: Box
  readonly center: Point
  readonly pad: Point
  readonly plates: readonly Plate[]
  readonly pillars: readonly Box[]
  readonly pit: Box | null
  readonly deck: Box | null
  readonly vault: Disc
  readonly toward: Point
}

/**
 * 这一局的跃迁站，格：四间房按环排（第 i 间的传送台送到第 i + 1 间），mirror 为真时环逆时针；队伍从开局那间的中心出发；
 * 能走的地面；每块瓷砖属于哪间房（不会亮的为 −1）；核心柱在正中
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

/** 一间房局部的尺寸：平台、能走的方块的两条边、传送台的圆心，格 */
export function roomFrame(cfg: WarpConfig): { readonly slab0: number; readonly slab1: number; readonly f0: number; readonly f1: number; readonly pad: Point } {
  const r = cfg.room
  const slab1 = MID - r.gapU
  const f1 = slab1 - r.lipU
  return {
    slab0: r.gapU,
    slab1,
    f0: r.gapU + r.lipU,
    f1,
    pad: { x: f1 - cfg.pad.edgeU - cfg.pad.radiusU, y: f1 - cfg.pad.cornerU },
  }
}

/** 一块沿墙的出怪板：板心在 (u, v)，沿 u（along 为 0）或沿 v 摆，局部坐标 */
function plate(cfg: WarpConfig, u: number, v: number, along: 0 | 1): Box {
  const h = cfg.emitters.plateU / 2
  return along === 0 ? { x0: u - h, y0: v - 0.5, x1: u + h, y1: v + 0.5 } : { x0: u - 0.5, y0: v - h, x1: u + 0.5, y1: v + h }
}

/** 一间房局部的布置：能走的方块，立柱、凹槽、机柜台、出怪板与标本管；标本管立在外角，狭长那间立在机柜台正中 */
function localRoom(cfg: WarpConfig, shape: WarpShape, tall: boolean): { floor: Box; pillars: Box[]; pit: Box | null; deck: Box | null; plates: Box[]; vault: Point } {
  const { f0, f1, pad } = roomFrame(cfg)
  const full: Box = { x0: f0, y0: f0, x1: f1, y1: f1 }
  const mid = (f0 + f1) / 2
  const near = cfg.emitters.plateU / 2 + 2
  const far = Math.round(f1 - (f1 - f0) * 0.38)
  const walls = [plate(cfg, f0 + near + 1, f0 + 0.5, 0), plate(cfg, far, f0 + 0.5, 0), plate(cfg, f0 + 0.5, f0 + near + 1, 1), plate(cfg, f0 + 0.5, far, 1)]
  const corner = { x: f0 + cfg.vault.insetU, y: f0 + cfg.vault.insetU }
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
        vault: { x: (f0 + cut) / 2, y: mid },
      }
    }
    return {
      floor: { x0: f0, y0: cut, x1: f1, y1: f1 },
      pillars: [],
      pit: null,
      deck: { x0: f0, y0: f0, x1: f1, y1: cut },
      plates: [plate(cfg, f0 + 0.5, cut + n / 2, 1), plate(cfg, f0 + near + 1, cut + 0.5, 0), plate(cfg, far - 1, cut + 0.5, 0)],
      vault: { x: mid, y: (f0 + cut) / 2 },
    }
  }
  if (shape === 'cloister') {
    const h = cfg.pitU / 2
    return { floor: full, pillars: [], pit: { x0: mid - h, y0: mid - h, x1: mid + h, y1: mid + h }, deck: null, plates: walls, vault: corner }
  }
  if (shape === 'pillars') {
    const p = cfg.pillars
    const list: Box[] = []
    for (let i = 0; i < p.count; i++) {
      for (let j = 0; j < p.count; j++) {
        const b: Box = { x0: f0 + p.firstU + i * p.stepU, y0: f0 + p.firstU + j * p.stepU, x1: f0 + p.firstU + i * p.stepU + p.sizeU, y1: f0 + p.firstU + j * p.stepU + p.sizeU }
        if (boxDist(b, pad.x, pad.y) < cfg.pad.radiusU + p.padClearU) continue
        list.push(b)
      }
    }
    return { floor: full, pillars: list, pit: null, deck: null, plates: walls, vault: corner }
  }
  return { floor: full, pillars: [], pit: null, deck: null, plates: walls, vault: corner }
}

/** (x, y) 能不能站：落在这间能走的方块里、不碰立柱、凹槽与标本管 */
function openIn(room: Pick<WarpRoom, 'floor' | 'pillars' | 'pit' | 'vault'>, x: number, y: number): boolean {
  if (!inBox(room.floor, x, y)) return false
  if (room.pit && inBox(room.pit, x, y)) return false
  if (Math.hypot(x - room.vault.x, y - room.vault.y) < room.vault.r) return false
  return !room.pillars.some((b) => inBox(b, x, y))
}

/**
 * 按种子摆一座跃迁站：环的方向；四种形状打乱分给四间房（狭长那间横竖也按种子）；四季顺着环排，从哪一季起按种子；
 * 队伍从大厅出发。能走的地面四间各算一遍距离场，取最大合成一张
 */
export function warpPlan(cfg: WarpConfig, seed: number): WarpPlan {
  const rng = new Rng(seed)
  const mirror = rng.next() < 0.5
  const shapes = shuffled(rng, SHAPES)
  const spring = Math.floor(rng.next() * 4)
  const tall = rng.next() < 0.5
  const frame = roomFrame(cfg)
  const quads = [0, 1, 2, 3].map((i) => {
    const p = place(i, mirror, MID / 2, MID / 2)
    return (p.x < MID ? 0 : 1) + (p.y < MID ? 0 : 1) * 2
  })
  const rooms: WarpRoom[] = shapes.map((shape, i) => {
    const l = localRoom(cfg, shape, tall)
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
      sign: (spring + i) % 4,
      slab: at({ x0: frame.slab0, y0: frame.slab0, x1: frame.slab1, y1: frame.slab1 }),
      floor,
      center: { x: (floor.x0 + floor.x1) / 2, y: (floor.y0 + floor.y1) / 2 },
      pad: place(i, mirror, frame.pad.x, frame.pad.y),
      plates,
      pillars: l.pillars.map(at),
      pit: l.pit && at(l.pit),
      deck: l.deck && at(l.deck),
      vault: { ...place(i, mirror, l.vault.x, l.vault.y), r: cfg.vault.radiusU },
      toward: placeDir(i, mirror, 1, 0),
    }
  })
  const hall = rooms.find((r) => r.shape === 'hall')!
  const cell = BASIN_CELL_U * UNIT
  const n = Math.round(FRAME_U / BASIN_CELL_U)
  const parts = rooms.map((room) => makeBasin((x, y) => openIn(room, x / UNIT, y / UNIT), 0, 0, n, n, cell, { x: room.pad.x * UNIT, y: room.pad.y * UNIT }, cfg.neckU * UNIT))
  const room = new Float32Array(n * n)
  for (let i = 0; i < room.length; i++) room[i] = Math.max(...parts.map((b) => b.room[i]!))
  const tiles = new Int8Array(FRAME_U * FRAME_U).fill(-1)
  for (const r of rooms) {
    for (let j = Math.floor(r.floor.y0); j < Math.ceil(r.floor.y1); j++) {
      for (let i = Math.floor(r.floor.x0); i < Math.ceil(r.floor.x1); i++) {
        const x = i + 0.5
        const y = j + 0.5
        if (!openIn(r, x, y) || r.plates.some((p) => inBox(p.box, x, y))) continue
        if (Math.hypot(x - r.pad.x, y - r.pad.y) < cfg.pad.radiusU + 0.25) continue
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

/** 第 i 间的下一间：它的传送台送到那里 */
export function nextRoom(plan: WarpPlan, i: number): WarpRoom {
  return plan.rooms[(i + 1) % plan.rooms.length]!
}
