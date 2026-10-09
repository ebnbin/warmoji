import { passCost, probeZ } from '../utils/pass'
import { roomAt } from '../../maps/basin'
import type { Basin } from '../../maps/basin'
import type { Crossing, Probe } from '../utils/pass'
import type { ObstacleId } from '../../types/obstacles'

/** 一处实心：顶离地多高（米，Infinity 是一直高上去的），什么材质 */
export interface Solid {
  readonly topM: number
  readonly material: ObstacleId
}

/** 地图上挡弹体与视线的实心：细格子上每格的顶离地多高（米，0 是空地）与材质；格子 (0, 0) 的左上角在 (x0, y0) 像素，格子以外是空地 */
export interface Solids {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly top: Float32Array
  readonly kind: Uint8Array
  readonly materials: readonly ObstacleId[]
}

/** 按 at 栅格化实心（参数是格心的像素坐标，返回 null 是空地） */
export function makeSolids(at: (x: number, y: number) => Solid | null, x0: number, y0: number, cols: number, rows: number, cell: number): Solids {
  const top = new Float32Array(cols * rows)
  const kind = new Uint8Array(cols * rows)
  const materials: ObstacleId[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const s = at(x0 + (cx + 0.5) * cell, y0 + (cy + 0.5) * cell)
      if (!s || s.topM <= 0) continue
      let k = materials.indexOf(s.material)
      if (k < 0) k = materials.push(s.material) - 1
      const i = cy * cols + cx
      top[i] = s.topM
      kind[i] = k
    }
  }
  return { cols, rows, cell, x0, y0, top, kind, materials }
}

/** (x, y) 像素处那一格的实心，空地为 null */
export function solidOf(s: Solids, x: number, y: number): Solid | null {
  const cx = Math.floor((x - s.x0) / s.cell)
  const cy = Math.floor((y - s.y0) / s.cell)
  if (cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows) return null
  const i = cy * s.cols + cx
  const top = s.top[i]!
  return top > 0 ? { topM: top, material: s.materials[s.kind[i]!]! } : null
}

/** 能走的地面以外都是一直高上去的这种实心 */
export function wallsOf(b: Basin, material: ObstacleId): Solids {
  return makeSolids((x, y) => (roomAt(b, x, y) < 0 ? { topM: Infinity, material } : null), b.x0, b.y0, b.cols, b.rows, b.cell)
}

/** 线段 a→b（像素）上第一处探测在它里面、又要贯穿才过得去的实心：按探测在那一格的最低处比那一格的顶 */
export function solidsTrace(s: Solids, p: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  const x0 = (ax - s.x0) / s.cell
  const y0 = (ay - s.y0) / s.cell
  const dx = (bx - s.x0) / s.cell - x0
  const dy = (by - s.y0) / s.cell - y0
  if (Math.max(x0, x0 + dx) < 0 || Math.max(y0, y0 + dy) < 0 || Math.min(x0, x0 + dx) >= s.cols || Math.min(y0, y0 + dy) >= s.rows) return null
  let ix = Math.floor(x0)
  let iy = Math.floor(y0)
  const sx = dx > 0 ? 1 : -1
  const sy = dy > 0 ? 1 : -1
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity
  let tx = dx !== 0 ? (dx > 0 ? ix + 1 - x0 : x0 - ix) * tdx : Infinity
  let ty = dy !== 0 ? (dy > 0 ? iy + 1 - y0 : y0 - iy) * tdy : Infinity
  let t = 0
  let start = 0
  let mat: ObstacleId | null = null
  for (let k = 0; k < 8192; k++) {
    const t1 = Math.min(tx, ty, 1)
    let here: ObstacleId | null = null
    if (ix >= 0 && iy >= 0 && ix < s.cols && iy < s.rows) {
      const i = iy * s.cols + ix
      const top = s.top[i]!
      if (top > 0 && top > Math.min(probeZ(p, t), probeZ(p, t1))) {
        const m = s.materials[s.kind[i]!]!
        if (passCost(p, m) > 0) here = m
      }
    }
    if (here !== mat) {
      if (mat !== null) return { t0: start, t1: t, material: mat }
      start = t
      mat = here
    }
    if (t1 >= 1) break
    t = t1
    if (tx < ty) {
      tx += tdx
      ix += sx
    } else {
      ty += tdy
      iy += sy
    }
  }
  return mat !== null ? { t0: start, t1: 1, material: mat } : null
}
