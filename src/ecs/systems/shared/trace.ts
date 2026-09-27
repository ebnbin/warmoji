import { addComponent, hasComponent, query } from 'bitecs'
import { TRANSIT_MS } from '../../../data/abilities'
import { Alive, Hp, Trace, Transform } from '../../components'
import { inTransit } from '../../utils/marks'
import { traces } from '../../store'
import { bodyDt } from './body'
import { displace } from './displace'
import type { Sim } from '../../sim'

const STEP_MS = 50

const REWIND_COLOR = 0x80deea

/** 身体走过的路：环形地记着每一格的时刻、位置与生命，i 是下一格，n 是已记的格数；时刻按身体自己的时钟 clock，next 是下次记的时刻；倒带途中 back 记着到了以后时钟退回哪、留几格、生命取多少，途中不记也不走钟 */
export interface TraceRec {
  readonly t: Float64Array
  readonly x: Float32Array
  readonly y: Float32Array
  readonly hp: Float32Array
  i: number
  n: number
  clock: number
  next: number
  back: { readonly clock: number; readonly keep: number; readonly hp: number } | null
}

/** 路上某一刻：位置、生命、时刻，和到这一刻为止留得下的格数 */
interface TracePoint {
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly at: number
  readonly keep: number
}

/** 让身体记得住至少 ms 前的路；倒带以后落点之前的路还要看得见，所以留两倍 */
export function keepTrace(sim: Sim, eid: number, ms: number): void {
  const size = Math.ceil((ms * 2) / STEP_MS) + 2
  if ((traces[eid]?.t.length ?? 0) >= size) return
  if (!hasComponent(sim.world, eid, Trace)) addComponent(sim.world, eid, Trace)
  traces[eid] = { t: new Float64Array(size), x: new Float32Array(size), y: new Float32Array(size), hp: new Float32Array(size), i: 0, n: 0, clock: 0, next: 0, back: null }
}

/** 第 k 新的一格在环里的下标，0 是最新的 */
function slot(r: TraceRec, k: number): number {
  const size = r.t.length
  return (r.i - 1 - k + size * 2) % size
}

/** 记路的身体按自己的时钟每 STEP_MS 记一格；倒下的从头记；倒带到了就把时钟与路退回落点那一刻，生命取那时与现在的较高者 */
export function recordTraces(sim: Sim): void {
  for (const eid of query(sim.world, [Trace, Transform])) {
    const r = traces[eid]
    if (!r) continue
    if (!Alive.v[eid]) {
      r.n = 0
      r.back = null
      continue
    }
    if (r.back) {
      if (inTransit(eid)) continue
      r.i = (r.i - (r.n - r.back.keep) + r.t.length) % r.t.length
      r.n = r.back.keep
      r.clock = r.back.clock
      r.next = r.clock
      if (hasComponent(sim.world, eid, Hp)) Hp.v[eid] = Math.min(Hp.max[eid]!, Math.max(Hp.v[eid]!, r.back.hp))
      r.back = null
    } else {
      r.clock += bodyDt(sim, eid) * 1000
    }
    if (r.clock < r.next) continue
    r.next = r.clock + STEP_MS
    const s = r.i
    r.t[s] = r.clock
    r.x[s] = Transform.x[eid]!
    r.y[s] = Transform.y[eid]!
    r.hp[s] = hasComponent(sim.world, eid, Hp) ? Hp.v[eid]! : 0
    r.i = (s + 1) % r.t.length
    r.n = Math.min(r.t.length, r.n + 1)
  }
}

/** ms 前的那一刻：两格之间按时刻插值；记得不够久取最早的一格，一格都没有返回 null */
function pointAt(sim: Sim, r: TraceRec, ms: number): TracePoint | null {
  if (r.n === 0) return null
  const when = r.clock - ms
  let k = 0
  while (k < r.n - 1 && r.t[slot(r, k)]! > when) k++
  const a = slot(r, k)
  const ta = r.t[a]!
  if (k === 0 || ta >= when) return { x: r.x[a]!, y: r.y[a]!, hp: r.hp[a]!, at: ta, keep: r.n - k }
  const b = slot(r, k - 1)
  const f = (when - ta) / (r.t[b]! - ta)
  const d = sim.hooks.worldDelta(sim, r.x[a]!, r.y[a]!, r.x[b]!, r.y[b]!)
  const p = sim.hooks.wrap(sim, r.x[a]! + d.x * f, r.y[a]! + d.y * f)
  return { x: p.x, y: p.y, hp: r.hp[a]! + (r.hp[b]! - r.hp[a]!) * f, at: when, keep: r.n - k }
}

/** 身体 ms 前在哪、生命多少；没记路或一格都没记返回 null */
export function traceAt(sim: Sim, eid: number, ms: number): { readonly x: number; readonly y: number; readonly hp: number } | null {
  const r = traces[eid]
  return r ? pointAt(sim, r, ms) : null
}

/** 最近 ms 的路：从 ms 前那一刻起依次展开到身体此刻的位置，倒带途中停在出发那一刻；点不回绕，x,y 依次排；没记路或一格都没记返回 null */
export function tracePath(sim: Sim, eid: number, ms: number): Float32Array | null {
  const r = traces[eid]
  const p = r ? pointAt(sim, r, ms) : null
  if (!r || !p) return null
  const out = [p.x, p.y]
  let x = p.x
  let y = p.y
  const step = (tx: number, ty: number): void => {
    const d = sim.hooks.worldDelta(sim, x, y, tx, ty)
    x += d.x
    y += d.y
    out.push(x, y)
  }
  for (let k = r.n - p.keep - 1; k >= 0; k--) step(r.x[slot(r, k)]!, r.y[slot(r, k)]!)
  if (!r.back) step(Transform.x[eid]!, Transform.y[eid]!)
  return Float32Array.from(out)
}

/** 倒带：沿直线穿行回 ms 前的位置，到了以后时钟与路退回那一刻，生命取那时与现在的较高者 */
export function rewindTrace(sim: Sim, eid: number, ms: number): void {
  const r = traces[eid]
  const p = r && !r.back ? pointAt(sim, r, ms) : null
  if (!r || !p) return
  if (!displace(sim, eid, { kind: 'transit', x: p.x, y: p.y, ms: TRANSIT_MS.rewind, look: 'streak', color: REWIND_COLOR }, { self: true, free: true })) return
  r.back = { clock: p.at, keep: p.keep, hp: p.hp }
}
