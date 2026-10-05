import { UNIT } from '../../util/units.ts'
import { FRAME, FRAME_MID } from '../frame.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { Point } from '../../util/vec'
import type { DreamlandConfig } from '../../types/maps'

/** 能走的地面按这么细的格子栅格化，格 */
const CELL_U = 0.25
/** 乐园大门与城堡大门的口子半径，格；离外沿多远 */
const ENTRY_U = 1.1
const ENTRY_IN_U = 0.6
/** 检修口的半径，格 */
const HATCH_U = 0.55

/**
 * 乐园的平面，像素：台面与两圈传送带都是同心、同朝向的正 N 边形。第 k 条边朝外的单位法线是 normals[k]，
 * tangents[k] 是顺着这条边、由法线往下转 90° 的方向，各边的切向连起来绕一圈；第 k 条边夹在角度 θk ± π/N 的两个顶点之间
 */
export interface DreamlandPlan {
  readonly cx: number
  readonly cy: number
  readonly sides: number
  /** 第一条边的法线角，弧度 */
  readonly rot: number
  readonly normals: readonly Point[]
  readonly tangents: readonly Point[]
  /** 台面、内圈外沿、外圈外沿的边心距，像素 */
  readonly stage: number
  readonly inner: number
  readonly outer: number
  /** 一条边的半长与边心距之比 tan(π/N) */
  readonly half: number
  /** 入口的半宽，像素：台沿一条边去掉两头的立柱 */
  readonly door: number
  /** 一格多少米 */
  readonly meterPerU: number
  /** 能走的地面：外圈外沿以内，台面与两圈传送带 */
  readonly basin: Basin
}

export function dreamlandPlan(cfg: DreamlandConfig): DreamlandPlan {
  const n = cfg.sides
  const rot = (cfg.rotDeg * Math.PI) / 180
  const normals: Point[] = []
  const tangents: Point[] = []
  for (let k = 0; k < n; k++) {
    const a = rot + (k * 2 * Math.PI) / n
    normals.push({ x: Math.cos(a), y: Math.sin(a) })
    tangents.push({ x: -Math.sin(a), y: Math.cos(a) })
  }
  const half = Math.tan(Math.PI / n)
  const base = { cx: FRAME_MID.x, cy: FRAME_MID.y, sides: n, rot, normals, tangents, stage: cfg.stageU * UNIT, inner: cfg.innerU * UNIT, outer: cfg.outerU * UNIT, half, door: (cfg.stageU * half - cfg.fence.postU) * UNIT, meterPerU: cfg.meterPerU }
  const cell = CELL_U * UNIT
  const open = (x: number, y: number): boolean => gaugeAt(base, x, y) < base.outer
  const basin = makeBasin(open, FRAME.x, FRAME.y, Math.ceil(FRAME.w / cell), Math.ceil(FRAME.h / cell), cell, FRAME_MID, cell)
  return { ...base, basin }
}

type Shape = Pick<DreamlandPlan, 'cx' | 'cy' | 'sides' | 'rot' | 'normals' | 'tangents' | 'half'>

/** (x, y) 落在哪条边对着的那一扇：从中心看过去夹在这条边两个顶点之间 */
export function sectorAt(p: Shape, x: number, y: number): number {
  const n = p.sides
  const a = Math.atan2(y - p.cy, x - p.cx) - p.rot
  return ((Math.round((a * n) / (2 * Math.PI)) % n) + n) % n
}

/** (x, y) 落在边心距多大的那一圈正多边形上，像素：各边法线方向上投影的最大值 */
export function gaugeAt(p: Shape, x: number, y: number): number {
  const k = sectorAt(p, x, y)
  const nk = p.normals[k]!
  return (x - p.cx) * nk.x + (y - p.cy) * nk.y
}

/** 边心距为 a 的那一圈的顶点，第 k 个在第 k 条边与第 k+1 条边之间 */
export function cornersOf(p: Shape, a: number): Point[] {
  const out: Point[] = []
  for (let k = 0; k < p.sides; k++) {
    const nk = p.normals[k]!
    const tk = p.tangents[k]!
    out.push({ x: p.cx + nk.x * a + tk.x * a * p.half, y: p.cy + nk.y * a + tk.y * a * p.half })
  }
  return out
}

/** 边心距为 a 的那一圈上第 k 条边中点处、沿边 u 像素的一点 */
export function edgePoint(p: Shape, k: number, a: number, u: number): Point {
  const nk = p.normals[k]!
  const tk = p.tangents[k]!
  return { x: p.cx + nk.x * a + tk.x * u, y: p.cy + nk.y * a + tk.y * u }
}

/** 离边心距为 a 的正多边形最近的那一点：d 是有符号的距离（外面为正，像素），(nx, ny) 是那里朝外的法线；k 是那条边，u 是沿边离中点多远，落在顶点上时 corner 为真 */
export interface Near {
  d: number
  nx: number
  ny: number
  k: number
  u: number
  corner: boolean
}

export function nearEdge(p: Shape, a: number, x: number, y: number, out: Near): Near {
  const k = sectorAt(p, x, y)
  const nk = p.normals[k]!
  const tk = p.tangents[k]!
  const dx = x - p.cx
  const dy = y - p.cy
  const along = dx * nk.x + dy * nk.y - a
  const u = dx * tk.x + dy * tk.y
  const reach = a * p.half
  out.k = k
  out.u = u
  if (along <= 0 || Math.abs(u) <= reach) {
    out.d = along
    out.nx = nk.x
    out.ny = nk.y
    out.corner = false
    return out
  }
  const end = Math.sign(u) * reach
  const ex = dx - nk.x * a - tk.x * end
  const ey = dy - nk.y * a - tk.y * end
  const d = Math.hypot(ex, ey)
  out.d = d
  out.nx = ex / d
  out.ny = ey / d
  out.corner = true
  return out
}

/** 乐园给出怪口的地标：外圈南北两头的乐园大门与城堡大门，外圈隔一个角一个的检修口 */
export function dreamlandMarks(p: DreamlandPlan): Readonly<Record<string, readonly Landmark[]>> {
  const facing = (want: Point): number => {
    let best = 0
    for (let k = 1; k < p.sides; k++) if (p.normals[k]!.x * want.x + p.normals[k]!.y * want.y > p.normals[best]!.x * want.x + p.normals[best]!.y * want.y) best = k
    return best
  }
  const gate = (k: number): Landmark => {
    const nk = p.normals[k]!
    const at = edgePoint(p, k, p.outer - ENTRY_IN_U * UNIT, 0)
    return { x: at.x, y: at.y, r: ENTRY_U * UNIT, nx: -nk.x, ny: -nk.y }
  }
  const mid = cornersOf(p, (p.inner + p.outer) / 2)
  return {
    entry: [gate(facing({ x: 0, y: 1 }))],
    castle: [gate(facing({ x: 0, y: -1 }))],
    hatch: mid.filter((_, i) => i % 2 === 0).map((c) => ({ x: c.x, y: c.y, r: HATCH_U * UNIT, nx: 0, ny: 0 })),
  }
}
