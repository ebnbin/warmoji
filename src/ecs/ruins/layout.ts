import { FRAME_U, SAFE_U, UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../worlds/basin.ts'
import { bodyField, carve, cellCenter, relax, settle, spill } from './masonry.ts'
import type { Basin } from '../worlds/basin'
import type { RuinsConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Fall, Grid, Masonry, Strength, Structure, StructureKind } from './masonry'

const DEG = Math.PI / 180
/** 砌体格子在院落外框外多留这么宽（格）：外墙塌下来的碎石落得下 */
const GRID_PAD_U = 4
/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 年久失修时墙顶按这么长（格）一段一段地塌：一块石头的长度 */
const STONE_U = 0.5
/** 门洞离墙的两头至少留这么多（格） */
const DOOR_END_U = 0.5
/** 生成不出合格的院落就换一组随机数重来，最多这么多次 */
const TRIES = 40
/** 窄口最多塌这么多遍 */
const NECK_PASSES = 12

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 种子打散：相邻的种子也生成很不一样的院落 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x2c1b3c6d) >>> 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

function count(rng: Rng, r: readonly [number, number]): number {
  return rng.int(r[0], r[1])
}

/** 院落的局部坐标：外框 [0, w] × [0, h] 格，绕外框中心转 tilt 弧度，中心落在世界 (cx, cy) 格 */
export interface Frame {
  readonly cos: number
  readonly sin: number
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
}

export function toWorld(f: Frame, u: number, v: number): Point {
  const a = u - f.w / 2
  const b = v - f.h / 2
  return { x: f.cx + a * f.cos - b * f.sin, y: f.cy + a * f.sin + b * f.cos }
}

export function toLocal(f: Frame, x: number, y: number): { u: number; v: number } {
  const a = x - f.cx
  const b = y - f.cy
  return { u: a * f.cos + b * f.sin + f.w / 2, v: -a * f.sin + b * f.cos + f.h / 2 }
}

/** 一块地面：房间、塔楼里、回廊、回廊院；局部坐标里的方框（格），铺地的样式与破损的程度 */
export type SpaceKind = 'room' | 'tower' | 'walk' | 'garth'
export interface Space {
  readonly kind: SpaceKind
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
  readonly style: number
  readonly worn: number
}

/** 一道门洞：开在沿 axis 的墙上，沿墙从 a 到 b，墙的中线在横向坐标 line、厚 thick（格）；outer 是通到院外的 */
export interface Door {
  readonly axis: 0 | 1
  readonly a: number
  readonly b: number
  readonly line: number
  readonly thick: number
  readonly outer: boolean
}

/** 倒在地上的石柱：柱脚在局部 (u, v)，朝 (du, dv) 倒下，柱身长 len、半径 r（格） */
export interface Fallen {
  readonly u: number
  readonly v: number
  readonly du: number
  readonly dv: number
  readonly len: number
  readonly r: number
}

/** 台地边外的一棵树：树冠的圆心、半径（格）与树高（米） */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/**
 * 按种子生成的残垣：地图 w × h 格；院落的局部坐标与砌体格子，开局时每格剩几层石块、属于哪一处、封着的木板与地上的碎石；
 * 各块地面、门洞、倒下的石柱；台地（能走的地面，像素）与台地边外的树；开局时队伍站的回廊院中心（世界格）
 */
export interface RuinsPlan {
  readonly w: number
  readonly h: number
  readonly frame: Frame
  readonly grid: Grid
  readonly structures: readonly Structure[]
  readonly n: Uint8Array
  readonly sid: Uint16Array
  readonly timber: Uint8Array
  readonly rubble: Float32Array
  readonly spaces: readonly Space[]
  readonly doors: readonly Door[]
  readonly fallen: readonly Fallen[]
  readonly basin: Basin
  readonly trees: readonly Tree[]
  readonly start: Point
  readonly seed: number
}

/** 生成残垣要知道的规则：砌体与木板的强度，标准身高的身体跨得过几层石块、身体的半径（格） */
export interface PlanRules {
  readonly strength: Strength
  readonly walk: number
  readonly bodyU: number
}

/** 按配置与砌体格子造一份可以改的砌体 */
export function makeMasonry(cfg: RuinsConfig, grid: Grid, structures: readonly Structure[], n: Uint8Array, sid: Uint16Array, timber: Uint8Array, rubble: Float32Array): Masonry {
  return {
    grid,
    courseM: cfg.masonry.courseM,
    cellM: grid.cell * cfg.meterPerU,
    bond: cfg.masonry.bond,
    reposeTan: Math.tan(cfg.rubble.reposeDeg * DEG),
    density: cfg.masonry.density,
    structures,
    n,
    sid,
    timber,
    rubble,
  }
}

interface Rect {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/** 房间图里的一个房间：方框是墙中线围出的范围；它挨着哪几面外墙（0 上、1 右、2 下、3 左） */
interface Room extends Rect {
  readonly kind: 'room' | 'tower'
  readonly outer: readonly number[]
}

/** 房间图里的一条边：两头是房间的序号（court 是回廊、outside 是院外），中间隔着一道墙 */
interface Edge {
  readonly a: number
  readonly b: number
  readonly door: Omit<Door, 'a' | 'b'> & { readonly from: number; readonly to: number }
}

const COURT = -1
const OUTSIDE = -2

/** 把长 len 的一段切成几间，每间在 roomU 的范围里，切口稍稍错开 */
function cuts(rng: Rng, from: number, to: number, room: readonly [number, number]): number[] {
  const len = to - from
  const k = Math.max(1, Math.round(len / between(rng, room)))
  const out = [from]
  for (let i = 1; i < k; i++) out.push(from + (len * i) / k + (rng.next() - 0.5) * (len / k) * 0.3)
  out.push(to)
  return out
}

interface Draft {
  readonly W: number
  readonly H: number
  readonly court: Rect
  readonly garth: Rect
  readonly rooms: Room[]
  readonly tower: number
  readonly edges: Edge[]
  readonly lines: { readonly axis: 0 | 1; readonly line: number; readonly a: number; readonly b: number; readonly kind: StructureKind; readonly thick: number }[]
}

/**
 * 院落的平面：中间是回廊院，四周一圈房间，一角是塔楼；墙都在房间的边界上。
 * 尺寸都按同一个比例往下限收：外框的边长加上回廊院偏开中心的那点，不超过 sideU 格
 */
function draft(cfg: RuinsConfig, rng: Rng, sideU: number): Draft {
  const P = cfg.plan
  const T = P.wallU
  const least = 2 * P.depthU[0] + P.garthU[0] + 2 * P.walkU
  const most = 2 * P.depthU[1] + P.garthU[1] + 2 * P.walkU
  const k = Math.min(1, Math.max(0, (sideU - least) / (most - least + P.depthU[1] - P.depthU[0])))
  const pick = (r: readonly [number, number]): number => between(rng, [r[0], r[0] + (r[1] - r[0]) * k])
  const gW = pick(P.garthU)
  const gH = pick(P.garthU)
  const dL = pick(P.depthU)
  const dR = pick(P.depthU)
  const dT = pick(P.depthU)
  const dB = pick(P.depthU)
  const cW = gW + 2 * P.walkU
  const cH = gH + 2 * P.walkU
  const W = dL + cW + dR
  const H = dT + cH + dB
  const court = { u0: dL, v0: dT, u1: dL + cW, v1: dT + cH }
  const garth = { u0: court.u0 + P.walkU, v0: court.v0 + P.walkU, u1: court.u1 - P.walkU, v1: court.v1 - P.walkU }
  const top = cuts(rng, court.u0, court.u1, P.roomU)
  const bottom = cuts(rng, court.u0, court.u1, P.roomU)
  const left = cuts(rng, court.v0, court.v1, P.roomU)
  const right = cuts(rng, court.v0, court.v1, P.roomU)
  const rooms: Room[] = []
  const tower = rng.int(0, 3)
  const corner = (k: number, r: Rect, outer: number[]): number => {
    rooms.push({ ...r, kind: k === tower ? 'tower' : 'room', outer })
    return rooms.length - 1
  }
  const TL = corner(0, { u0: 0, v0: 0, u1: court.u0, v1: court.v0 }, [0, 3])
  const TR = corner(1, { u0: court.u1, v0: 0, u1: W, v1: court.v0 }, [0, 1])
  const BR = corner(2, { u0: court.u1, v0: court.v1, u1: W, v1: H }, [1, 2])
  const BL = corner(3, { u0: 0, v0: court.v1, u1: court.u0, v1: H }, [2, 3])
  const side = (cs: number[], make: (a: number, b: number) => Rect, outer: number): number[] => {
    const ids: number[] = []
    for (let k = 0; k + 1 < cs.length; k++) {
      rooms.push({ ...make(cs[k]!, cs[k + 1]!), kind: 'room', outer: [outer] })
      ids.push(rooms.length - 1)
    }
    return ids
  }
  const topIds = side(top, (a, b) => ({ u0: a, v0: 0, u1: b, v1: court.v0 }), 0)
  const rightIds = side(right, (a, b) => ({ u0: court.u1, v0: a, u1: W, v1: b }), 1)
  const bottomIds = side(bottom, (a, b) => ({ u0: a, v0: court.v1, u1: b, v1: H }), 2)
  const leftIds = side(left, (a, b) => ({ u0: 0, v0: a, u1: court.u0, v1: b }), 3)
  const towerT = T.tower
  const thickOf = (r: number): number => (rooms[r]?.kind === 'tower' ? towerT : T.inner)
  const edges: Edge[] = []
  const wall = (a: number, b: number, axis: 0 | 1, line: number, from: number, to: number, thick: number, outer = false): void => {
    edges.push({ a, b, door: { axis, line, thick, outer, from, to } })
  }
  // 房间与房间：同一排相邻的隔墙，角上的房间与两排的端头
  const chain = (ids: number[], axis: 0 | 1, at: (k: number) => number, span: (r: Room) => [number, number]): void => {
    for (let k = 0; k + 1 < ids.length; k++) {
      const r = rooms[ids[k]!]!
      const [p, q] = span(r)
      wall(ids[k]!, ids[k + 1]!, axis, at(k + 1), p, q, T.inner)
    }
  }
  chain(topIds, 1, (k) => top[k]!, (r) => [r.v0 + T.outer, r.v1])
  chain(bottomIds, 1, (k) => bottom[k]!, (r) => [r.v0, r.v1 - T.outer])
  chain(leftIds, 0, (k) => left[k]!, (r) => [r.u0 + T.outer, r.u1])
  chain(rightIds, 0, (k) => right[k]!, (r) => [r.u0, r.u1 - T.outer])
  const tk = (a: number, b: number): number => Math.max(thickOf(a), thickOf(b))
  wall(TL, topIds[0]!, 1, court.u0, T.outer, court.v0, tk(TL, topIds[0]!))
  wall(TL, leftIds[0]!, 0, court.v0, T.outer, court.u0, tk(TL, leftIds[0]!))
  wall(TR, topIds[topIds.length - 1]!, 1, court.u1, T.outer, court.v0, tk(TR, topIds[topIds.length - 1]!))
  wall(TR, rightIds[0]!, 0, court.v0, court.u1, W - T.outer, tk(TR, rightIds[0]!))
  wall(BR, bottomIds[bottomIds.length - 1]!, 1, court.u1, court.v1, H - T.outer, tk(BR, bottomIds[bottomIds.length - 1]!))
  wall(BR, rightIds[rightIds.length - 1]!, 0, court.v1, court.u1, W - T.outer, tk(BR, rightIds[rightIds.length - 1]!))
  wall(BL, bottomIds[0]!, 1, court.u0, court.v1, H - T.outer, tk(BL, bottomIds[0]!))
  wall(BL, leftIds[leftIds.length - 1]!, 0, court.v1, T.outer, court.u0, tk(BL, leftIds[leftIds.length - 1]!))
  // 房间与回廊
  for (const id of topIds) wall(id, COURT, 0, court.v0, rooms[id]!.u0, rooms[id]!.u1, T.inner)
  for (const id of bottomIds) wall(id, COURT, 0, court.v1, rooms[id]!.u0, rooms[id]!.u1, T.inner)
  for (const id of leftIds) wall(id, COURT, 1, court.u0, rooms[id]!.v0, rooms[id]!.v1, T.inner)
  for (const id of rightIds) wall(id, COURT, 1, court.u1, rooms[id]!.v0, rooms[id]!.v1, T.inner)
  // 房间与院外：外墙贴着外框，中线在墙厚的一半
  rooms.forEach((r, id) => {
    const t = r.kind === 'tower' ? towerT : T.outer
    const u0 = r.u0 === 0 ? t : r.u0
    const u1 = r.u1 === W ? W - t : r.u1
    const v0 = r.v0 === 0 ? t : r.v0
    const v1 = r.v1 === H ? H - t : r.v1
    for (const s of r.outer) {
      if (s === 0) wall(id, OUTSIDE, 0, t / 2, u0, u1, t, true)
      if (s === 2) wall(id, OUTSIDE, 0, H - t / 2, u0, u1, t, true)
      if (s === 3) wall(id, OUTSIDE, 1, t / 2, v0, v1, t, true)
      if (s === 1) wall(id, OUTSIDE, 1, W - t / 2, v0, v1, t, true)
    }
  })
  const lines: Draft['lines'][number][] = [
    { axis: 0, line: T.outer / 2, a: 0, b: W, kind: 'outer', thick: T.outer },
    { axis: 0, line: H - T.outer / 2, a: 0, b: W, kind: 'outer', thick: T.outer },
    { axis: 1, line: T.outer / 2, a: 0, b: H, kind: 'outer', thick: T.outer },
    { axis: 1, line: W - T.outer / 2, a: 0, b: H, kind: 'outer', thick: T.outer },
    { axis: 0, line: court.v0, a: T.outer / 2, b: W - T.outer / 2, kind: 'inner', thick: T.inner },
    { axis: 0, line: court.v1, a: T.outer / 2, b: W - T.outer / 2, kind: 'inner', thick: T.inner },
    { axis: 1, line: court.u0, a: T.outer / 2, b: H - T.outer / 2, kind: 'inner', thick: T.inner },
    { axis: 1, line: court.u1, a: T.outer / 2, b: H - T.outer / 2, kind: 'inner', thick: T.inner },
  ]
  for (let k = 1; k + 1 < top.length; k++) lines.push({ axis: 1, line: top[k]!, a: T.outer / 2, b: court.v0, kind: 'inner', thick: T.inner })
  for (let k = 1; k + 1 < bottom.length; k++) lines.push({ axis: 1, line: bottom[k]!, a: court.v1, b: H - T.outer / 2, kind: 'inner', thick: T.inner })
  for (let k = 1; k + 1 < left.length; k++) lines.push({ axis: 0, line: left[k]!, a: T.outer / 2, b: court.u0, kind: 'inner', thick: T.inner })
  for (let k = 1; k + 1 < right.length; k++) lines.push({ axis: 0, line: right[k]!, a: court.u1, b: W - T.outer / 2, kind: 'inner', thick: T.inner })
  const tr = rooms.find((r) => r.kind === 'tower')!
  const ua = Math.max(0, tr.u0 - towerT / 2)
  const ub = Math.min(W, tr.u1 + towerT / 2)
  const va = Math.max(0, tr.v0 - towerT / 2)
  const vb = Math.min(H, tr.v1 + towerT / 2)
  lines.push(
    { axis: 0, line: tr.v0 === 0 ? towerT / 2 : tr.v0, a: ua, b: ub, kind: 'tower', thick: towerT },
    { axis: 0, line: tr.v1 === H ? H - towerT / 2 : tr.v1, a: ua, b: ub, kind: 'tower', thick: towerT },
    { axis: 1, line: tr.u0 === 0 ? towerT / 2 : tr.u0, a: va, b: vb, kind: 'tower', thick: towerT },
    { axis: 1, line: tr.u1 === W ? W - towerT / 2 : tr.u1, a: va, b: vb, kind: 'tower', thick: towerT },
  )
  return { W, H, court, garth, rooms, tower, edges, lines }
}

/** 把门洞放在墙上：离两头至少半格加交叉墙厚的一半，放不下就不开 */
function placeDoor(cfg: RuinsConfig, rng: Rng, e: Edge): Door | null {
  const w = between(rng, cfg.plan.doorU)
  const margin = DOOR_END_U + cfg.plan.wallU.inner / 2
  const lo = Math.min(e.door.from, e.door.to) + margin
  const hi = Math.max(e.door.from, e.door.to) - margin
  if (hi - lo < w) return null
  const c = lo + w / 2 + rng.next() * (hi - lo - w)
  return { axis: e.door.axis, a: c - w / 2, b: c + w / 2, line: e.door.line, thick: e.door.thick, outer: e.door.outer }
}

/**
 * 开哪些门：先在每道墙上试着放一个门洞，放得下的墙才算连着；随机生成树把每个房间、回廊与院外连起来，再多开几道门，
 * 通到院外的门至少 gates[0] 道。连不起来就返回 null
 */
function pickDoors(cfg: RuinsConfig, rng: Rng, d: Draft): Door[] | null {
  const P = cfg.plan
  const n = d.rooms.length + 2
  const node = (k: number): number => (k === COURT ? d.rooms.length : k === OUTSIDE ? d.rooms.length + 1 : k)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const feasible: { e: Edge; door: Door; w: number }[] = []
  for (const e of d.edges) {
    const door = placeDoor(cfg, rng, e)
    if (door) feasible.push({ e, door, w: rng.next() + (e.b === OUTSIDE ? 0.35 : 0) })
  }
  feasible.sort((a, b) => a.w - b.w)
  const chosen: Door[] = []
  const rest: { e: Edge; door: Door }[] = []
  let joins = 0
  for (const f of feasible) {
    const a = find(node(f.e.a))
    const b = find(node(f.e.b))
    if (a !== b) {
      parent[a] = b
      chosen.push(f.door)
      joins++
    } else rest.push(f)
  }
  if (joins < n - 1) return null
  let gates = chosen.filter((x) => x.outer).length
  const want = count(rng, P.gates)
  for (const f of rest) {
    if (f.e.b === OUTSIDE) {
      if (gates < want) {
        chosen.push(f.door)
        gates++
      }
    } else if (rng.next() < P.loops) chosen.push(f.door)
  }
  return chosen
}

/** 往砌体格子里填一处砌体：格心落在方框里（或圆里）的格子归它，高 courses 层 */
function stamp(m: Masonry, id: number, r: Rect, courses: number, disc: { u: number; v: number; r: number } | null): void {
  const g = m.grid
  const i0 = Math.max(0, Math.floor((r.u0 - g.u0) / g.cell))
  const i1 = Math.min(g.cols - 1, Math.ceil((r.u1 - g.u0) / g.cell))
  const j0 = Math.max(0, Math.floor((r.v0 - g.v0) / g.cell))
  const j1 = Math.min(g.rows - 1, Math.ceil((r.v1 - g.v0) / g.cell))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const u = g.u0 + (i + 0.5) * g.cell
      const v = g.v0 + (j + 0.5) * g.cell
      if (u < r.u0 || u > r.u1 || v < r.v0 || v > r.v1) continue
      if (disc && (u - disc.u) ** 2 + (v - disc.v) ** 2 > disc.r * disc.r) continue
      const idx = j * g.cols + i
      m.sid[idx] = id
      m.n[idx] = courses
    }
  }
}

/** 门洞：方框里的格子清空 */
function clear(m: Masonry, r: Rect): void {
  const g = m.grid
  for (let j = 0; j < g.rows; j++) {
    const v = g.v0 + (j + 0.5) * g.cell
    if (v < r.v0 || v > r.v1) continue
    for (let i = 0; i < g.cols; i++) {
      const u = g.u0 + (i + 0.5) * g.cell
      if (u < r.u0 || u > r.u1) continue
      m.sid[j * g.cols + i] = 0
      m.n[j * g.cols + i] = 0
    }
  }
}

function doorRect(d: Door, pad: number): Rect {
  return d.axis === 0
    ? { u0: d.a, v0: d.line - d.thick / 2 - pad, u1: d.b, v1: d.line + d.thick / 2 + pad }
    : { u0: d.line - d.thick / 2 - pad, v0: d.a, u1: d.line + d.thick / 2 + pad, v1: d.b }
}

/** 到中心在原点、半宽 (a, b) 的方框的有符号距离 */
function boxDist(x: number, y: number, a: number, b: number): number {
  const qx = Math.abs(x) - a
  const qy = Math.abs(y) - b
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/**
 * 年久失修：墙顶按低频噪声往下塌掉几成，几处拆到只剩墙基；再预演几次破坏。塌下来的石块大多早被人搬走，
 * 剩下 decay.rubble 那么多堆在墙脚；石柱有的折断、有的整根倒在地上
 */
function ruin(cfg: RuinsConfig, k0: Strength, rng: Rng, m: Masonry, d: Draft, seed: number): Fallen[] {
  const D = cfg.decay
  const g = m.grid
  const hc = m.courseM
  const area = m.cellM * m.cellM
  const falls: Fall[] = []
  const walls: number[] = []
  for (let i = 0; i < m.n.length; i++) {
    const s = m.sid[i]!
    if (s === 0) continue
    const st = m.structures[s - 1]!
    if (st.kind === 'column') continue
    const c = cellCenter(g, i)
    const along = Math.floor((st.axis === 0 ? c.u : c.v) / STONE_U) * STONE_U
    const t = smooth(0.25, 0.75, fbm(along / D.waveU + s * 7.31, s * 3.17, seed + 101, 3))
    const keep = st.kind === 'parapet' ? 0.6 + 0.4 * t : D.keep[0] + (D.keep[1] - D.keep[0]) * t
    const n0 = m.n[i]!
    const n1 = Math.round(n0 * keep)
    if (n1 < n0) falls.push({ i, z0: n1 * hc, z1: n0 * hc, volume: (n0 - n1) * hc * area * D.rubble, timber: false })
    m.n[i] = n1
    if (st.kind !== 'parapet') walls.push(i)
  }
  for (let k = count(rng, D.razed); k > 0 && walls.length > 0; k--) {
    const at = walls[Math.floor(rng.next() * walls.length)]!
    const c = cellCenter(g, at)
    const sid = m.sid[at]!
    const st0 = m.structures[sid - 1]!
    const a0 = st0.axis === 0 ? c.u : c.v
    const r = between(rng, D.razeU)
    const floor = Math.floor(rng.next() * 2)
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const idx = j * g.cols + i
        if (m.sid[idx] !== sid) continue
        const u = g.u0 + (i + 0.5) * g.cell
        const v = g.v0 + (j + 0.5) * g.cell
        const dd = Math.abs(Math.floor((st0.axis === 0 ? u : v) / STONE_U) * STONE_U - a0)
        if (dd > r) continue
        const cap = dd < r * 0.6 ? floor : floor + Math.ceil(((dd - r * 0.6) / (r * 0.4)) * 3)
        if (m.n[idx]! > cap) {
          falls.push({ i: idx, z0: cap * hc, z1: m.n[idx]! * hc, volume: (m.n[idx]! - cap) * hc * area * D.rubble, timber: false })
          m.n[idx] = cap
        }
      }
    }
  }
  const all: number[] = []
  for (let i = 0; i < m.n.length; i++) if (m.sid[i]) all.push(i)
  const settled: Fall[] = []
  relax(m, all, settled)
  for (const f of settled) falls.push({ ...f, volume: f.volume * D.rubble })
  spill(m, falls, null, () => rng.next())
  const fallen: Fallen[] = []
  m.structures.forEach((st, k) => {
    if (st.kind !== 'column') return
    const id = k + 1
    const r = rng.next()
    const cu = (st.u0 + st.u1) / 2
    const cv = (st.v0 + st.v1) / 2
    const cells: number[] = []
    for (let i = 0; i < m.n.length; i++) if (m.sid[i] === id) cells.push(i)
    const G = d.garth
    const n0 = Math.max(...cells.map((i) => m.n[i]!))
    const rad = (st.u1 - st.u0) / 2
    const len = ((n0 - 1) * hc) / cfg.meterPerU
    const onSide = Math.min(Math.abs(cu - G.u0), Math.abs(cu - G.u1)) < Math.min(Math.abs(cv - G.v0), Math.abs(cv - G.v1))
    const a = (onSide ? (rng.next() < 0.5 ? 0 : Math.PI) : rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (rng.next() - 0.5) * 1.2
    const du = Math.cos(a)
    const dv = Math.sin(a)
    const clear = fallen.every((o) => segGap(cu, cv, cu + du * len, cv + dv * len, o.u, o.v, o.u + o.du * o.len, o.v + o.dv * o.len) > rad + o.r)
    if (r < D.fallen && clear) {
      for (const i of cells) m.n[i] = Math.min(m.n[i]!, 1)
      fallen.push({ u: cu, v: cv, du, dv, len, r: rad * 0.92 })
    } else if (r < D.fallen + D.broken) {
      const keep = 0.25 + 0.45 * rng.next()
      for (const i of cells) m.n[i] = Math.round(m.n[i]! * keep)
      const out: Fall[] = []
      relax(m, cells, out)
    }
  })
  for (const f of fallen) {
    const steps = Math.ceil(f.len / (g.cell * 0.5))
    for (let k = 1; k <= steps; k++) {
      const s = (k / steps) * f.len
      for (let w = -f.r; w <= f.r; w += g.cell * 0.5) {
        const u = f.u + f.du * s - f.dv * w
        const v = f.v + f.dv * s + f.du * w
        const i = Math.floor((u - g.u0) / g.cell)
        const j = Math.floor((v - g.v0) / g.cell)
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue
        const idx = j * g.cols + i
        if (m.n[idx] === 0 && m.timber[idx] === 0) m.rubble[idx] = Math.max(m.rubble[idx]!, 2 * f.r * cfg.meterPerU * Math.sqrt(Math.max(0, 1 - (w / f.r) ** 2)))
      }
    }
  }
  for (let k = count(rng, D.breaches); k > 0 && walls.length > 0; k--) {
    const i = walls[Math.floor(rng.next() * walls.length)]!
    if (m.n[i]! < 4) continue
    const c = cellCenter(g, i)
    const st = m.structures[m.sid[i]! - 1]!
    const z = 0.3 + rng.next() * Math.min(m.n[i]! * hc - 0.3, 2)
    const side = rng.next() < 0.5 ? -1 : 1
    const away = st.axis === 0 ? { u: c.u, v: c.v + side } : { u: c.u + side, v: c.v }
    const out: Fall[] = []
    carve(m, k0, c.u, c.v, z, between(rng, D.breachM3), out)
    spill(m, out, away, () => rng.next())
  }
  settle(m, 0, 0, g.cols - 1, g.rows - 1, 24)
  return fallen
}

/**
 * 墙上窄过 gapU 格的缺口补回 walk + 1 层：横过墙厚的那排格子连同两侧紧挨着的都跨得过 walk 层、没封木板才算缺口，顺着墙线数宽；
 * 补完被四面挡死、只剩砌体的跨得过的小块也补上
 */
function closeSlots(m: Masonry, walk: number, gapU: number): void {
  const g = m.grid
  const low = (i: number): boolean => m.n[i]! <= walk && m.timber[i] === 0
  const raise = (i: number): void => {
    if (m.sid[i] === 0) return
    m.n[i] = walk + 1
    m.rubble[i] = 0
  }
  for (const st of m.structures) {
    if (st.axis < 0) continue
    const alongU = st.axis === 0
    const len = alongU ? g.cols : g.rows
    const wide = alongU ? g.rows : g.cols
    const span = (lo: number, hi: number, origin: number, count: number): [number, number] => [Math.max(0, Math.ceil((lo - origin) / g.cell - 0.5)), Math.min(count - 1, Math.floor((hi - origin) / g.cell - 0.5))]
    const [c0, c1] = alongU ? span(st.v0, st.v1, g.v0, g.rows) : span(st.u0, st.u1, g.u0, g.cols)
    const [a0, a1] = alongU ? span(st.u0, st.u1, g.u0, g.cols) : span(st.v0, st.v1, g.v0, g.rows)
    const at = (a: number, c: number): number => (alongU ? c * g.cols + a : a * g.cols + c)
    const open = (a: number): boolean => {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(wide - 1, c1 + 1); c++) if (!low(at(a, c))) return false
      return true
    }
    for (let a = a0; a <= a1; a++) {
      if (!open(a)) continue
      let lo = a
      let hi = a
      while (lo > 0 && open(lo - 1)) lo--
      while (hi + 1 < len && open(hi + 1)) hi++
      a = hi
      if ((hi - lo + 1) * g.cell >= gapU - 1e-9) continue
      for (let k = lo; k <= hi; k++) for (let c = c0; c <= c1; c++) raise(at(k, c))
    }
  }
  const seen = new Uint8Array(m.n.length)
  for (let s0 = 0; s0 < m.n.length; s0++) {
    if (seen[s0] || !low(s0)) continue
    const part = [s0]
    seen[s0] = 1
    let floor = false
    for (let t = 0; t < part.length; t++) {
      const i = part[t]!
      if (m.sid[i] === 0) floor = true
      const ci = i % g.cols
      for (const j of [ci > 0 ? i - 1 : -1, ci < g.cols - 1 ? i + 1 : -1, i - g.cols, i + g.cols]) {
        if (j < 0 || j >= m.n.length || seen[j] || !low(j)) continue
        seen[j] = 1
        part.push(j)
      }
    }
    if (!floor) for (const i of part) raise(i)
  }
}

/**
 * 窄口最窄处的格子：标准身体站得下的格子（离挡人处至少 bodyU 格）从远到近并成连通块，两片大个子站得下的地方（差一格够 capU 的也算）
 * 在不到 capU 的格子上连上就是窄口；再从近到远把格子并到挡人的东西上（八邻接），两块挡人的东西在不到 capU 的格子上连上就是窄缝
 */
function findNecks(m: Masonry, walk: number, bodyU: number, capU: number): number[] {
  const g = m.grid
  const room = bodyField(m, walk)
  const size = room.length
  const out: number[] = []
  const parent = new Int32Array(size).fill(-1)
  const find = (i: number): number => {
    let r = i
    while (parent[r] !== r) r = parent[r]!
    while (parent[i] !== r) {
      const next = parent[i]!
      parent[i] = r
      i = next
    }
    return r
  }
  const stand: number[] = []
  for (let i = 0; i < size; i++) if (room[i]! >= bodyU) stand.push(i)
  stand.sort((a, b) => room[b]! - room[a]!)
  const big = new Uint8Array(size)
  const roots: number[] = []
  for (const c of stand) {
    const ci = c % g.cols
    roots.length = 0
    let bigs = 0
    for (const q of [ci > 0 ? c - 1 : -1, ci < g.cols - 1 ? c + 1 : -1, c - g.cols, c + g.cols]) {
      if (q < 0 || q >= size || parent[q] === -1) continue
      const b = find(q)
      if (roots.includes(b)) continue
      roots.push(b)
      bigs += big[b]!
    }
    if (bigs > 1 && room[c]! < capU) out.push(c)
    parent[c] = c
    big[c] = room[c]! >= capU - g.cell ? 1 : 0
    for (const b of roots) {
      parent[b] = c
      big[c] = big[c]! | big[b]!
    }
  }
  parent.fill(-1)
  const near = (c: number, visit: (q: number) => void): void => {
    const ci = c % g.cols
    const cj = (c - ci) / g.cols
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if ((di === 0 && dj === 0) || ci + di < 0 || cj + dj < 0 || ci + di >= g.cols || cj + dj >= g.rows) continue
        const q = c + dj * g.cols + di
        if (parent[q] !== -1) visit(q)
      }
    }
  }
  for (let c = 0; c < size; c++) {
    if (room[c]! >= bodyU) continue
    parent[c] = c
    near(c, (q) => {
      const a = find(c)
      const b = find(q)
      if (a !== b) parent[a] = b
    })
  }
  for (let k = stand.length - 1; k >= 0; k--) {
    const c = stand[k]!
    if (room[c]! >= capU) break
    parent[c] = c
    let joins = 0
    near(c, (q) => {
      const a = find(c)
      const b = find(q)
      if (a === b) return
      parent[a] = b
      joins++
    })
    if (joins > 1) out.push(c)
  }
  return out
}

/**
 * 窄口（见 findNecks）最窄处 bodyCapU 以内的砌体塌到跨得过，碰到的石柱整根折断、木板整道拆掉，塌下的石块留 decay.rubble 那么多；
 * 反复到没有窄口为止
 */
function openNecks(cfg: RuinsConfig, m: Masonry, rules: PlanRules, rng: Rng): void {
  const g = m.grid
  const hc = m.courseM
  const area = m.cellM * m.cellM
  const walk = rules.walk
  const reach = cfg.bodyCapU / g.cell + 0.5
  for (let pass = 0; pass < NECK_PASSES; pass++) {
    const necks = findNecks(m, walk, rules.bodyU, cfg.bodyCapU)
    if (necks.length === 0) return
    const falls: Fall[] = []
    const lowered: number[] = []
    const drop = (k: number): void => {
      if (m.n[k]! <= walk) return
      falls.push({ i: k, z0: walk * hc, z1: m.n[k]! * hc, volume: (m.n[k]! - walk) * hc * area * cfg.decay.rubble, timber: false })
      m.n[k] = walk
      lowered.push(k)
    }
    const unboard = (k: number): void => {
      const line = [k]
      m.timber[k] = 0
      for (let t = 0; t < line.length; t++) {
        const i = line[t]!
        const ci = i % g.cols
        for (const q of [ci > 0 ? i - 1 : -1, ci < g.cols - 1 ? i + 1 : -1, i - g.cols, i + g.cols]) {
          if (q < 0 || q >= m.timber.length || m.timber[q] === 0) continue
          m.timber[q] = 0
          line.push(q)
        }
      }
      lowered.push(...line)
    }
    for (const c of necks) {
      const ci = c % g.cols
      const cj = (c - ci) / g.cols
      for (let j = Math.max(0, Math.floor(cj - reach)); j <= Math.min(g.rows - 1, Math.ceil(cj + reach)); j++) {
        for (let i = Math.max(0, Math.floor(ci - reach)); i <= Math.min(g.cols - 1, Math.ceil(ci + reach)); i++) {
          const k = j * g.cols + i
          if ((i - ci) ** 2 + (j - cj) ** 2 > reach * reach) continue
          if (m.timber[k]! > 0) unboard(k)
          if (m.n[k]! <= walk) continue
          const s = m.sid[k]!
          if (s > 0 && m.structures[s - 1]!.kind === 'column') {
            for (let q = 0; q < m.n.length; q++) if (m.sid[q] === s) drop(q)
          } else drop(k)
        }
      }
    }
    if (lowered.length === 0) return
    const settled: Fall[] = []
    relax(m, lowered, settled)
    for (const f of settled) falls.push({ ...f, volume: f.volume * cfg.decay.rubble })
    spill(m, falls, null, () => rng.next())
  }
}

/** 两条线段之间最近的距离 */
function segGap(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const toSeg = (px: number, py: number, x0: number, y0: number, x1: number, y1: number): number => {
    const ex = x1 - x0
    const ey = y1 - y0
    const t = Math.max(0, Math.min(1, ((px - x0) * ex + (py - y0) * ey) / (ex * ex + ey * ey || 1)))
    return Math.hypot(px - x0 - ex * t, py - y0 - ey * t)
  }
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(toSeg(ax, ay, cx, cy, dx, dy), toSeg(bx, by, cx, cy, dx, dy), toSeg(cx, cy, ax, ay, bx, by), toSeg(dx, dy, ax, ay, bx, by))
}

/** 回廊院四周的柱廊：一圈矮墙，石柱按不小于 spacingU 的柱距立在矮墙上；每边挑一两个柱间拆掉矮墙当入口 */
function arcade(cfg: RuinsConfig, rng: Rng, d: Draft, structures: Structure[]): { columns: { u: number; v: number }[]; gaps: Rect[] } {
  const A = cfg.arcade
  const t = cfg.plan.wallU.parapet
  const G = d.garth
  const columns: { u: number; v: number }[] = []
  const gaps: Rect[] = []
  const edges: { axis: 0 | 1; line: number; a: number; b: number }[] = [
    { axis: 0, line: G.v0, a: G.u0, b: G.u1 },
    { axis: 0, line: G.v1, a: G.u0, b: G.u1 },
    { axis: 1, line: G.u0, a: G.v0, b: G.v1 },
    { axis: 1, line: G.u1, a: G.v0, b: G.v1 },
  ]
  for (const e of edges) {
    structures.push(e.axis === 0 ? { kind: 'parapet', axis: 0, u0: e.a - t / 2, v0: e.line - t / 2, u1: e.b + t / 2, v1: e.line + t / 2 } : { kind: 'parapet', axis: 1, u0: e.line - t / 2, v0: e.a - t / 2, u1: e.line + t / 2, v1: e.b + t / 2 })
    const k = Math.max(2, Math.floor((e.b - e.a) / A.spacingU))
    const at = Array.from({ length: k + 1 }, (_, i) => e.a + ((e.b - e.a) * i) / k)
    for (const s of at) {
      const p = e.axis === 0 ? { u: s, v: e.line } : { u: e.line, v: s }
      if (!columns.some((c) => Math.hypot(c.u - p.u, c.v - p.v) < 0.1)) columns.push(p)
    }
    const want = Math.min(count(rng, A.entries), k - 1)
    const picks = new Set<number>()
    for (let tries = 0; picks.size < want && tries < 12; tries++) picks.add(rng.int(0, k - 1))
    for (const p of picks) {
      const a = at[p]! + A.radiusU
      const b = at[p + 1]! - A.radiusU
      gaps.push(e.axis === 0 ? { u0: a, v0: e.line - t, u1: b, v1: e.line + t } : { u0: e.line - t, v0: a, u1: e.line + t, v1: b })
    }
  }
  return { columns, gaps }
}

interface Sketch {
  readonly d: Draft
  readonly doors: Door[]
  readonly m: Masonry
  readonly fallen: Fallen[]
}

/** 一次尝试：平面、门洞、柱廊，填进砌体格子再让它塌成废墟 */
function sketch(cfg: RuinsConfig, k0: Strength, rng: Rng, seed: number, sideU: number): Sketch | null {
  const d = draft(cfg, rng, sideU)
  const doors = pickDoors(cfg, rng, d)
  if (!doors) return null
  const structures: Structure[] = []
  for (const l of d.lines) {
    structures.push(l.axis === 0 ? { kind: l.kind, axis: 0, u0: l.a, v0: l.line - l.thick / 2, u1: l.b, v1: l.line + l.thick / 2 } : { kind: l.kind, axis: 1, u0: l.line - l.thick / 2, v0: l.a, u1: l.line + l.thick / 2, v1: l.b })
  }
  const { columns, gaps } = arcade(cfg, rng, d, structures)
  const parapets = structures.length
  const rad = cfg.arcade.radiusU
  for (const c of columns) structures.push({ kind: 'column', axis: -1, u0: c.u - rad, v0: c.v - rad, u1: c.u + rad, v1: c.v + rad })
  const g: Grid = {
    cols: Math.ceil((d.W + GRID_PAD_U * 2) / cfg.cellU),
    rows: Math.ceil((d.H + GRID_PAD_U * 2) / cfg.cellU),
    cell: cfg.cellU,
    u0: -GRID_PAD_U,
    v0: -GRID_PAD_U,
  }
  const k = g.cols * g.rows
  const m = makeMasonry(cfg, g, structures, new Uint8Array(k), new Uint16Array(k), new Uint8Array(k), new Float32Array(k))
  const M = cfg.masonry
  const hc = M.courseM
  const tall: Record<StructureKind, () => number> = {
    outer: () => Math.round(between(rng, M.heightM.outer) / hc),
    inner: () => Math.round(between(rng, M.heightM.inner) / hc),
    tower: () => Math.round(between(rng, M.heightM.tower) / hc),
    parapet: () => Math.round(M.heightM.parapet / hc),
    column: () => Math.round(M.heightM.column / hc),
  }
  structures.forEach((st, i) => {
    if (i >= parapets) return
    stamp(m, i + 1, st, tall[st.kind](), null)
  })
  for (const d0 of doors) clear(m, doorRect(d0, 0.05))
  for (const gp of gaps) clear(m, gp)
  structures.forEach((st, i) => {
    if (st.kind !== 'column') return
    stamp(m, i + 1, st, tall.column(), { u: (st.u0 + st.u1) / 2, v: (st.v0 + st.v1) / 2, r: rad })
  })
  const fallen = ruin(cfg, k0, rng, m, d, seed)
  return { d, doors, m, fallen }
}

/** 封门的木板：挑几道门洞，沿墙的中线钉一排木板 */
function barricade(cfg: RuinsConfig, rng: Rng, m: Masonry, doors: readonly Door[]): void {
  const T = cfg.timber
  const g = m.grid
  const courses = Math.round(T.heightM / m.courseM)
  const pool = [...doors]
  for (let k = count(rng, T.doors); k > 0 && pool.length > 0; k--) {
    const d = pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!
    const r = d.axis === 0 ? { u0: d.a, v0: d.line - T.thickU / 2, u1: d.b, v1: d.line + T.thickU / 2 } : { u0: d.line - T.thickU / 2, v0: d.a, u1: d.line + T.thickU / 2, v1: d.b }
    for (let j = 0; j < g.rows; j++) {
      const v = g.v0 + (j + 0.5) * g.cell
      if (v < r.v0 || v > r.v1) continue
      for (let i = 0; i < g.cols; i++) {
        const u = g.u0 + (i + 0.5) * g.cell
        if (u < r.u0 || u > r.u1) continue
        const idx = j * g.cols + i
        if (m.n[idx] === 0) {
          m.timber[idx] = courses
          m.rubble[idx] = 0
        }
      }
    }
  }
}

/** 台地边外的树：按抖动的格子撒在方框里，离台地边至少半格，树冠之间不挤 */
function plantTrees(cfg: RuinsConfig, rng: Rng, basin: Basin, w: number, h: number): Tree[] {
  const T = cfg.trees
  const out: Tree[] = []
  for (let y = 0; y < h; y += T.gapU) {
    for (let x = 0; x < w; x += T.gapU) {
      const px = x + rng.next() * T.gapU
      const py = y + rng.next() * T.gapU
      const r = between(rng, T.crownU)
      const inMap = px > 0 && py > 0 && px < w && py < h
      const room = inMap ? roomU(basin, px, py) : -99
      if (room > -0.5 - r * 0.6) continue
      if (out.some((t) => Math.hypot(t.x - px, t.y - py) < (t.r + r) * 0.78)) continue
      out.push({ x: px, y: py, r, h: between(rng, T.heightM) })
    }
  }
  return out
}

/** 台地上离边多远（格，台地里为正） */
function roomU(b: Basin, x: number, y: number): number {
  const u = Math.min(b.cols - 1.001, Math.max(0, (x * UNIT - b.x0) / b.cell - 0.5))
  const v = Math.min(b.rows - 1.001, Math.max(0, (y * UNIT - b.y0) / b.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * b.cols + ix
  const a = b.room[i]!
  const c = b.room[i + 1]!
  const dd = b.room[i + b.cols]!
  const e = b.room[i + b.cols + 1]!
  return (a + (c - a) * fx + (dd - a) * fy + (a - c - dd + e) * fx * fy) / UNIT
}

let last: { cfg: RuinsConfig; key: string; plan: RuinsPlan } | null = null

/** 按种子生成一局的残垣；同一份配置、规则与种子只生成一次 */
export function ruinsPlan(cfg: RuinsConfig, rules: PlanRules, seed: number): RuinsPlan {
  const key = `${seed}:${rules.walk}:${rules.bodyU}:${rules.strength.masonry}:${rules.strength.timber}`
  if (last && last.cfg === cfg && last.key === key) return last.plan
  const rng = new Rng(scramble(seed))
  // 先定院落斜多少：转过去的院落连同台地边要放得进安全区，院落就按这个收
  const tilt = (rng.next() < 0.5 ? -1 : 1) * between(rng, cfg.plan.tiltDeg) * DEG
  const S = cfg.site
  const sideU = (FRAME_U - SAFE_U * 2 - S.marginU[1] * 2) / (Math.abs(Math.cos(tilt)) + Math.abs(Math.sin(tilt)))
  let k: Sketch | null = null
  for (let t = 0; t < TRIES && !k; t++) k = sketch(cfg, rules.strength, rng, seed, sideU)
  if (!k) throw new Error(`残垣生成不出来：种子 ${seed}`)
  const { d, doors, m, fallen } = k
  barricade(cfg, rng, m, doors)
  closeSlots(m, rules.walk, cfg.gapU)
  openNecks(cfg, m, rules, rng)
  // 出生点在回廊院正中，落在方框正中
  const w = FRAME_U
  const h = FRAME_U
  const gu = (d.garth.u0 + d.garth.u1) / 2 - d.W / 2
  const gv = (d.garth.v0 + d.garth.v1) / 2 - d.H / 2
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const frame: Frame = { cos, sin, cx: w / 2 - (gu * cos - gv * sin), cy: h / 2 - (gu * sin + gv * cos), w: d.W, h: d.H }
  const start = toWorld(frame, (d.garth.u0 + d.garth.u1) / 2, (d.garth.v0 + d.garth.v1) / 2)
  const siteSeed = (scramble(seed) ^ 0x51e) >>> 0
  const open = (x: number, y: number): boolean => {
    const xu = x / UNIT
    const yu = y / UNIT
    if (xu < SAFE_U || yu < SAFE_U || xu > w - SAFE_U || yu > h - SAFE_U) return false
    const l = toLocal(frame, xu, yu)
    const margin = S.marginU[0] + (S.marginU[1] - S.marginU[0]) * smooth(0.3, 0.7, fbm(xu / S.waveU, yu / S.waveU, siteSeed, 3))
    return boxDist(l.u - d.W / 2, l.v - d.H / 2, d.W / 2, d.H / 2) < margin
  }
  const basin = makeBasin(open, 0, 0, Math.ceil(w / BASIN_CELL_U), Math.ceil(h / BASIN_CELL_U), BASIN_CELL_U * UNIT, { x: start.x * UNIT, y: start.y * UNIT }, S.neckU * UNIT)
  const spaces: Space[] = []
  for (const r of d.rooms) spaces.push({ kind: r.kind, u0: r.u0, v0: r.v0, u1: r.u1, v1: r.v1, style: rng.int(0, 2), worn: rng.next() })
  spaces.push({ kind: 'garth', ...d.garth, style: 0, worn: 0 })
  spaces.push({ kind: 'walk', ...d.court, style: rng.int(0, 2), worn: rng.next() * 0.6 })
  const trees = plantTrees(cfg, rng, basin, w, h)
  const plan: RuinsPlan = { w, h, frame, grid: m.grid, structures: m.structures, n: m.n, sid: m.sid, timber: m.timber, rubble: m.rubble, spaces, doors, fallen, basin, trees, start, seed }
  last = { cfg, key, plan }
  return plan
}
