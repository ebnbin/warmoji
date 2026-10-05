import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { ENEMY_BODY } from '../../data/abilities'
import { Alive, Phys, Pickup, Radius, Span, Transform, Uid } from '../components'
import { fleeSteer } from '../systems/shared/steer'
import { leaderPoint } from '../utils/team'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import { project } from './channel'
import { holds, wade } from './bodies'
import { roomFor } from '../worlds/gates'
import { sakuraMarks } from './marks'
import { bridgeLocal, sakuraPlan } from './layout'
import { flowAt, solveSakura } from './water'
import type { Along } from './channel'
import type { Flow, Water } from './water'
import type { Bridge, SakuraPlan } from './layout'
import type { MapId, SakuraConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'
import type { Landmark } from '../worlds/gates'
import type { Surface, WorldHooks } from '../worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 樱庭按布景种子打散出自己的种子 */
const PLAN_SEED = 0x5a4c1e

/**
 * 樱庭此刻的状态：按种子生成的地图与它上面的地标，解出来的稳态水流（线程里解，解完之前还是 null）与解完的约定；
 * 哪些身体正在水里站不住、随水漂着，哪些正走在桥上（按实体记，uid 对不上就是换了实体）；见过的掉落物
 */
export interface SakuraState {
  readonly plan: SakuraPlan
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  water: Water | null
  ready: Promise<void>
  readonly swimming: Map<number, number>
  readonly aboard: Map<number, number>
  readonly seen: Map<number, number>
}

function cfgOf(sim: Sim): SakuraConfig {
  return MAPS[sim.mapId].sakura!
}

/** 这一局的樱庭：视图要它定地图的大小，规则要它定一切，两边按同一个种子各要一次 */
export function sakuraPlanFor(cfg: SakuraConfig, decorSeed: number): SakuraPlan {
  return sakuraPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 在线程里解水流，开不了线程或线程出了错就在主线程解 */
function solveAsync(cfg: SakuraConfig, plan: SakuraPlan): Promise<Water> {
  return new Promise((resolve) => {
    const fallback = (e: unknown): void => {
      console.error('解水流的线程用不了，改在主线程解', e)
      resolve(solveSakura(cfg, plan))
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./waterWorker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      fallback(e)
      return
    }
    worker.onmessage = (e: MessageEvent<Water>) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (e) => {
      e.preventDefault()
      worker.terminate()
      fallback(new Error(e.message || '解水流的线程出错'))
    }
    worker.onmessageerror = () => {
      worker.terminate()
      fallback(new Error('解水流的线程发回的消息解不开'))
    }
    worker.postMessage({ cfg, plan })
  })
}

export function sakuraOf(sim: Sim): SakuraState {
  let s = sim.worldState.sakura
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = sakuraPlanFor(cfg, sim.run.decorSeed)
    const state: SakuraState = { plan, marks: sakuraMarks(cfg, plan), water: null, ready: Promise.resolve(), swimming: new Map(), aboard: new Map(), seen: new Map() }
    state.ready = solveAsync(cfg, state.plan).then((w) => {
      state.water = w
    })
    s = state
    sim.worldState.sakura = s
  }
  return s
}

const GROUNDS = new Map<MapId, Surface>()

/** 地面：费力与回复来自地图；水里赶路按恒定功率，每秒花的体力和平地一样 */
function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { traction: 1, viscosity: 1, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

const FLOW: Flow = { h: 0, u: 0, v: 0 }

/** (x, y) 像素处有没有水：水深够不够算湿 */
function wetAt(sim: Sim, s: SakuraState, x: number, y: number): boolean {
  return !!s.water && flowAt(s.water, x / UNIT, y / UNIT, FLOW).h >= cfgOf(sim).body.wetM
}

/** 在不在桥上架在水面上的那一段（像素） */
function overSpan(b: Bridge, x: number, y: number): boolean {
  const p = bridgeLocal(b, x / UNIT, y / UNIT)
  return Math.abs(p.a) < b.span && Math.abs(p.t) <= b.width
}

/** 走在桥上的身体不出栏杆：这一步从桥面上走，横着桥面离桥心就不超过半宽减身子的半径；从桥外挪过来的（瞬移、被抛开）不拦 */
function railing(b: Bridge, from: Point, p: Point, rad: number): Point {
  const f = bridgeLocal(b, from.x / UNIT, from.y / UNIT)
  if (Math.abs(f.a) >= b.span || Math.abs(f.t) > b.width + 0.05) return p
  const q = bridgeLocal(b, p.x / UNIT, p.y / UNIT)
  if (Math.abs(q.a) >= b.span) return p
  const lim = Math.max(0.05, b.width - rad / UNIT)
  if (Math.abs(q.t) <= lim) return p
  const t = Math.sign(q.t) * lim
  return { x: (b.x + b.ax * q.a - b.ay * t) * UNIT, y: (b.y + b.ay * q.a + b.ax * t) * UNIT }
}

const ALONG: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }

/** (x, y) 像素在溪的哪一岸：顺水看左岸为 1、右岸为 −1；桥面顺着 (ax, ay) 正向那头落在左岸 */
function bankOf(s: SakuraState, x: number, y: number): number {
  return project(s.plan.stream, x / UNIT, y / UNIT, ALONG).n >= 0 ? 1 : -1
}

/**
 * 队员往 (tx, ty) 去时先奔哪：要去对岸或桥上，没上桥就先走到自己这岸的桥头，已经在桥头就上桥；在桥上要下到对岸就走到那头的桥头；
 * 别的时候直奔目标
 */
function viaBridge(s: SakuraState, eid: number, x: number, y: number, tx: number, ty: number): Point {
  const b = s.plan.bridge
  const toSpan = overSpan(b, tx, ty)
  const end = (bank: number): Point => {
    const a = bank * (b.span + b.half) * 0.5
    return { x: (b.x + b.ax * a) * UNIT, y: (b.y + b.ay * a) * UNIT }
  }
  if (s.aboard.get(eid) === Uid.v[eid]) return toSpan ? { x: tx, y: ty } : end(bankOf(s, tx, ty))
  const mine = bankOf(s, x, y)
  if (!toSpan && mine === bankOf(s, tx, ty)) return { x: tx, y: ty }
  const me = bridgeLocal(b, x / UNIT, y / UNIT)
  const onRamp = Math.abs(me.t) <= b.width && Math.abs(me.a) >= b.span && Math.abs(me.a) <= b.half
  return onRamp ? (toSpan ? { x: tx, y: ty } : end(-mine)) : end(mine)
}

/** 离壁 reach 像素以内几乎正对着壁走时改为顺着壁走：寺墙、林缘、树干、石组与竹栅都挡路 */
function alongWall(s: SakuraState, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const b = s.plan.basin
  if (roomAt(b, x, y) > reach) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  if (dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 干地上离壁至少 room 像素的一点：从 p 往外一圈圈找，找不到就原样退回壁外 */
function dryNear(sim: Sim, s: SakuraState, p: Point, room: number): Point {
  const b = s.plan.basin
  for (let r = 0; r <= 6 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(b, q.x, q.y) >= room && !wetAt(sim, s, q.x, q.y)) return q
    }
  }
  return keepOut(b, p.x, p.y, room)
}

/**
 * 谁在桥上：在桥面架在水上的那段的范围里，原先就在桥上的、从干地上走进来的都算；从水里漂进来、蹚进来的在桥下。
 * 刚掉出来的掉落物落在桥面那段的范围里就是落在桥上；离开那段就下了桥
 */
function board(sim: Sim, s: SakuraState): void {
  const b = s.plan.bridge
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    const uid = Uid.v[eid]!
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const pickup = hasComponent(sim.world, eid, Pickup)
    const fresh = pickup && s.seen.get(eid) !== uid
    if (pickup) s.seen.set(eid, uid)
    if (!overSpan(b, x, y) || Span.lo[eid]! > 0) {
      s.aboard.delete(eid)
      continue
    }
    if (s.aboard.get(eid) === uid) continue
    if (pickup ? fresh : !wetAt(sim, s, x, y)) s.aboard.set(eid, uid)
  }
  for (const map of [s.aboard, s.seen, s.swimming]) for (const [eid, uid] of map) if (Uid.v[eid] !== uid || (!Alive.v[eid] && !hasComponent(sim.world, eid, Pickup))) map.delete(eid)
}

/**
 * 樱庭：能走的是寺墙与三面林缘围着的空地，溪面也能走；寺墙、林缘、空地上樱花的树干、上游的石组与下游的竹栅是硬边界，身体走到跟前就停住、顺着壁面滑。
 * 水里站不住的身体随水漂、自己划水，站得住的跟在岸上一样，掉落物顺水漂（见 wade）；漂到下游的被水压在竹栅前，贴着竹栅挪到岸边才上得来。
 * 桥上的身体不沾水、出不了栏杆，桥下的照样漂
 */
export const sakura: WorldHooks = {
  torus: false,
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  mediumVelocity() {
    return ZERO
  },
  pull() {
    return ZERO
  },
  sink() {
    return false
  },
  surface(sim) {
    return groundOf(sim)
  },
  effort() {
    return 1
  },
  /** 桥上的不沾水；其余见 wade */
  contact(sim, eid, dt, x, y, vx, vy, out) {
    const s = sakuraOf(sim)
    if (!s.water || s.aboard.get(eid) === Uid.v[eid]) return false
    return wade(sim, cfgOf(sim), s.water, s.swimming, eid, dt, x, y, vx, vy, out)
  },
  constrainBody(sim, eid, from, next) {
    const s = sakuraOf(sim)
    const r = Radius.v[eid]!
    const p = keepOut(s.plan.basin, next.x, next.y, r)
    return s.aboard.get(eid) === Uid.v[eid] ? railing(s.plan.bridge, from, p, r) : p
  },
  basin(sim) {
    return sakuraOf(sim).plan.basin
  },
  /** 队员过溪走桥（见 viaBridge），敌人直奔目标，追进水里就随水漂 */
  chaseDir(sim, eid, tx, ty) {
    const s = sakuraOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const g = sim.characters.includes(eid) ? viaBridge(s, eid, x, y, tx, ty) : { x: tx, y: ty }
    const d = norm(g.x - x, g.y - y)
    return alongWall(s, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const b = sakuraOf(sim).plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = awayFromWall(b, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = sakuraOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(s, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  /** 刷怪点落在干地上、离壁至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = sakuraOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: sim.mapW / 2, y: sim.mapH / 2 }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(s.plan.basin, p.x, p.y) < UNIT || wetAt(sim, s, p.x, p.y)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return dryNear(sim, s, p, UNIT)
  },
  center(sim) {
    const st = sakuraOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return dryNear(sim, sakuraOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  ground(sim) {
    return sim.hooks.basin(sim)
  },
  /** 站得下；落在水里的要这么大的身体在那里站得住 */
  canSpawn(sim, x, y, radius) {
    const s = sakuraOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && (!s.water || holds(cfgOf(sim), s.water, x, y, radius, ENEMY_BODY.mass))
  },
  landmarks(sim) {
    return sakuraOf(sim).marks
  },
  lean() {
    return ZERO
  },
  onStart(sim) {
    sakuraOf(sim)
  },
  tick(sim) {
    board(sim, sakuraOf(sim))
  },
}
