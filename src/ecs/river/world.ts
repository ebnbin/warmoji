import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Airborne, Alive, CharScale, Drive, Hp, Motion, MOTION, Phys, Pickup, Radius, Shard, Slot, Transform, Uid } from '../components'
import { die } from '../systems/shared/combat'
import { fleeSteer } from '../systems/shared/steer'
import { hazardSource } from '../utils/source'
import { leaderPoint } from '../utils/team'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import { riverPlan } from './layout'
import { flowAt, sinkAt, solveWater } from './water'
import { drift, swept } from './bodies'
import type { Flow, Water } from './water'
import type { RiverPlan } from './layout'
import type { MapId, RiverConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'
import type { Surface, WorldHooks } from '../worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 河流地图按布景种子打散出自己的种子 */
const PLAN_SEED = 0x51ee7
/** 身体中心越过断崖边这么远（格）就落下去了 */
const FALL_U = 0.25
const FALLS_TINT = 0x9fd8ff

/**
 * 河流此刻的状态：按种子生成的地图，解出来的稳态水流（线程里解，解完之前还是 null）与解完的约定，
 * 以及哪些身体正在水里站不住、随水漂着（按实体记，uid 对不上就是换了实体）
 */
export interface RiverState {
  readonly plan: RiverPlan
  water: Water | null
  ready: Promise<void>
  readonly swimming: Map<number, number>
}

function cfgOf(sim: Sim): RiverConfig {
  return MAPS[sim.mapId].river!
}

/** 这一局的河流地图：视图要它定地图的大小，规则要它定一切，两边按同一个种子各要一次 */
export function riverPlanFor(cfg: RiverConfig, decorSeed: number): RiverPlan {
  return riverPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 在线程里解水流，开不了线程或线程出了错就在主线程解 */
function solveAsync(cfg: RiverConfig, plan: RiverPlan): Promise<Water> {
  return new Promise((resolve) => {
    const fallback = (e: unknown): void => {
      console.error('解水流的线程用不了，改在主线程解', e)
      resolve(solveWater(cfg, plan))
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

export function riverOf(sim: Sim): RiverState {
  let s = sim.worldState.river
  if (!s) {
    const cfg = cfgOf(sim)
    const state: RiverState = { plan: riverPlanFor(cfg, sim.run.decorSeed), water: null, ready: Promise.resolve(), swimming: new Map() }
    state.ready = solveAsync(cfg, state.plan).then((w) => {
      state.water = w
    })
    s = state
    sim.worldState.river = s
  }
  return s
}

const GROUNDS = new Map<MapId, Surface>()

/** 干地：费力与回复来自地图；水里赶路按恒定功率，每秒花的体力和平地一样 */
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

/** 身体本来的大小：角色的判定半径里乘了队长倍率，那只是画面上突出队长，受力不算它 */
function bodyRadius(sim: Sim, eid: number): number {
  return hasComponent(sim.world, eid, CharScale) ? Radius.v[eid]! / CharScale.v[eid]! : Radius.v[eid]!
}

/** (x, y) 像素处有没有水：水深够不够算湿 */
function wetAt(sim: Sim, s: RiverState, x: number, y: number): boolean {
  return !!s.water && flowAt(s.water, x / UNIT, y / UNIT, FLOW).h >= cfgOf(sim).body.wetM
}

/** 离壁 reach 像素以内几乎正对着壁走时改为顺着壁走：树、石头、崖与深谷都挡路 */
function alongWall(s: RiverState, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const b = s.plan.basin
  if (roomAt(b, x, y) > reach) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  if (dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 干地上离壁至少 room 像素的一点：从 p 往外一圈圈找，找不到就原样退回壁外 */
function dryNear(sim: Sim, s: RiverState, p: Point, room: number): Point {
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

/** 越过了哪个出水口的断崖边：-1 是没有；脚下已经是深谷格（那里的水已经落下去了）也算越过 */
function overFalls(s: RiverState, x: number, y: number): number {
  const sunk = s.water ? sinkAt(s.water, x / UNIT, y / UNIT) : -1
  if (sunk >= 0) return sunk
  const plan = s.plan
  for (let k = 0; k < plan.outlets.length; k++) {
    const o = plan.outlets[k]!
    const ax = x / UNIT - o.x
    const ay = y / UNIT - o.y
    if (ax * o.nx + ay * o.ny > FALL_U && Math.abs(ax * -o.ny + ay * o.nx) < o.half + 1) return k
  }
  return -1
}

/**
 * 越过断崖边的都落进了深谷：角色倒下（落到谷里看不见了，复活时照常回到队伍里），敌人与召唤出的身体死去，掉落物没了；
 * 腾空的、被抛着的、穿行中的身体不沾水，碎片不管
 */
function plunge(sim: Sim, s: RiverState): void {
  const src = hazardSource('falls', FALLS_TINT)
  const st = sim.run.stats
  for (const eid of [...query(sim.world, [Phys, Transform, Radius])]) {
    const k = overFalls(s, Transform.x[eid]!, Transform.y[eid]!)
    if (k < 0 || hasComponent(sim.world, eid, Shard)) continue
    if (hasComponent(sim.world, eid, Pickup)) {
      removeEntity(sim.world, eid)
      continue
    }
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Airborne) || Motion.kind[eid] === MOTION.arc || Motion.kind[eid] === MOTION.transit) continue
    const o = s.plan.outlets[k]!
    const side = (Transform.x[eid]! / UNIT - o.x) * -o.ny + (Transform.y[eid]! / UNIT - o.y) * o.nx
    Transform.x[eid] = (o.x + o.nx * (FALL_U + 1) - o.ny * side) * UNIT
    Transform.y[eid] = (o.y + o.ny * (FALL_U + 1) + o.nx * side) * UNIT
    if (hasComponent(sim.world, eid, Slot)) {
      const slot = Slot.v[eid]!
      if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + Hp.v[eid]!
      st.hazardDamage.falls = (st.hazardDamage.falls ?? 0) + Hp.v[eid]!
    }
    die(sim, eid, src, Phys.vx[eid]!, Phys.vy[eid]!)
  }
}

/**
 * 河流：能走的是林子、岩石与崖围着的一片空地，河面也能走；树、石头、崖与深谷是硬边界，身体走到跟前就停住、顺着壁面滑。
 * 水里站不住的身体随水漂、自己划水（见 swept 与 drift），站得住的跟在岸上一样，掉落物顺水漂；被冲过断崖边就落进深谷
 */
export const river: WorldHooks = {
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
  surface(sim) {
    return groundOf(sim)
  },
  effort() {
    return 1
  },
  /** 掉落物落进水里跟落叶一样顺水漂，被吸向队伍的速度照加；碎片照常 */
  contact(sim, eid, dt, x, y, vx, vy, out) {
    const s = riverOf(sim)
    const w = s.water
    if (!w || hasComponent(sim.world, eid, Shard)) return false
    const cfg = cfgOf(sim)
    flowAt(w, x / UNIT, y / UNIT, FLOW)
    const g = sim.hooks.surface(sim, x, y)
    const k = (Phys.drag[eid]! * Phys.grip[eid]! * g.traction * g.viscosity) / Phys.mass[eid]!
    if (hasComponent(sim.world, eid, Pickup)) {
      if (FLOW.h < cfg.body.wetM) return false
      drift(cfg, out, x, y, vx, vy, FLOW.u, FLOW.v, Drive.x[eid]!, Drive.y[eid]!, k, dt)
      return true
    }
    const uid = Uid.v[eid]!
    const was = s.swimming.get(eid) === uid
    if (FLOW.h < cfg.body.wetM || !swept(cfg, bodyRadius(sim, eid), Phys.mass[eid]!, FLOW.h, FLOW.u, FLOW.v, was)) {
      s.swimming.delete(eid)
      return false
    }
    s.swimming.set(eid, uid)
    drift(cfg, out, x, y, vx, vy, FLOW.u, FLOW.v, Drive.x[eid]! * cfg.body.swim, Drive.y[eid]! * cfg.body.swim, k, dt)
    return true
  },
  constrainBody(sim, eid, _from, next) {
    return keepOut(riverOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return riverOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(riverOf(sim), x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const b = riverOf(sim).plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = awayFromWall(b, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = riverOf(sim)
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
    const s = riverOf(sim)
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
    const st = riverOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return dryNear(sim, riverOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  onStart(sim) {
    riverOf(sim)
  },
  tick(sim) {
    const s = riverOf(sim)
    plunge(sim, s)
    for (const [eid, uid] of s.swimming) if (Uid.v[eid] !== uid || !Alive.v[eid]) s.swimming.delete(eid)
  },
}
