import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, Due, ENEMY_SET, Hp, Motion, MOTION, Radius, Telegraph, Transform, Uid } from '../../ecs/components'
import { telegraphEntry } from '../../ecs/store'
import { hit } from '../../ecs/systems/shared/damage'
import { displace, FORCED } from '../../ecs/systems/shared/displace'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { passCost, phases, probeZ } from '../../ecs/utils/pass'
import { bounded } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, makeBasin, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { doorOffsets, expressDoors, fixtureRoom, toLocal, toWorld, transitPlan } from './layout'
import { callExpress, freeAt, hullSd, inCabin, nextStart, present, solidSd, trackClocks, trainNow, trainOf } from './timetable'
import type { TrackClock, TrainNow } from './timetable'
import type { TransitPlan } from './layout'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { TransitConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 磁浮站按布景种子打散出自己的种子 */
const PLAN_SEED = 0x3a9f17
/** 被车撞的身体闪的颜色 */
const TRAIN_TINT = 0xffc857
/** 绕开停着的列车时离车壁、门框再留多少，格 */
const SKIRT_U = 0.4
/** 开门的列车在门开到几成以上才往车厢里出怪 */
const SPILL_DOORS = 0.6
/** 撞车按这一帧车身扫过的那一段算：横过轨道离车身侧面这么近（格）以内都算撞上，挤开在撞车之前结算 */
const CONTACT_U = 0.05
/** 停着的车关门时把车厢里的身体挤到车外再远这么多（格）：比撞车的余量远，车开走时不算撞上 */
const CLEAR_U = 0.12
/** 能走的地面上的格子边长：只围站厅、不算设施的那张距离场 */
const HALL_CELL_U = 0.25

/** 一次撞车：车撞到哪、多快；画面拿去响一声、震一下 */
export interface Knock {
  readonly x: number
  readonly y: number
  readonly speed: number
  readonly team: boolean
}

/**
 * 磁浮站此刻：按种子摆好的车站，只围站厅的距离场（穿墙的身体用），站台设施与站厅边的实心；各条轨道的时刻，此刻各条轨道上的车（at 是按哪一刻算的）；
 * 谁刚被哪条轨道上的车撞过，哪些头目的预兆已经叫了专列；还没交给画面的撞车
 */
export interface TransitState {
  readonly plan: TransitPlan
  readonly hall: Basin
  readonly solids: Solids
  readonly clocks: TrackClock[]
  trains: (TrainNow | null)[]
  at: number
  readonly hits: Map<number, { readonly track: number; readonly at: number }>
  readonly called: Set<number>
  readonly knocks: Knock[]
}

function cfgOf(sim: Sim): TransitConfig {
  return MAPS[sim.mapId].transit!
}

/** 这一局的车站：视图与规则按同一个种子、同一个屏幕摆向各要一次 */
export function transitPlanFor(cfg: TransitConfig, decorSeed: number, portrait: boolean): TransitPlan {
  return transitPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0, !portrait)
}

/** 站台设施按自己的高、站厅边按一直高上去挡子弹：检票口那一侧是墙，扶梯那一侧是看得穿的玻璃栏板，两头是隧道口的墙，隧道里空着 */
function solidsOf(cfg: TransitConfig, plan: TransitPlan): Solids {
  const b = plan.basin
  const L = { u: 0, v: 0 }
  const at = (x: number, y: number): Solid | null => {
    toLocal(plan, x / UNIT, y / UNIT, L)
    const inside = L.u >= plan.u0 && L.u <= plan.u1 && L.v >= plan.v0 && L.v <= plan.v1
    if (inside) {
      for (const f of plan.fixtures) {
        if (fixtureRoom(f, L.u, L.v) < 0) continue
        return f.kind === 'pillar' ? { topM: Infinity, material: 'structure' } : { topM: f.h, material: f.kind === 'vending' ? 'structure' : 'fixture' }
      }
      return null
    }
    if (L.v >= plan.v0 && L.v <= plan.v1 && plan.tracks.some((t) => Math.abs(L.v - t.v) < cfg.tracks.bedU / 2)) return null
    const glass = (plan.gateSide === 0 && L.v > plan.v1) || (plan.gateSide === 1 && L.v < plan.v0)
    return { topM: Infinity, material: glass && L.u >= plan.u0 && L.u <= plan.u1 ? 'glass' : 'structure' }
  }
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

export function transitOf(sim: Sim): TransitState {
  let s = sim.worldState.transit
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = transitPlanFor(cfg, sim.run.decorSeed, sim.portrait)
    const b = plan.basin
    const L = { u: 0, v: 0 }
    const hall = makeBasin(
      (x, y) => {
        toLocal(plan, x / UNIT, y / UNIT, L)
        return L.u >= plan.u0 && L.u <= plan.u1 && L.v >= plan.v0 && L.v <= plan.v1
      },
      b.x0,
      b.y0,
      b.cols,
      b.rows,
      HALL_CELL_U * UNIT,
      { x: plan.start.x * UNIT, y: plan.start.y * UNIT },
      0,
    )
    s = { plan, hall, solids: solidsOf(cfg, plan), clocks: trackClocks(cfg, plan), trains: [], at: -1, hits: new Map(), called: new Set(), knocks: [] }
    sim.worldState.transit = s
  }
  return s
}

/** 此刻各条轨道上的车：同一刻只算一次 */
export function trainsOf(sim: Sim): (TrainNow | null)[] {
  const s = transitOf(sim)
  if (s.at !== sim.elapsedMs) {
    const cfg = cfgOf(sim)
    s.trains = s.plan.tracks.map((t) => {
      const tr = trainNow(cfg, s.plan, t, s.clocks[t.index]!, sim.elapsedMs)
      return tr && present(tr) ? tr : null
    })
    s.at = sim.elapsedMs
  }
  return s.trains
}

/** 预警里的那一班也算上：画面与到站牌要看 */
export function scheduleOf(sim: Sim): (TrainNow | null)[] {
  const s = transitOf(sim)
  const cfg = cfgOf(sim)
  return s.plan.tracks.map((t) => trainNow(cfg, s.plan, t, s.clocks[t.index]!, sim.elapsedMs))
}

const LP = { u: 0, v: 0 }

/** 像素换成局部坐标（格） */
function local(plan: TransitPlan, x: number, y: number): { u: number; v: number } {
  return toLocal(plan, x / UNIT, y / UNIT, { u: 0, v: 0 })
}

/** 局部坐标（格）换成像素 */
function pixel(plan: TransitPlan, u: number, v: number): Point {
  const w = toWorld(plan, u, v)
  return { x: w.x * UNIT, y: w.y * UNIT }
}

/** 列车停着：门在开、开着或在关 */
function standing(tr: TrainNow): boolean {
  return tr.phase === 'open' || tr.phase === 'dwell' || tr.phase === 'close'
}

/** 有符号距离的梯度方向，局部坐标 */
function gradient(f: (u: number, v: number) => number, u: number, v: number): { u: number; v: number } {
  const h = 0.02
  const gu = f(u + h, v) - f(u - h, v)
  const gv = f(u, v + h) - f(u, v - h)
  const len = Math.hypot(gu, gv)
  return len > 1e-9 ? { u: gu / len, v: gv / len } : { u: 0, v: 1 }
}

/**
 * 半径 r 格的身体不进车身：门关着（行驶中或停着关门）就沿横过轨道的方向推到车身外它原来在的那一侧；门开着只挡车壁，顺着车壁的法线推开
 */
function clearTrains(trains: readonly (TrainNow | null)[], l: { u: number; v: number }, fromV: number, r: number): void {
  for (const tr of trains) {
    if (!tr) continue
    if (tr.doors <= 0.02) {
      if (hullSd(tr, l.u, l.v) >= r) continue
      const tv = tr.track.v
      const side = Math.sign(fromV - tv) || Math.sign(l.v - tv) || 1
      l.v = tv + side * (tr.shape.spec.widthU / 2 + r + (tr.speed > 0 ? 0.01 : CLEAR_U))
      continue
    }
    for (let k = 0; k < 4; k++) {
      const d = solidSd(tr, l.u, l.v)
      if (d >= r) break
      const n = gradient((u, v) => solidSd(tr, u, v), l.u, l.v)
      l.u += n.u * (r - d + 0.005)
      l.v += n.v * (r - d + 0.005)
    }
  }
}

/** 线段 a→b（局部坐标，格）上穿过车身的那一截：车顶离地 topM 米，探测在那一截低过车顶才挡；按距离场一步步走进去、再走出来 */
function trainTrace(tr: TrainNow, probe: Probe, au: number, av: number, bu: number, bv: number): Crossing | null {
  if (passCost(probe, 'train') <= 0) return null
  const du = bu - au
  const dv = bv - av
  const len = Math.max(Math.hypot(du, dv), 1e-6)
  const sd = (t: number): number => solidSd(tr, au + du * t, av + dv * t)
  let t = 0
  let d = sd(0)
  for (let i = 0; d > 1e-3; i++) {
    t += d / len
    if (t >= 1 || i > 96) return null
    d = sd(t)
  }
  const t0 = t
  for (let i = 0; t < 1 && d <= 0 && i < 160; i++) {
    t = Math.min(1, t + Math.max(-d, 0.02) / len)
    d = sd(t)
  }
  const top = tr.shape.spec.heightM
  if (Math.min(probeZ(probe, t0), probeZ(probe, t)) > top) return null
  return { t0, t1: t, material: 'train' }
}

/** (u, v) 离所有轨道的道床中线都够远：出怪落不到道床上 */
function offTrack(cfg: TransitConfig, plan: TransitPlan, u: number, v: number): boolean {
  return u >= plan.u0 && u <= plan.u1 && plan.tracks.every((t) => Math.abs(v - t.v) >= cfg.tracks.bedU / 2)
}

/**
 * 隔着停着的列车时往哪走（局部坐标，格）：a、b 在列车两侧、直线穿过车身才绕。门开着的走车厢：先到门口、穿过去、再出门；
 * 车头车尾外面站厅里还留得出路的也算上，挑最近的走法；在车厢里就直接朝离目标近的那扇门走出去。不用绕是 null
 */
function detour(plan: TransitPlan, trains: readonly (TrainNow | null)[], a: { u: number; v: number }, b: { u: number; v: number }, r: number): { u: number; v: number } | null {
  let best: { u: number; v: number } | null = null
  let bestAt = Infinity
  for (const tr of trains) {
    if (!tr || !standing(tr)) continue
    const s = tr.shape.spec
    const tv = tr.track.v
    const hw = s.widthU / 2
    const open = tr.doors > SPILL_DOORS
    const doors = doorOffsets(s).map((o) => tr.mid + o)
    const half = (s.doorU * tr.doors) / 2
    const sb = Math.sign(b.v - tv) || 1
    if (open && inCabin(tr, a.u, a.v)) {
      const door = doors.reduce((p, q) => (Math.abs(q - b.u) + Math.abs(q - a.u) < Math.abs(p - b.u) + Math.abs(p - a.u) ? q : p))
      return Math.abs(a.u - door) <= Math.max(0.05, half - r) ? { u: door, v: tv + sb * (hw + r + SKIRT_U) } : { u: door, v: tv }
    }
    const sa = Math.sign(a.v - tv) || 1
    if (sa === sb) continue
    const cross = a.u + ((b.u - a.u) * (tv - a.v)) / (b.v - a.v)
    const reach = tr.shape.len / 2 + r + SKIRT_U
    if (Math.abs(cross - tr.mid) > reach) continue
    const dist = Math.abs(tv - a.v)
    if (dist >= bestAt) continue
    let way: { u: number; v: number } | null = null
    let cost = Infinity
    if (open && half >= r + 0.05) {
      for (const door of doors) {
        const e1 = { u: door, v: tv + sa * (hw + r + SKIRT_U) }
        const e2 = { u: door, v: tv + sb * (hw + r + SKIRT_U) }
        const c = Math.hypot(a.u - e1.u, a.v - e1.v) + Math.abs(e1.v - e2.v) + Math.hypot(e2.u - b.u, e2.v - b.v)
        if (c >= cost) continue
        cost = c
        const lined = Math.abs(a.u - door) <= Math.max(0.05, half - r) && Math.abs(a.v - tv) <= hw + r + SKIRT_U + 0.3
        way = lined ? e2 : e1
      }
    }
    for (const e of [-1, 1]) {
      const end = tr.mid + e * reach
      if (end < plan.u0 + r || end > plan.u1 - r) continue
      const c = Math.abs(a.u - end) + Math.abs(a.v - b.v) + Math.abs(end - b.u)
      if (c >= cost) continue
      cost = c
      way = Math.abs(a.u - end) > 0.4 ? { u: end, v: a.v } : { u: end, v: b.v }
    }
    if (!way) continue
    best = way
    bestAt = dist
  }
  return best
}

/** 站台上离设施、站厅边至少 room 像素、又不在道床上的一点：从 p 往外一圈圈找，近处找不到就退回开局站的地方 */
function openNear(cfg: TransitConfig, plan: TransitPlan, p: Point, room: number): Point {
  for (let r = 0; r <= 10 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      const l = toLocal(plan, q.x / UNIT, q.y / UNIT, LP)
      if (roomAt(plan.basin, q.x, q.y) >= room && offTrack(cfg, plan, l.u, l.v)) return q
    }
  }
  return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** 停稳开门的列车两侧的车门：出怪的地标，按轨道分组；没车或门没开足的那组是空的 */
function carMarks(cfg: TransitConfig, plan: TransitPlan, trains: readonly (TrainNow | null)[]): Record<string, Landmark[]> {
  const out: Record<string, Landmark[]> = { car0: [], car1: [], car2: [] }
  const close = cfg.timetable.closeWarnMs
  for (const tr of trains) {
    if (!tr || tr.express || tr.doors < SPILL_DOORS || tr.phase === 'close' || (tr.phase === 'dwell' && tr.left < close)) continue
    const s = tr.shape.spec
    const list = out[`car${tr.track.index}`]!
    for (const side of [-1, 1]) {
      for (const off of doorOffsets(s)) {
        const p = pixel(plan, tr.mid + off, tr.track.v + side * (s.widthU / 2 - s.wallU / 2))
        const n = toWorld(plan, 0, side)
        list.push({ x: p.x, y: p.y, r: (s.doorU / 2) * UNIT, nx: n.x, ny: n.y })
      }
    }
  }
  return out
}

/** 专列此刻会停哪条轨道、从哪侧下车：腾出来最早的那条，一样早就挑离队长近的；下车的一侧朝着队长 */
function expressMarks(sim: Sim, s: TransitState, cfg: TransitConfig): Landmark[] {
  const now = sim.elapsedMs
  const lead = local(s.plan, leaderPoint(sim).x, leaderPoint(sim).y)
  const t = s.plan.tracks.reduce((a, b) => {
    const fa = freeAt(cfg, s.plan, a, s.clocks[a.index]!, now) + Math.abs(a.v - lead.v) * 50
    const fb = freeAt(cfg, s.plan, b, s.clocks[b.index]!, now) + Math.abs(b.v - lead.v) * 50
    return fb < fa ? b : a
  })
  return expressDoors(s.plan, cfg, t, lead.v)
}

/** 头目的预兆要从专列下来：叫一班专列，预兆拖到专列门开足 */
function callExpresses(sim: Sim, s: TransitState, cfg: TransitConfig): void {
  for (const e of query(sim.world, [Telegraph, Due])) {
    if (!Telegraph.boss[e] || telegraphEntry[e]?.kind !== 'express') continue
    const uid = Uid.v[e]!
    if (s.called.has(uid)) continue
    s.called.add(uid)
    const entry = telegraphEntry[e]!
    const at = local(s.plan, entry.sx, entry.sy)
    const t = s.plan.tracks.reduce((a, b) => (Math.abs(b.v - at.v) < Math.abs(a.v - at.v) ? b : a))
    const open = callExpress(cfg, s.plan, t, s.clocks[t.index]!, sim.elapsedMs)
    Due.at[e] = Math.max(Due.at[e]!, open + 200)
    s.at = -1
  }
}

/**
 * 开着的列车撞人：快过 minU 的车身碰到谁就按车速掉一截生命上限、撞飞到车身外它在的那一侧（大个子站得住、只掉一点、被挤开）；
 * 同一个身体被同一条轨道上的车撞过，immuneMs 内不再算。腾空、穿行中的与穿得过车身的不挨撞
 */
function ram(sim: Sim, s: TransitState, cfg: TransitConfig): void {
  const now = sim.elapsedMs
  const h = cfg.hit
  const src = hazardSource('train', TRAIN_TINT)
  const bodies = [...sim.characters, ...query(sim.world, ENEMY_SET)]
  for (const tr of trainsOf(sim)) {
    if (!tr || (tr.phase !== 'arrive' && tr.phase !== 'depart') || tr.speed < h.minU) continue
    const spec = tr.shape.spec
    const tv = tr.track.v
    const pace = Math.max(0.5, Math.min(1, tr.speed / cfg.timetable.inU))
    const was = trainOf(cfg, s.plan, tr.track, tr.start, tr.express, now - sim.wdtMs)
    const half = tr.shape.len / 2
    const lo = Math.min(tr.mid, was.mid) - half
    const hi = Math.max(tr.mid, was.mid) + half
    for (const b of bodies) {
      if (!Alive.v[b] || inTransit(b) || Motion.kind[b] === MOTION.arc || phases(sim.world, b, 'train')) continue
      const l = local(s.plan, Transform.x[b]!, Transform.y[b]!)
      const r = Radius.v[b]! / UNIT
      if (Math.abs(l.v - tv) > spec.widthU / 2 + r + CONTACT_U || l.u < lo - r || l.u > hi + r) continue
      const key = Uid.v[b]!
      const last = s.hits.get(key)
      if (last && last.track === tr.track.index && now - last.at < h.immuneMs) continue
      s.hits.set(key, { track: tr.track.index, at: now })
      const heavy = r > h.heavyU
      const side = Math.sign(l.v - tv) || 1
      const at = pixel(s.plan, l.u, tv + side * spec.widthU * 0.5)
      const team = hasComponent(sim.world, b, Hp) && sim.characters.includes(b)
      hit(sim, src, b, Math.max(1, Math.round(Hp.max[b]! * (heavy ? h.heavyFrac : h.frac) * pace)), { from: at })
      sim.out.bursts.push({ x: at.x, y: at.y, count: heavy ? 6 : 10, kind: 'sparks' })
      s.knocks.push({ x: at.x, y: at.y, speed: tr.speed, team })
      if (heavy || !Alive.v[b]) continue
      const fling = h.flingU[0] + (h.flingU[1] - h.flingU[0]) * pace
      const lu = Math.min(s.plan.u1 - r, Math.max(s.plan.u0 + r, l.u + tr.track.dir * fling * 0.5))
      const lv = Math.min(s.plan.v1 - r, Math.max(s.plan.v0 + r, tv + side * (spec.widthU / 2 + r + fling)))
      const to = pixel(s.plan, lu, lv)
      displace(sim, b, { kind: 'arc', x: to.x, y: to.y, ms: h.flingMs * (0.7 + 0.3 * pace), height: h.liftU * UNIT * pace }, FORCED)
    }
  }
  for (const [k, v] of s.hits) if (now - v.at > h.immuneMs * 4) s.hits.delete(k)
}

/**
 * 磁浮站：能走的是站厅里的站台与轨道，检票口那侧的墙、扶梯那侧的玻璃栏板与两头隧道口的墙是硬边界；柱子挡人挡子弹，座椅与全息时刻表的底座矮，只挡人。
 * 几条轨道嵌在地里，列车按时刻表进站、停靠、开走：开着的车是高过人的移动的墙，撞到谁就把谁撞飞、掉血；停着时门开着，车壁挡人，车厢里走得过去；
 * 门关上就整个车身都挡。车身挡子弹也挡视线。敌我通吃，敌人会绕开停着的车或从车厢里穿过来，开着的车它们不躲
 */
export const transit: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, from, next) {
    const s = transitOf(sim)
    const r = Radius.v[eid]!
    let p = next
    if (!phases(sim.world, eid, 'train')) {
      const l = local(s.plan, next.x, next.y)
      const f = local(s.plan, from.x, from.y)
      clearTrains(trainsOf(sim), l, f.v, r / UNIT)
      p = pixel(s.plan, l.u, l.v)
    }
    return keepOut(phases(sim.world, eid, 'structure') ? s.hall : s.plan.basin, p.x, p.y, r)
  },
  basin(sim) {
    return transitOf(sim).plan.basin
  },
  ground(sim) {
    return transitOf(sim).hall
  },
  chaseDir(sim, eid, tx, ty) {
    const s = transitOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    let aim: Point = { x: tx, y: ty }
    if (!phases(sim.world, eid, 'train')) {
      const way = detour(s.plan, trainsOf(sim), local(s.plan, x, y), local(s.plan, tx, ty), r / UNIT)
      if (way) aim = pixel(s.plan, way.u, way.v)
    }
    const d = norm(aim.x - x, aim.y - y)
    return alongWall(phases(sim.world, eid, 'structure') ? s.hall : s.plan.basin, x, y, d.x, d.y, r + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = transitOf(sim)
    let best = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const a = local(s.plan, ax, ay)
    const b = local(s.plan, bx, by)
    for (const tr of trainsOf(sim)) {
      if (!tr) continue
      const c = trainTrace(tr, probe, a.u, a.v, b.u, b.v)
      if (c && (!best || c.t0 < best.t0)) best = c
    }
    return best
  },
  solidAt(sim, x, y) {
    const s = transitOf(sim)
    const l = local(s.plan, x, y)
    for (const tr of trainsOf(sim)) if (tr && solidSd(tr, l.u, l.v) < 0) return { topM: tr.shape.spec.heightM, material: 'train' }
    return solidOf(s.solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = transitOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    let d = { x: dx, y: dy }
    const ahead = local(s.plan, x + dx * (r + 0.6 * UNIT), y + dy * (r + 0.6 * UNIT))
    for (const tr of trainsOf(sim)) {
      if (!tr || solidSd(tr, ahead.u, ahead.v) > 0) continue
      const n = gradient((u, v) => solidSd(tr, u, v), ahead.u, ahead.v)
      const w = toWorld(s.plan, n.u, n.v)
      const dot = d.x * w.x + d.y * w.y
      if (dot < 0) d = { x: d.x - 2 * dot * w.x, y: d.y - 2 * dot * w.y }
    }
    const b = s.plan.basin
    if (roomAt(b, x, y) > r + 0.6 * UNIT) return d
    const n = awayFromWall(b, x, y)
    const dot = d.x * n.x + d.y * n.y
    return dot >= 0 ? d : { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(transitOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在站台上、离设施与站厅边至少一格，不在道床上；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = transitOf(sim)
    const cfg = cfgOf(sim)
    const plan = s.plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      const pf = plan.platforms[Math.floor(sim.rng.next() * plan.platforms.length)]!
      const u = plan.u0 + 1 + sim.rng.next() * (plan.u1 - plan.u0 - 2)
      const v = pf.v0 + sim.rng.next() * (pf.v1 - pf.v0)
      p = pixel(plan, u, v)
      if (roomAt(plan.basin, p.x, p.y) < UNIT || !offTrack(cfg, plan, u, v)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(cfg, plan, p, UNIT)
  },
  center(sim) {
    const st = transitOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(cfgOf(sim), transitOf(sim).plan, p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    const s = transitOf(sim)
    const l = local(s.plan, x, y)
    if (!roomFor(s.plan.basin, x, y, radius) || !offTrack(cfgOf(sim), s.plan, l.u, l.v)) return false
    return trainsOf(sim).every((tr) => !tr || hullSd(tr, l.u, l.v) > 0)
  },
  landmarks(sim) {
    const s = transitOf(sim)
    const cfg = cfgOf(sim)
    return { ...s.plan.marks, ...carMarks(cfg, s.plan, trainsOf(sim)), express: expressMarks(sim, s, cfg) }
  },
  /** 队员的坑位落进车身里就挪到队长那一侧的车身外 */
  seat(sim, from, at) {
    const s = transitOf(sim)
    const l = local(s.plan, at.x, at.y)
    const f = local(s.plan, from.x, from.y)
    for (const tr of trainsOf(sim)) {
      if (!tr || solidSd(tr, l.u, l.v) > 0.3 || inCabin(tr, f.u, f.v)) continue
      const side = Math.sign(f.v - tr.track.v) || 1
      return pixel(s.plan, l.u, tr.track.v + side * (tr.shape.spec.widthU / 2 + 0.6))
    }
    return at
  },
  onStart(sim) {
    transitOf(sim)
  },
  /** 头目的预兆叫来专列，再按时刻表算出各条轨道上的车，开着的车撞人 */
  tick(sim) {
    const s = transitOf(sim)
    const cfg = cfgOf(sim)
    callExpresses(sim, s, cfg)
    ram(sim, s, cfg)
  },
}

/** 到站牌上的一行：线路号与色，车往屏幕上哪个方向开，等车、预警、进站、停靠、快关门、出站，还有几秒，这一段还剩几成，是不是专列 */
export interface Arrival {
  readonly label: number
  readonly color: number
  readonly arrow: 'left' | 'right' | 'up' | 'down'
  readonly state: 'wait' | 'warn' | 'arrive' | 'open' | 'closing' | 'depart'
  readonly inSec: number
  readonly ratio: number
  readonly express: boolean
}

/** 每条轨道此刻在到站牌上怎么写：没车时数到下一班进站，预警时数到进站，停着时数到关门，快关门时数到车门关严 */
export function arrivals(sim: Sim): Arrival[] {
  const s = transitOf(sim)
  const cfg = cfgOf(sim)
  const now = sim.elapsedMs
  const plan = s.plan
  return plan.tracks.map((t) => {
    const tr = trainNow(cfg, plan, t, s.clocks[t.index]!, now)
    const w = toWorld(plan, t.dir, 0)
    const arrow = w.x > 0 ? 'right' : w.x < 0 ? 'left' : w.y > 0 ? 'down' : 'up'
    const base = { label: t.label, color: t.color, arrow } as const
    if (!tr) {
      const next = nextStart(cfg, plan, t, s.clocks[t.index]!, now)
      const warn = next.express ? cfg.expressRun.warnMs : cfg.timetable.warnMs
      const left = next.start + warn - now
      return { ...base, state: 'wait', inSec: left / 1000, ratio: Math.min(1, left / cfg.timetable.periodMs), express: next.express }
    }
    const ms = tr.shape.ms
    const close = cfg.timetable.closeWarnMs
    switch (tr.phase) {
      case 'warn':
        return { ...base, state: 'warn', inSec: tr.left / 1000, ratio: tr.left / ms.warn, express: tr.express }
      case 'arrive':
        return { ...base, state: 'arrive', inSec: 0, ratio: tr.left / ms.arrive, express: tr.express }
      case 'open':
      case 'dwell': {
        const toClose = (tr.phase === 'open' ? tr.left + ms.dwell : tr.left) - close
        if (toClose > 0) return { ...base, state: 'open', inSec: toClose / 1000, ratio: toClose / (ms.dwell - close), express: tr.express }
        return { ...base, state: 'closing', inSec: (tr.left + ms.close) / 1000, ratio: (tr.left + ms.close) / (close + ms.close), express: tr.express }
      }
      case 'close':
        return { ...base, state: 'closing', inSec: tr.left / 1000, ratio: tr.left / (close + ms.close), express: tr.express }
      case 'depart':
        return { ...base, state: 'depart', inSec: 0, ratio: tr.left / ms.depart, express: tr.express }
    }
  })
}
