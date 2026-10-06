import { FRAME_U, UNIT } from '../../util/units.ts'
import { makeBasin, roomAt } from '../basin.ts'
import { boundsOf, lawnSdf, sdf } from './layout.ts'
import type { Basin } from '../basin'
import type { ObstacleId } from '../../types/obstacles'
import type { Solids } from '../../ecs/worlds/solids'
import type { Point } from '../../util/vec'
import type { WonderPlan } from './layout'

/** 障碍按这么细的格子栅格化、算距离场，格 */
export const CELL_U = 0.25
/** 建距离场时窄过两倍这么宽（格）的缝填掉：老鼠洞与门拱下都比它宽 */
const NECK_U = 0.12
/** 寻路的格子多大，格 */
const FLOW_CELL_U = 0.5
/** 寻路格的格心离墙至少这么远才算走得通，格 */
const FLOW_ROOM_U = 0.1
/** 茶点摆的地方按这么密的格点挑，格 */
const SPOT_STEP_U = 1
/** 摆茶点的地方：空地离边至少这么远，桌下离桌布边至少这么远，格 */
const SPOT_OPEN_U = 1.1
const SPOT_UNDER_U = 0.55
/** 草坪外按这个材质算：玫瑰树篱 */
const RIM: ObstacleId = 'hedge'

/** 一种身体过障碍的本事：跨得过多高（米），身子顶多高（米，整个身子矮过障碍底下的空当才钻得过去）；穿墙的只受草坪边挡 */
export interface Reach {
  readonly clearM: number
  readonly topM: number
  readonly phase: boolean
}

/** 寻路：每格到队长的步数（格），从哪一格起算的 */
export interface Flow {
  readonly cols: number
  readonly rows: number
  readonly pass: Uint8Array
  readonly dist: Float32Array
  readonly heap: Int32Array
  from: number
}

/** 一种过法的地面：能走的距离场与寻路 */
export interface Passage {
  readonly basin: Basin
  readonly flow: Flow
  usedAt: number
}

/**
 * 奇境的地面，格子边长 CELL_U：每格的障碍顶多高、底下空多高（米，草坪外是一直高上去的树篱）；挡弹体与视线的实心（桌子底下是空的，只有桌布那一圈挡）；
 * 草坪本身（只受树篱挡）；按过法分的能走的地面，用到哪种算哪种；摆茶点的几类地方
 */
export interface WonderField {
  readonly cols: number
  readonly rows: number
  readonly top: Float32Array
  readonly under: Float32Array
  readonly solids: Solids
  readonly lawn: Basin
  readonly layerM: number
  readonly passages: Map<string, Passage>
  readonly pairs: readonly (readonly [number, number])[]
  readonly start: Point
  /** 摆茶点的地方，像素：开阔的草坪、花坛里、桌子底下 */
  readonly spots: { readonly open: readonly Point[]; readonly bed: readonly Point[]; readonly under: readonly Point[] }
}

/** 高 h 米的东西按占满的整层算顶多高 */
function layerTop(h: number, layerM: number): number {
  return h === Infinity ? h : Math.ceil(h / layerM - 1e-9) * layerM
}

/** 这种过法过不过得去顶 top、底下空 under 的障碍 */
export function passes(r: Reach, top: number, under: number, layerM: number): boolean {
  if (top <= 0) return true
  if (top === Infinity) return false
  if (r.phase) return true
  return r.topM <= under + 1e-6 || r.clearM >= layerTop(top, layerM) - 1e-6
}

function newFlow(): Flow {
  const n = Math.ceil(FRAME_U / FLOW_CELL_U)
  return { cols: n, rows: n, pass: new Uint8Array(n * n), dist: new Float32Array(n * n).fill(Infinity), heap: new Int32Array(n * n * 4), from: -1 }
}

/** 按种子摆好的奇境栅格化：layerM 是一层多高（米） */
export function wonderField(plan: WonderPlan, layerM: number): WonderField {
  const cols = Math.round(FRAME_U / CELL_U)
  const rows = cols
  const top = new Float32Array(cols * rows)
  const under = new Float32Array(cols * rows).fill(Infinity)
  const shot = new Float32Array(cols * rows)
  const kind = new Uint8Array(cols * rows)
  const materials: ObstacleId[] = [RIM]
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (lawnSdf(plan, (i + 0.5) * CELL_U, (j + 0.5) * CELL_U) < 0) continue
      top[j * cols + i] = Infinity
      shot[j * cols + i] = Infinity
      under[j * cols + i] = 0
    }
  }
  for (const o of plan.obstacles) {
    let m = materials.indexOf(o.material)
    if (m < 0) m = materials.push(o.material) - 1
    const [x0, y0, x1, y1] = boundsOf(o.shape)
    for (let j = Math.max(0, Math.floor(y0 / CELL_U)); j <= Math.min(rows - 1, Math.floor(y1 / CELL_U)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / CELL_U)); i <= Math.min(cols - 1, Math.floor(x1 / CELL_U)); i++) {
        const d = sdf(o.shape, (i + 0.5) * CELL_U, (j + 0.5) * CELL_U)
        if (d >= 0) continue
        const k = j * cols + i
        top[k] = Math.max(top[k]!, o.topM)
        if ((o.skirtU === undefined || d > -o.skirtU) && o.topM >= shot[k]!) {
          shot[k] = o.topM
          kind[k] = m
        }
        under[k] = Math.min(under[k]!, o.underM)
      }
    }
  }
  const cell = CELL_U * UNIT
  const start = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
  const lawn = makeBasin((x, y) => lawnSdf(plan, x / UNIT, y / UNIT) < 0, 0, 0, cols, rows, cell, start, NECK_U * UNIT)
  const solids: Solids = { cols, rows, cell, x0: 0, y0: 0, top: shot, kind, materials }
  const pairs: [number, number][] = []
  for (const o of plan.obstacles) if (!pairs.some((p) => p[0] === o.topM && p[1] === o.underM)) pairs.push([o.topM, o.underM])
  const f: WonderField = { cols, rows, top, under, solids, lawn, layerM, passages: new Map(), pairs, start, spots: { open: [], bed: [], under: [] } }
  const normal = passage(f, { clearM: layerM, topM: layerM * 3, phase: false }).basin
  const small = passage(f, { clearM: 0, topM: layerM, phase: false }).basin
  const spots = f.spots as { open: Point[]; bed: Point[]; under: Point[] }
  const t = plan.table
  const tableBox = { kind: 'box' as const, x: t.x, y: t.y, hx: t.horiz ? t.len / 2 : t.wid / 2, hy: t.horiz ? t.wid / 2 : t.len / 2, a: 0, round: 0 }
  for (let y = SPOT_STEP_U / 2; y < FRAME_U; y += SPOT_STEP_U) {
    for (let x = SPOT_STEP_U / 2; x < FRAME_U; x += SPOT_STEP_U) {
      const px = x * UNIT
      const py = y * UNIT
      if (plan.beds.some((b) => Math.abs(x - b.x) < b.hx - 0.9 && Math.abs(y - b.y) < b.hy - 0.9)) {
        if (roomAt(small, px, py) >= 0.6 * UNIT) spots.bed.push({ x: px, y: py })
        continue
      }
      if (sdf(tableBox, x, y) < -SPOT_UNDER_U) {
        if (roomAt(small, px, py) >= 0.4 * UNIT) spots.under.push({ x: px, y: py })
        continue
      }
      if (roomAt(normal, px, py) >= SPOT_OPEN_U * UNIT) spots.open.push({ x: px, y: py })
    }
  }
  return f
}

/** 这种过法在哪些障碍上过得去：按顶高与底下空当的几种组合记成一串，同样的过法共用一份地面 */
function keyOf(f: WonderField, r: Reach): string {
  if (r.phase) return 'phase'
  return f.pairs.map(([t, u]) => (passes(r, t, u, f.layerM) ? '1' : '0')).join('')
}

/** 这种过法能走的地面与寻路：头一回用到时算 */
export function passage(f: WonderField, r: Reach): Passage {
  const key = keyOf(f, r)
  let p = f.passages.get(key)
  if (p) return p
  const cell = CELL_U * UNIT
  const basin = r.phase
    ? f.lawn
    : makeBasin(
        (x, y) => {
          const k = Math.floor(y / cell) * f.cols + Math.floor(x / cell)
          return passes(r, f.top[k]!, f.under[k]!, f.layerM)
        },
        0,
        0,
        f.cols,
        f.rows,
        cell,
        f.start,
        NECK_U * UNIT,
      )
  const flow = newFlow()
  const fc = FLOW_CELL_U * UNIT
  for (let j = 0; j < flow.rows; j++) for (let i = 0; i < flow.cols; i++) flow.pass[j * flow.cols + i] = roomAt(basin, (i + 0.5) * fc, (j + 0.5) * fc) >= FLOW_ROOM_U * UNIT ? 1 : 0
  p = { basin, flow, usedAt: -Infinity }
  f.passages.set(key, p)
  return p
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1] as const
const NY = [0, 0, 1, -1, 1, -1, 1, -1] as const
const NC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const

/** 从 (x, y) 像素起算每格到它的步数：起点那格走不通就找最近的一格走得通的；起点没变就不重算 */
export function flowFrom(F: Flow, x: number, y: number): void {
  const fc = FLOW_CELL_U * UNIT
  const { cols, rows, pass, dist, heap } = F
  const sx = Math.min(cols - 1, Math.max(0, Math.floor(x / fc)))
  const sy = Math.min(rows - 1, Math.max(0, Math.floor(y / fc)))
  let start = sy * cols + sx
  if (!pass[start]) {
    let best = -1
    let bd = Infinity
    for (let r = 1; r < 6 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = sx + dx
          const yy = sy + dy
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || !pass[yy * cols + xx]) continue
          if (dx * dx + dy * dy < bd) {
            bd = dx * dx + dy * dy
            best = yy * cols + xx
          }
        }
      }
    }
    if (best < 0) return
    start = best
  }
  if (start === F.from) return
  F.from = start
  dist.fill(Infinity)
  dist[start] = 0
  let size = 0
  const push = (i: number): void => {
    let k = size++
    heap[k] = i
    while (k > 0) {
      const p = (k - 1) >> 1
      if (dist[heap[p]!]! <= dist[heap[k]!]!) break
      const t = heap[p]!
      heap[p] = heap[k]!
      heap[k] = t
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    size--
    heap[0] = heap[size]!
    let k = 0
    for (;;) {
      const l = k * 2 + 1
      const r = l + 1
      let m = k
      if (l < size && dist[heap[l]!]! < dist[heap[m]!]!) m = l
      if (r < size && dist[heap[r]!]! < dist[heap[m]!]!) m = r
      if (m === k) break
      const t = heap[m]!
      heap[m] = heap[k]!
      heap[k] = t
      k = m
    }
    return top
  }
  const done = new Uint8Array(cols * rows)
  push(start)
  while (size > 0) {
    const i = pop()
    if (done[i]) continue
    done[i] = 1
    const cx = i % cols
    const cy = (i - cx) / cols
    for (let k = 0; k < 8; k++) {
      const nx = cx + NX[k]!
      const ny = cy + NY[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!pass[j] || done[j]) continue
      if (k >= 4 && (!pass[cy * cols + nx] || !pass[ny * cols + cx])) continue
      const d = dist[i]! + NC[k]!
      if (d < dist[j]!) {
        dist[j] = d
        if (size < heap.length) push(j)
      }
    }
  }
}

/** 从 (x, y) 像素往队长去的方向：沿步数降得最快的邻格走；到不了为 null */
export function flowDir(F: Flow, x: number, y: number): Point | null {
  const fc = FLOW_CELL_U * UNIT
  const { cols, rows, dist } = F
  const ix = Math.min(cols - 1, Math.max(0, Math.floor(x / fc)))
  const iy = Math.min(rows - 1, Math.max(0, Math.floor(y / fc)))
  const here = dist[iy * cols + ix]!
  let best = here
  let bx = 0
  let by = 0
  for (let k = 0; k < 8; k++) {
    const nx = ix + NX[k]!
    const ny = iy + NY[k]!
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const d = dist[ny * cols + nx]!
    if (d < best) {
      best = d
      bx = (nx + 0.5) * fc - x
      by = (ny + 0.5) * fc - y
    }
  }
  if (best === here || !Number.isFinite(best)) return null
  const len = Math.hypot(bx, by)
  return len > 1e-9 ? { x: bx / len, y: by / len } : null
}

/** 从 (x, y) 像素到队长还要走多远，像素：到不了为 Infinity */
export function flowDist(F: Flow, x: number, y: number): number {
  const fc = FLOW_CELL_U * UNIT
  const ix = Math.min(F.cols - 1, Math.max(0, Math.floor(x / fc)))
  const iy = Math.min(F.rows - 1, Math.max(0, Math.floor(y / fc)))
  return F.dist[iy * F.cols + ix]! * fc
}

/** 半径 rad 像素的身体从 a 沿直线走到 b 不碰边 */
export function clearPath(b: Basin, ax: number, ay: number, bx: number, by: number, rad: number): boolean {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const minStep = b.cell * 0.4
  let t = 0
  for (let k = 0; k < 256; k++) {
    const d = roomAt(b, ax + (dx * t) / (len || 1), ay + (dy * t) / (len || 1))
    if (d < rad) return false
    if (t >= len) return true
    t = Math.min(len, t + Math.max(d - rad, minStep))
  }
  return true
}
