import { FRAME_U } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { doorOffsets, trainLength } from './layout.ts'
import type { Track, TransitPlan } from './layout'
import type { TrainSpec, TransitConfig } from '../../types/maps'

/** 门洞往车里车外各让出这么深（格）：门洞里离车壁多远只按离门框多远算 */
const DOOR_DEPTH_U = 1.2
/** 车头起步时离方框边多远（格）：从隧道深处开出来；开走时车尾出了方框这么远才算走完 */
const OFF_U = 1

/** 一班车的几段：预警、进站、开门、停靠、关门、出站 */
export type TrainPhase = 'warn' | 'arrive' | 'open' | 'dwell' | 'close' | 'depart'
const PHASES: readonly TrainPhase[] = ['warn', 'arrive', 'open', 'dwell', 'close', 'depart']

/** 一班车每段多久，毫秒；车头从哪进站、停在哪，格 */
export interface RunShape {
  readonly ms: Readonly<Record<TrainPhase, number>>
  readonly total: number
  readonly spec: TrainSpec
  readonly len: number
  readonly from: number
  readonly stop: number
  /** 进站时的减速度、出站时的加速度，格/秒² */
  readonly brake: number
  readonly accel: number
}

/** 一条轨道的时刻：普通班次从 offset 起每 period 一班；叫了专列就记着几时叫的、几时开始预警 */
export interface TrackClock {
  readonly offset: number
  express: { readonly called: number; readonly start: number } | null
}

/** 此刻在这条轨道上的一班车：哪一段、这一段过了多久与还剩多久；车头与车身中点沿轨道的位置（格），车速（格/秒，不分方向），门开了几成，是不是专列 */
export interface TrainNow {
  readonly track: Track
  readonly express: boolean
  readonly shape: RunShape
  readonly start: number
  readonly phase: TrainPhase
  readonly into: number
  readonly left: number
  readonly head: number
  readonly mid: number
  readonly speed: number
  readonly doors: number
}

/** 这条轨道上一班车（普通或专列）各段的时长与走法 */
export function runShape(cfg: TransitConfig, plan: TransitPlan, track: Track, express: boolean): RunShape {
  const tt = cfg.timetable
  const spec = express ? cfg.express : cfg.train
  const len = trainLength(spec)
  const d = track.dir
  const from = d > 0 ? -OFF_U : FRAME_U + OFF_U
  const stop = plan.berth + (d * len) / 2
  const inS = (2 * Math.abs(stop - from)) / tt.inU
  const away = Math.abs((d > 0 ? FRAME_U + OFF_U : -OFF_U) - (plan.berth - (d * len) / 2))
  const outS = Math.sqrt((2 * away) / tt.outA)
  const ms: Record<TrainPhase, number> = {
    warn: express ? cfg.expressRun.warnMs : tt.warnMs,
    arrive: inS * 1000,
    open: tt.doorMs,
    dwell: express ? cfg.expressRun.dwellMs : tt.dwellMs,
    close: tt.doorMs,
    depart: outS * 1000,
  }
  const total = PHASES.reduce((s, p) => s + ms[p], 0)
  return { ms, total, spec, len, from, stop, brake: tt.inU / inS, accel: tt.outA }
}

/** 各条轨道的头一班几时开始预警：按条数错开，再按种子抖一点 */
export function trackClocks(cfg: TransitConfig, plan: TransitPlan): TrackClock[] {
  const rng = new Rng(plan.seed ^ 0x7173)
  const n = plan.tracks.length
  const tt = cfg.timetable
  const order = plan.tracks.map((t) => t.index).sort(() => rng.next() - 0.5)
  return plan.tracks.map((t) => ({ offset: tt.firstMs + (order.indexOf(t.index) * tt.periodMs) / n + rng.next() * tt.staggerMs, express: null }))
}

/** 第 k 班普通车被专列顶掉了：叫专列之后才开始、又和专列撞上的那几班 */
function cancelled(c: TrackClock, start: number, total: number, xTotal: number): boolean {
  const x = c.express
  return x !== null && start >= x.called && start < x.start + xTotal && start + total > x.start
}

/** 此刻这条轨道上的那一班：专列优先，其次是没被顶掉的普通班次；没有车是 null */
export function runAt(cfg: TransitConfig, plan: TransitPlan, track: Track, c: TrackClock, t: number): { readonly start: number; readonly express: boolean } | null {
  const x = c.express
  if (x) {
    const xs = runShape(cfg, plan, track, true)
    if (t >= x.start && t < x.start + xs.total) return { start: x.start, express: true }
  }
  if (t < c.offset) return null
  const P = cfg.timetable.periodMs
  const start = c.offset + Math.floor((t - c.offset) / P) * P
  const shape = runShape(cfg, plan, track, false)
  if (t >= start + shape.total) return null
  if (x && cancelled(c, start, shape.total, runShape(cfg, plan, track, true).total)) return null
  return { start, express: false }
}

/** 这一班在 t 时刻的样子 */
export function trainOf(cfg: TransitConfig, plan: TransitPlan, track: Track, start: number, express: boolean, t: number): TrainNow {
  const shape = runShape(cfg, plan, track, express)
  let into = t - start
  let phase: TrainPhase = 'depart'
  for (const p of PHASES) {
    if (into < shape.ms[p] || p === 'depart') {
      phase = p
      break
    }
    into -= shape.ms[p]
  }
  into = Math.min(into, shape.ms[phase])
  const left = shape.ms[phase] - into
  const d = track.dir
  const s = into / 1000
  let head = shape.stop
  let speed = 0
  let doors = 0
  if (phase === 'warn') head = shape.from
  else if (phase === 'arrive') {
    const v0 = cfg.timetable.inU
    head = shape.from + d * (v0 * s - 0.5 * shape.brake * s * s)
    speed = Math.max(0, v0 - shape.brake * s)
  } else if (phase === 'open') doors = into / shape.ms.open
  else if (phase === 'dwell') doors = 1
  else if (phase === 'close') doors = 1 - into / shape.ms.close
  else {
    head = shape.stop + d * 0.5 * shape.accel * s * s
    speed = shape.accel * s
  }
  return { track, express, shape, start, phase, into, left, head, mid: head - (d * shape.len) / 2, speed, doors }
}

/** 此刻这条轨道上的车，没有是 null */
export function trainNow(cfg: TransitConfig, plan: TransitPlan, track: Track, c: TrackClock, t: number): TrainNow | null {
  const r = runAt(cfg, plan, track, c, t)
  return r ? trainOf(cfg, plan, track, r.start, r.express, t) : null
}

/** 现在叫专列，这条轨道几时腾得出来：有车在站里就等它开走，没有或还在预警就是现在 */
export function freeAt(cfg: TransitConfig, plan: TransitPlan, track: Track, c: TrackClock, t: number): number {
  const now = runAt(cfg, plan, track, c, t)
  if (!now || (!now.express && t - now.start < runShape(cfg, plan, track, false).ms.warn)) return t
  return now.start + runShape(cfg, plan, track, now.express).total
}

/** t 以后头一班开始预警的时刻（专列也算），找不到就是 Infinity */
export function nextStart(cfg: TransitConfig, plan: TransitPlan, track: Track, c: TrackClock, t: number): { readonly start: number; readonly express: boolean } {
  const x = c.express
  const P = cfg.timetable.periodMs
  const total = runShape(cfg, plan, track, false).total
  const xTotal = runShape(cfg, plan, track, true).total
  let k = Math.max(0, Math.ceil((t - c.offset) / P))
  let best: { start: number; express: boolean } = { start: Infinity, express: false }
  for (let i = 0; i < 8; i++, k++) {
    const s = c.offset + k * P
    if (s < t || cancelled(c, s, total, xTotal)) continue
    best = { start: s, express: false }
    break
  }
  if (x && x.start >= t && x.start < best.start) best = { start: x.start, express: true }
  return best
}

/**
 * 叫一班专列：这条轨道上正有车在站里就等它开走，否则马上开始预警（还在预警的那一班取消）；之后撞上的普通班次也取消。返回专列门开足的时刻
 */
export function callExpress(cfg: TransitConfig, plan: TransitPlan, track: Track, c: TrackClock, t: number): number {
  const now = runAt(cfg, plan, track, c, t)
  const warning = now !== null && !now.express && t - now.start < runShape(cfg, plan, track, false).ms.warn
  const start = now && !warning ? now.start + runShape(cfg, plan, track, now.express).total : t
  c.express = { called: warning ? now.start : t, start }
  const x = runShape(cfg, plan, track, true)
  return start + x.ms.warn + x.ms.arrive + x.ms.open
}

/** 圆角矩形的有符号距离：中心在原点，半长 a、半宽 b，角的半径 r */
function roundBox(du: number, dv: number, a: number, b: number, r: number): number {
  const qu = Math.abs(du) - a + r
  const qv = Math.abs(dv) - b + r
  return Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0) - r
}

/** 车头收尖那段的圆角半径，格 */
export function noseRadius(spec: TrainSpec): number {
  return Math.min(spec.widthU / 2 - 0.02, spec.noseU)
}

/** 车身外廓的有符号距离（格），局部坐标；车身里为负 */
export function hullSd(tr: TrainNow, u: number, v: number): number {
  const s = tr.shape.spec
  return roundBox(u - tr.mid, v - tr.track.v, tr.shape.len / 2, s.widthU / 2, noseRadius(s))
}

/**
 * 挡人的那部分车身的有符号距离（格），局部坐标，实心里为负：门关着时是整个车身；门开着时只剩一圈车壁，两侧的门洞按开了几成让出来，车厢里走得进去
 */
export function solidSd(tr: TrainNow, u: number, v: number): number {
  const outer = hullSd(tr, u, v)
  if (tr.doors <= 0.02 || outer > 0.5) return outer
  const s = tr.shape.spec
  const w = s.wallU
  const inner = roundBox(u - tr.mid, v - tr.track.v, tr.shape.len / 2 - w, s.widthU / 2 - w, Math.max(0.05, noseRadius(s) - w))
  let wall = Math.max(outer, -inner)
  const half = (s.doorU * tr.doors) / 2
  const across = Math.abs(Math.abs(v - tr.track.v) - (s.widthU / 2 - w / 2))
  let hole = Infinity
  for (const off of doorOffsets(s)) {
    const du = Math.abs(u - (tr.mid + off)) - half
    const dv = across - w / 2 - DOOR_DEPTH_U
    hole = Math.min(hole, Math.hypot(Math.max(du, 0), Math.max(dv, 0)) + Math.min(Math.max(du, dv), 0))
  }
  wall = Math.max(wall, -hole)
  return wall
}

/** 门开着、身体在车厢里能走的地方 */
export function inCabin(tr: TrainNow, u: number, v: number): boolean {
  return tr.doors > 0.02 && hullSd(tr, u, v) < 0 && solidSd(tr, u, v) > 0
}

/** 列车这一刻是不是在站厅里（车身有一截进了方框） */
export function present(tr: TrainNow): boolean {
  return tr.phase !== 'warn'
}
