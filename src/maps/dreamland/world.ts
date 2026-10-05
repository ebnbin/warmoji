import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import type { Point } from '../../util/vec'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Drive, Phys, Pickup, Radius, Shard, Transform, Uid } from '../../ecs/components'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import type { WorldHooks } from '../../ecs/worlds/hooks'
import { passCost } from '../../ecs/utils/pass'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { ObstacleId } from '../../types/obstacles'
import type { Solid } from '../../ecs/worlds/solids'
import type { Sim } from '../../ecs/sim'
import { leaderPoint } from '../../ecs/utils/team'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import type { Landmark } from '../landmark'
import { brace, paceOf, slide } from '../slope'
import { dreamlandMarks, dreamlandPlan, edgePoint, gaugeAt, nearEdge } from './layout'
import type { DreamlandPlan, Near } from './layout'
import { beltAt, floorOf, makeDreamland, openSide, stepDreamland } from './model'
import type { DreamlandState } from './model'
import type { DreamlandConfig } from '../../types/maps'

/** 乐园按布景种子打散出自己的种子：操作员挑边与传送带换向的时刻 */
const SEED = 0x7ee1a
/** 寻路时绕着台子走，一次往前看这么大的角度 */
const AROUND = Math.PI / 6
/** 离入口这么近（格）就直奔过去 */
const DOOR_NEAR_U = 1.2

/** 乐园在一局里的全部：会变的状态与给出怪口的地标 */
export interface DreamlandWorld {
  readonly s: DreamlandState
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
}

function cfgOf(sim: Sim): DreamlandConfig {
  return MAPS[sim.mapId].dreamland!
}

export function dreamlandOf(sim: Sim): DreamlandWorld {
  let w = sim.worldState.dreamland
  if (!w) {
    const plan = dreamlandPlan(cfgOf(sim))
    w = { s: makeDreamland(cfgOf(sim), plan, new Rng(sim.run.decorSeed ^ SEED)), marks: dreamlandMarks(plan) }
    sim.worldState.dreamland = w
  }
  return w
}

/** 台面上平地赶路的阻力，像素/秒² */
function resistPx(cfg: DreamlandConfig): number {
  return (cfg.gait.flatResistance * UNIT) / cfg.meterPerU
}

function onStage(plan: DreamlandPlan, x: number, y: number): boolean {
  return gaugeAt(plan, x, y) < plan.stage
}

const NEAR: Near = { d: 0, nx: 0, ny: 0, k: 0, u: 0, corner: false }

/**
 * 线段 a→b 进出边心距为 r 的正多边形的参数：进是 t0、出是 t1（按线段从 0 到 1），进的那条边 k；不相交时 t0 > t1。
 * 起点在里面时 t0 为 0、k 为 -1
 */
function clip(plan: DreamlandPlan, r: number, ax: number, ay: number, bx: number, by: number): { t0: number; t1: number; k: number } {
  let t0 = 0
  let t1 = 1
  let k = -1
  const dx = bx - ax
  const dy = by - ay
  for (let i = 0; i < plan.sides; i++) {
    const n = plan.normals[i]!
    const num = r - ((ax - plan.cx) * n.x + (ay - plan.cy) * n.y)
    const den = dx * n.x + dy * n.y
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return { t0: 1, t1: 0, k: -1 }
      continue
    }
    const t = num / den
    if (den < 0) {
      if (t > t0) {
        t0 = t
        k = i
      }
    } else if (t < t1) t1 = t
  }
  return { t0, t1, k }
}

/**
 * 半径 r 的身体相对台沿的位置修正：from 在台面以内的留在台上，在外面的留在台下；此刻开着的那个入口不挡，身体整个落在入口的宽度里才过得去。
 * 台下的一下越过台沿（跳、闪）停在台沿外；被挡住时 wall 记下壁面朝着身体那一侧的法线
 */
function stageBound(w: DreamlandWorld, cfg: DreamlandConfig, from: Point, x: number, y: number, r: number, wall: Point | null): Point {
  const s = w.s
  const plan = s.plan
  const open = openSide(s, cfg)
  const inside = onStage(plan, from.x, from.y)
  let px = x
  let py = y
  if (!inside) {
    const c = clip(plan, plan.stage, from.x, from.y, px, py)
    if (c.k >= 0 && c.t0 <= c.t1 && c.t0 <= 1) {
      const qx = from.x + (px - from.x) * c.t0
      const qy = from.y + (py - from.y) * c.t0
      const t = plan.tangents[c.k]!
      const u = (qx - plan.cx) * t.x + (qy - plan.cy) * t.y
      if (c.k !== open || Math.abs(u) > plan.door - r) {
        px = qx
        py = qy
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    nearEdge(plan, plan.stage, px, py, NEAR)
    if (NEAR.k === open && !NEAR.corner && Math.abs(NEAR.u) <= plan.door - r) break
    if (inside) {
      if (NEAR.d <= -r) break
      px -= NEAR.nx * (NEAR.d + r)
      py -= NEAR.ny * (NEAR.d + r)
      if (wall) {
        wall.x = -NEAR.nx
        wall.y = -NEAR.ny
      }
    } else {
      if (NEAR.d >= r) break
      px += NEAR.nx * (r - NEAR.d)
      py += NEAR.ny * (r - NEAR.d)
      if (wall) {
        wall.x = NEAR.nx
        wall.y = NEAR.ny
      }
    }
  }
  return { x: px, y: py }
}

/** 离台沿 reach 像素以内几乎正对着台沿走、又过不去时改为顺着台沿走；开着的入口那一段照直走 */
function alongStage(w: DreamlandWorld, cfg: DreamlandConfig, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const plan = w.s.plan
  nearEdge(plan, plan.stage, x, y, NEAR)
  if (Math.abs(NEAR.d) > reach) return { x: dx, y: dy }
  if (NEAR.k === openSide(w.s, cfg) && !NEAR.corner && Math.abs(NEAR.u) <= plan.door) return { x: dx, y: dy }
  const inside = NEAR.d < 0
  const nx = inside ? -NEAR.nx : NEAR.nx
  const ny = inside ? -NEAR.ny : NEAR.ny
  if (dx * nx + dy * ny > -0.5) return { x: dx, y: dy }
  const side = dy * nx - dx * ny >= 0 ? 1 : -1
  return { x: -ny * side, y: nx * side }
}

/** 台下的身体绕着台子走到 (tx, ty)：直线被台子挡着时沿着这一圈往近的那一头先走一段 */
function aroundStage(plan: DreamlandPlan, x: number, y: number, tx: number, ty: number, r: number): Point {
  const c = clip(plan, plan.stage, x, y, tx, ty)
  if (c.t0 > c.t1 || c.t0 >= 1 || c.k < 0) return { x: tx, y: ty }
  const a = Math.atan2(y - plan.cy, x - plan.cx)
  const b = Math.atan2(ty - plan.cy, tx - plan.cx)
  const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  const next = a + Math.sign(turn || 1) * Math.min(Math.abs(turn), AROUND)
  const ring = Math.max(gaugeAt(plan, x, y), plan.stage + r + 0.3 * UNIT) / Math.cos(Math.PI / plan.sides)
  return { x: plan.cx + Math.cos(next) * ring, y: plan.cy + Math.sin(next) * ring }
}

/** 要从台上去台下或反过来时先去的入口：正倾过去或停着的那条边，预警里要倾向的那条边；都没有为 -1 */
function doorSide(w: DreamlandWorld): number {
  const op = w.s.op
  if (op.phase === 'hold' || op.phase === 'tilt') return op.side
  if (op.phase === 'warn') return op.next
  return -1
}

/**
 * 去 (tx, ty) 的下一个落脚点：同在台上直奔；同在台下绕着台子走；一上一下就去要开的那个入口，开着了穿过去；
 * 没有要开的入口时在自己这一层靠近目标的那一边等着
 */
function route(w: DreamlandWorld, cfg: DreamlandConfig, x: number, y: number, tx: number, ty: number, r: number): Point {
  const plan = w.s.plan
  const here = onStage(plan, x, y)
  const there = onStage(plan, tx, ty)
  if (here === there) return here ? { x: tx, y: ty } : aroundStage(plan, x, y, tx, ty, r)
  const k = doorSide(w)
  if (k < 0) return here ? edgePoint(plan, nearestSide(plan, tx, ty), plan.stage - r - 0.4 * UNIT, 0) : aroundStage(plan, x, y, tx, ty, r)
  const gap = r + 0.3 * UNIT
  const outside = edgePoint(plan, k, plan.stage + gap, 0)
  const inside = edgePoint(plan, k, plan.stage - gap, 0)
  const near = here ? inside : outside
  const far = here ? outside : inside
  const open = openSide(w.s, cfg) === k
  if (open && Math.hypot(near.x - x, near.y - y) < DOOR_NEAR_U * UNIT) return far
  return here ? near : aroundStage(plan, x, y, near.x, near.y, r)
}

/** 离 (x, y) 最近的那条台沿 */
function nearestSide(plan: DreamlandPlan, x: number, y: number): number {
  nearEdge(plan, plan.stage, x, y, NEAR)
  return NEAR.k
}

/** 沿台沿与外沿滑开的方向：先按外沿，再按台沿 */
function steer(w: DreamlandWorld, cfg: DreamlandConfig, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const d = alongWall(w.s.plan.basin, x, y, dx, dy, reach)
  return alongStage(w, cfg, x, y, d.x, d.y, reach)
}

const WALL: Point = { x: 0, y: 0 }

/** 一条有符号的二次式 qa·t² + qb·t + qc 在 [t0, t1] 里第一次小于零的地方，没有为 -1 */
function firstBelow(qa: number, qb: number, qc: number, t0: number, t1: number): number {
  if (t0 > t1) return -1
  const f = (t: number): number => (qa * t + qb) * t + qc
  if (f(t0) < -1e-9) return t0
  let root = -1
  if (Math.abs(qa) < 1e-12) {
    if (qb < 0) root = -qc / qb
  } else {
    const disc = qb * qb - 4 * qa * qc
    if (disc <= 0) return -1
    const q = Math.sqrt(disc)
    const r1 = (-qb - Math.sign(qa) * q) / (2 * qa)
    const r2 = (-qb + Math.sign(qa) * q) / (2 * qa)
    root = qa > 0 ? r1 : r2
  }
  return root >= t0 && root < t1 ? root : -1
}

/**
 * 线段 a→b 上第一处探测钻进实心的地方：台面以内是台身（顶就是此刻的台面），台面以外是传送带的平地，外圈外沿以外是一直高上去的布景。
 * 探测与台面都按真实的高度比：台面是一块斜的平面，探测是抛物线，交点按二次式解出来
 */
function traceAt(w: DreamlandWorld, cfg: DreamlandConfig, p: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  const s = w.s
  const plan = s.plan
  let best: Crossing | null = null
  const pick = (t0: number, t1: number, material: ObstacleId): void => {
    if (t0 < 0 || passCost(p, material) <= 0 || (best !== null && best.t0 <= t0)) return
    best = { t0, t1, material }
  }
  const out = clip(plan, plan.outer, ax, ay, bx, by)
  if (out.t0 > 0 || out.t0 > out.t1) pick(0, 1, 'scenery')
  else if (out.t1 < 1) pick(out.t1, 1, 'scenery')
  const qa = -4 * p.arc
  const qb = p.h1 - p.h0 + 4 * p.arc
  const qc = p.h0
  const st = clip(plan, plan.stage, ax, ay, bx, by)
  const hit = st.t0 <= st.t1
  const s0 = hit ? st.t0 : 1
  const s1 = hit ? st.t1 : 1
  pick(firstBelow(qa, qb, qc, 0, s0), s0, 'belt')
  if (hit) {
    const top = cfg.pivotM - s.sx * (ax - plan.cx) - s.sy * (ay - plan.cy)
    pick(firstBelow(qa, qb + s.sx * (bx - ax) + s.sy * (by - ay), qc - top, s0, s1), s1, 'stage')
    pick(firstBelow(qa, qb, qc, s1, 1), 1, 'belt')
  }
  return best
}

/**
 * 梦幻乐园：能走的是两圈传送带围着的摇摆台。台面按操作员的时间表倾斜，倾斜的台面上赶路按恒定功率、闲着的身体与金币按库仑摩擦顺坡滑；
 * 台沿一圈是围栏，只有倾到底贴着传送带的那条边的入口开着时过得去人，台上台下的高度一律按真实的地面算；
 * 传送带带着脚下的身体与金币走，内外圈相反；外圈外沿以外是一直高上去的布景
 */
export const dreamland: WorldHooks = {
  ...bounded,
  trace(sim, probe, ax, ay, bx, by) {
    return traceAt(dreamlandOf(sim), cfgOf(sim), probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y): Solid | null {
    const w = dreamlandOf(sim)
    const plan = w.s.plan
    const g = gaugeAt(plan, x, y)
    if (g >= plan.outer) return { topM: Infinity, material: 'scenery' }
    return g < plan.stage ? { topM: floorOf(w.s, cfgOf(sim), x, y), material: 'stage' } : null
  },
  floorZ(sim, x, y) {
    return floorOf(dreamlandOf(sim).s, cfgOf(sim), x, y)
  },
  mediumVelocity(sim, x, y) {
    return beltAt(dreamlandOf(sim).s, cfgOf(sim), x, y, { x: 0, y: 0 })
  },
  /** 台面上恒定功率下每秒花的体力不变，每格的费力是功率之比；传送带上按带面走，同平地 */
  effort(sim, x, y, dx, dy) {
    const w = dreamlandOf(sim)
    const len = Math.hypot(dx, dy)
    if (len === 0 || !onStage(w.s.plan, x, y)) return 1
    const cfg = cfgOf(sim)
    const sl = w.s.slope
    const c = resistPx(cfg)
    const along = (sl.gx * dx + sl.gy * dy) / len
    return Math.max(cfg.gait.effortMin, paceOf(sl.gx, sl.gy, dx, dy, c, cfg.gait.downhillMax) * (1 - along / c))
  },
  /** 台面上的身体与金币按斜面滑，撞上关着的台沿就停在围栏里；台面以外照常积分，传送带由介质速度带着走 */
  contact(sim, eid, dt, x, y, vx, vy, out) {
    const w = dreamlandOf(sim)
    const sl = w.s.slope
    if (hasComponent(sim.world, eid, Shard) || !onStage(w.s.plan, x, y)) {
      sl.slips.delete(eid)
      return false
    }
    const cfg = cfgOf(sim)
    const coin = hasComponent(sim.world, eid, Pickup)
    const dx = Drive.x[eid]!
    const dy = Drive.y[eid]!
    const walking = dx !== 0 || dy !== 0
    const f = walking && !coin ? paceOf(sl.gx, sl.gy, dx, dy, resistPx(cfg), cfg.gait.downhillMax) : 1
    const g = sim.hooks.surface(sim, x, y)
    const k = (Phys.drag[eid]! * Phys.grip[eid]! * g.traction * g.viscosity) / Phys.mass[eid]!
    slide(sl, out, eid, Uid.v[eid]!, x, y, vx, vy, dt, k, dx * f, dy * f, walking, coin ? cfg.friction.coin : cfg.friction.body)
    const to = stageBound(w, cfg, { x, y }, out.x, out.y, Radius.v[eid]!, WALL)
    if (to.x !== out.x || to.y !== out.y) {
      brace(sl, out, eid, WALL)
      out.x = to.x
      out.y = to.y
    }
    return true
  },
  constrainBody(sim, eid, from, next) {
    const w = dreamlandOf(sim)
    const r = Radius.v[eid]!
    const p = keepOut(w.s.plan.basin, next.x, next.y, r)
    return stageBound(w, cfgOf(sim), from, p.x, p.y, r, null)
  },
  /** 被拴着、抱着拖走的身体也过不去关着的台沿 */
  follow(sim, eid, from, next) {
    return stageBound(dreamlandOf(sim), cfgOf(sim), from, next.x, next.y, Radius.v[eid]!, null)
  },
  basin(sim) {
    return dreamlandOf(sim).s.plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const w = dreamlandOf(sim)
    const cfg = cfgOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const goal = route(w, cfg, x, y, tx, ty, r)
    const d = norm(goal.x - x, goal.y - y)
    return steer(w, cfg, x, y, d.x, d.y, r + 0.3 * UNIT)
  },
  /** 游荡着走到外沿或关着的台沿跟前就折回来 */
  wanderDir(sim, eid, dx, dy) {
    const w = dreamlandOf(sim)
    const d = wanderIn(w.s.plan.basin, eid, dx, dy)
    return alongStage(w, cfgOf(sim), Transform.x[eid]!, Transform.y[eid]!, d.x, d.y, Radius.v[eid]! + 0.6 * UNIT)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return steer(dreamlandOf(sim), cfgOf(sim), Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在传送带上、离队长足够远 */
  spawnPoint(sim, boss) {
    const plan = dreamlandOf(sim).s.plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = edgePoint(plan, 0, (plan.stage + plan.outer) / 2, 0)
    for (let i = 0; i < 64; i++) {
      const q = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      const g = gaugeAt(plan, q.x, q.y)
      if (g < plan.stage + UNIT || g > plan.outer - UNIT) continue
      p = q
      if ((q.x - lead.x) ** 2 + (q.y - lead.y) ** 2 >= far * far) return q
    }
    return p
  },
  center(sim) {
    const plan = dreamlandOf(sim).s.plan
    return { x: plan.cx, y: plan.cy }
  },
  settle(sim, p) {
    const w = dreamlandOf(sim)
    const inset = SPAWN.edgeInset * UNIT
    const q = keepOut(w.s.plan.basin, p.x, p.y, inset)
    return stageBound(w, cfgOf(sim), q, q.x, q.y, inset, null)
  },
  /** 站得下：离外沿与台沿都至少一个身体宽 */
  canSpawn(sim, x, y, radius) {
    const plan = dreamlandOf(sim).s.plan
    if (!roomFor(plan.basin, x, y, radius)) return false
    nearEdge(plan, plan.stage, x, y, NEAR)
    return Math.abs(NEAR.d) >= Math.max(radius, 0.5 * UNIT) && roomAt(plan.basin, x, y) >= radius
  },
  landmarks(sim) {
    return dreamlandOf(sim).marks
  },
  onStart(sim) {
    dreamlandOf(sim)
  },
  tick(sim, delta) {
    stepDreamland(dreamlandOf(sim).s, cfgOf(sim), delta)
  },
}
