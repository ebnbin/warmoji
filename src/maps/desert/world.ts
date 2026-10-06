import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Barrier, Drive, Drop, Flyer, Motion, MOTION, Phys, Pickup, PrevPos, Radius, Shadow, Shard, Transform } from '../../ecs/components'
import { traces } from '../../ecs/store'
import { approach } from '../../ecs/systems/shared/body'
import { clearM, passCost, phases, probeZ, topOf } from '../../ecs/utils/pass'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { LandmarkKind } from './landmarks'
import type { ObstacleId } from '../../types/obstacles'
import { leaderPoint, leaderX, leaderY } from '../../ecs/utils/team'
import { mapEvent } from '../../ecs/fight/events'
import { gridAt, makePlan, slopeAt, solidAt, sunAt, wrapU } from './terrain'
import { desertMarks } from './marks'
import { paceOf } from './gait'
import { newTracks, packAt, stepTracks } from './tracks'
import type { DesertPlan } from './terrain'
import type { Pace } from './gait'
import type { Tracks } from './tracks'
import type { DesertConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Landmark } from '../landmark'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'
import type { Solid } from '../../ecs/worlds/solids'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 弹体飞到离队长这么近（格）的对面那一半就消失：再往前就该从背后绕回来了 */
const FAR_EDGE_U = 0.5
/** 追人的离标志物这么近（格，在身体半径之外）就开始贴着边绕；游荡与逃跑的看得远一些 */
const GLIDE_U = 0.3
const DRIFT_GLIDE_U = 0.6
/** 刷怪点与定点离标志物至少留这么宽（格），头目留得更宽 */
const SETTLE_U = 0.7
const BOSS_SETTLE_U = 1.3

/** 沙漠此刻的状态：按种子生成的地形与它上面的地标（基准的那一份），沙上的印子与踩实 */
export interface DesertState {
  readonly plan: DesertPlan
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly tracks: Tracks
  /** 这一场队长从哪出发（队长自己的坐标从不回绕），还没走过是 null；离开它沿横竖哪个方向走满了几圈 */
  origin: Point | null
  laps: number
}

function cfgOf(sim: Sim): DesertConfig {
  return MAPS[sim.mapId].desert!
}

export function desertOf(sim: Sim): DesertState {
  let s = sim.worldState.desert
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = makePlan(cfg, sim.run.decorSeed)
    s = { plan, marks: desertMarks(plan), tracks: newTracks(plan.sizeU), origin: null, laps: 0 }
    sim.worldState.desert = s
  }
  return s
}

/** 环面上离 c 最近的那一份 v */
function near(v: number, c: number, size: number): number {
  return c + wrapU(v - c, size)
}

function nearLeader(sim: Sim, x: number, y: number): Point {
  return { x: near(x, leaderX(sim), sim.mapW), y: near(y, leaderY(sim), sim.mapH) }
}

/**
 * 每样东西都挪到离队长最近的那一份上：镜头跟着队长走，看到的范围比一圈小，于是每样东西只画一份、画在该在的地方。
 * 挪的总是整圈，位置的意义不变；连同它记着的别的位置（上一帧的位置、位移的起止、影子与飞返体的起止、走过的路、墙）一起挪
 */
function rewrap(sim: Sim): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const w = sim.mapW
  const h = sim.mapH
  for (const eid of query(sim.world, [Transform])) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const dx = near(x, lx, w) - x
    const dy = near(y, ly, h) - y
    if (dx === 0 && dy === 0) continue
    Transform.x[eid] = x + dx
    Transform.y[eid] = y + dy
    if (hasComponent(sim.world, eid, PrevPos)) {
      PrevPos.x[eid] = PrevPos.x[eid]! + dx
      PrevPos.y[eid] = PrevPos.y[eid]! + dy
    }
    if (hasComponent(sim.world, eid, Motion) && Motion.kind[eid] !== MOTION.none) {
      Motion.fx[eid] = Motion.fx[eid]! + dx
      Motion.fy[eid] = Motion.fy[eid]! + dy
      if (Motion.kind[eid] !== MOTION.follow) {
        Motion.tx[eid] = Motion.tx[eid]! + dx
        Motion.ty[eid] = Motion.ty[eid]! + dy
      }
    }
    if (hasComponent(sim.world, eid, Shadow)) {
      Shadow.fx[eid] = Shadow.fx[eid]! + dx
      Shadow.fy[eid] = Shadow.fy[eid]! + dy
      Shadow.tx[eid] = Shadow.tx[eid]! + dx
      Shadow.ty[eid] = Shadow.ty[eid]! + dy
    }
    if (hasComponent(sim.world, eid, Flyer)) {
      Flyer.launchX[eid] = Flyer.launchX[eid]! + dx
      Flyer.launchY[eid] = Flyer.launchY[eid]! + dy
      Flyer.destX[eid] = Flyer.destX[eid]! + dx
      Flyer.destY[eid] = Flyer.destY[eid]! + dy
    }
    if (hasComponent(sim.world, eid, Drop)) {
      Drop.fromY[eid] = Drop.fromY[eid]! + dy
      Drop.toY[eid] = Drop.toY[eid]! + dy
    }
    const r = traces[eid]
    if (r) {
      for (let k = 0; k < r.x.length; k++) {
        r.x[k] = r.x[k]! + dx
        r.y[k] = r.y[k]! + dy
      }
    }
  }
  for (const b of query(sim.world, [Barrier])) {
    const dx = near(Barrier.cx[b]!, lx, w) - Barrier.cx[b]!
    const dy = near(Barrier.cy[b]!, ly, h) - Barrier.cy[b]!
    if (dx === 0 && dy === 0) continue
    Barrier.ax[b] = Barrier.ax[b]! + dx
    Barrier.ay[b] = Barrier.ay[b]! + dy
    Barrier.bx[b] = Barrier.bx[b]! + dx
    Barrier.by[b] = Barrier.by[b]! + dy
    Barrier.cx[b] = Barrier.cx[b]! + dx
    Barrier.cy[b] = Barrier.cy[b]! + dy
  }
}

const SLOPE = { x: 0, y: 0 }
const PACE: Pace = { demand: 1, speed: 1 }
const SOLID = { d: 0, nx: 0, ny: 0 }

/** 半径 rad（像素）的身体陷进高过 clear 米的标志物多深就沿外法线退回多远，夹在两块之间时最多退三次 */
function pushOut(plan: DesertPlan, x: number, y: number, rad: number, clear = 0): Point {
  let px = x
  let py = y
  for (let k = 0; k < 3; k++) {
    solidAt(plan, px / UNIT, py / UNIT, SOLID, clear)
    const gap = SOLID.d * UNIT - rad
    if (gap >= 0) break
    px -= SOLID.nx * gap
    py -= SOLID.ny * gap
  }
  return { x: px, y: py }
}

/** 贴着高过 clear 米的标志物走：离它不到 reach（像素）又正朝它去时，削掉朝里的那一份，顺着边绕过去 */
function glide(plan: DesertPlan, x: number, y: number, dx: number, dy: number, reach: number, clear: number): Point {
  solidAt(plan, x / UNIT, y / UNIT, SOLID, clear)
  if (SOLID.d * UNIT > reach) return { x: dx, y: dy }
  const dot = dx * SOLID.nx + dy * SOLID.ny
  if (dot >= -0.2) return { x: dx, y: dy }
  const tx = dx - dot * SOLID.nx
  const ty = dy - dot * SOLID.ny
  const len = Math.hypot(tx, ty)
  return len > 1e-6 ? { x: tx / len, y: ty / len } : { x: -SOLID.ny, y: SOLID.nx }
}

/** 标志物的材质：枯树、路标杆、驼骨与仙人掌是细的、有缝的，弹体与视线从旁边过去；石堆与岩盘是实的 */
const MATERIAL: Record<LandmarkKind, ObstacleId> = { tree: 'landmark', post: 'landmark', bones: 'landmark', cactus: 'landmark', cairn: 'rock', rock: 'rock' }
/** 沿线段找进出标志物实心部分的地方，按这么长一步取样，格 */
const TRACE_STEP_U = 0.05

/** 相对标志物中心 (qx, qy) 格处在不在它的实心部分里 */
function insideSolids(l: DesertPlan['landmarks'][number], qx: number, qy: number): boolean {
  for (const s of l.shape.solids) {
    const ex = s.x1 - s.x0
    const ey = s.y1 - s.y0
    const l2 = ex * ex + ey * ey
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((qx - s.x0) * ex + (qy - s.y0) * ey) / l2)) : 0
    if (Math.hypot(qx - s.x0 - ex * t, qy - s.y0 - ey * t) < s.r) return true
  }
  return false
}

/** (x, y) 格处立着的标志物，叠着的取高的：环面上按离它最近的那一份算 */
function landmarkAt(plan: DesertPlan, x: number, y: number): Solid | null {
  let best: Solid | null = null
  for (const l of plan.landmarks) {
    const qx = wrapU(x - l.x, plan.sizeU)
    const qy = wrapU(y - l.y, plan.sizeU)
    const far = l.shape.reach + 1
    if (qx > far || qx < -far || qy > far || qy < -far || (best && best.topM >= l.shape.top) || !insideSolids(l, qx, qy)) continue
    best = { topM: l.shape.top, material: MATERIAL[l.kind] }
  }
  return best
}

/** 线段 a→b（格）上第一处探测在它里面、又要贯穿才过得去的标志物：按探测在那一点的高度比标志物占到的那一层的顶；环面上按离线段中点最近的那一份算 */
function landmarkTrace(plan: DesertPlan, p: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  const ex = bx - ax
  const ey = by - ay
  const len = Math.hypot(ex, ey)
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const n = Math.max(1, Math.ceil(len / TRACE_STEP_U))
  let best: Crossing | null = null
  for (const l of plan.landmarks) {
    const material = MATERIAL[l.kind]
    if (passCost(p, material) <= 0) continue
    const cx = mx + wrapU(l.x - mx, plan.sizeU) - ax
    const cy = my + wrapU(l.y - my, plan.sizeU) - ay
    const along = len > 1e-9 ? Math.max(0, Math.min(1, (cx * ex + cy * ey) / (len * len))) : 0
    if (Math.hypot(cx - ex * along, cy - ey * along) > l.shape.reach + TRACE_STEP_U) continue
    const top = topOf(l.shape.top)
    let t0 = -1
    for (let k = 0; k <= n; k++) {
      const s = k / n
      if (t0 < 0 && best && s >= best.t0) break
      const inside = probeZ(p, s) < top && insideSolids(l, ex * s - cx, ey * s - cy)
      if (inside && t0 < 0) t0 = s
      else if (!inside && t0 >= 0) {
        best = { t0, t1: s, material }
        t0 = -1
        break
      }
    }
    if (t0 >= 0) best = { t0, t1: 1, material }
  }
  return best
}

/** 在 (x, y) 像素处朝 (dx, dy) 走：坡度沿前进方向取，沙的松实按格子取，再算上被踩实的程度 */
function paceAt(s: DesertState, cfg: DesertConfig, x: number, y: number, dx: number, dy: number): Pace {
  const len = Math.hypot(dx, dy)
  const xu = x / UNIT
  const yu = y / UNIT
  slopeAt(s.plan, xu, yu, SLOPE)
  const i = (SLOPE.x * dx + SLOPE.y * dy) / len
  const loose = gridAt(s.plan, s.plan.soft, xu, yu)
  return paceOf(cfg.gait, i, loose, packAt(s.tracks, cfg, x, y), PACE)
}

/**
 * 沙漠：一片首尾相接的沙海，没有墙，四边是回绕的接缝；距离一律按环面上的最短差算，每样东西都挪到离队长最近的那一份上。
 * 赶路按坡度与沙的松实出力，吃力时走慢；背阴处歇着回得快；沙上留下印子，踩实的地方省力，过一阵被风吹平
 */
export const desert: WorldHooks = {
  torus: true,
  worldDelta(sim, fromX, fromY, toX, toY) {
    return { x: wrapU(toX - fromX, sim.mapW), y: wrapU(toY - fromY, sim.mapH) }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(sim, x, y) {
    return nearLeader(sim, x, y)
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
  /** 赶路的费力按地图的体力算；歇着时向阳处按地图的体力回复，背阴处回得快 */
  surface(sim, x, y) {
    const cfg = cfgOf(sim)
    const s = desertOf(sim)
    const st = MAPS[sim.mapId].stamina
    const shade = 1 - sunAt(s.plan, x / UNIT, y / UNIT)
    return { traction: 1, viscosity: 1, exertion: st.exertion, regen: st.regen + (cfg.shadeRegen - st.regen) * shade } satisfies Surface
  },
  /** 每走一格的费力是出力乘走得多快：照常的速度出更多力，走慢了每秒出的力封顶 */
  effort(sim, x, y, dx, dy) {
    if (dx === 0 && dy === 0) return 1
    const p = paceAt(desertOf(sim), cfgOf(sim), x, y, dx, dy)
    return p.demand * p.speed
  },
  contact(sim, eid, dt, x, y, vx, vy, out) {
    if (hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Shard)) return false
    const cfg = cfgOf(sim)
    const dx = Drive.x[eid]!
    const dy = Drive.y[eid]!
    const f = dx === 0 && dy === 0 ? 1 : paceAt(desertOf(sim), cfg, x, y, dx, dy).speed
    const g = sim.hooks.surface(sim, x, y)
    const k = (Phys.drag[eid]! * Phys.grip[eid]! * g.traction * g.viscosity) / Phys.mass[eid]!
    approach(out, x, y, vx, vy, dx * f, dy * f, k, dt)
    return true
  },
  /** 标志物挡人：跨得过的矮标志物不挡，会穿墙的照旧穿过去 */
  constrainBody(sim, eid, _from, next) {
    const p = nearLeader(sim, next.x, next.y)
    if (phases(sim.world, eid, 'landmark')) return p
    return pushOut(desertOf(sim).plan, p.x, p.y, Radius.v[eid]!, clearM(eid))
  },
  basin() {
    return null
  },
  trace(sim, probe, ax, ay, bx, by) {
    return landmarkTrace(desertOf(sim).plan, probe, ax / UNIT, ay / UNIT, bx / UNIT, by / UNIT)
  },
  solidAt(sim, x, y) {
    return landmarkAt(desertOf(sim).plan, x / UNIT, y / UNIT)
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'landmark')) return d
    return glide(desertOf(sim).plan, x, y, d.x, d.y, Radius.v[eid]! + GLIDE_U * UNIT, clearM(eid))
  },
  wanderDir(sim, eid, dx, dy) {
    if (phases(sim.world, eid, 'landmark')) return { x: dx, y: dy }
    return glide(desertOf(sim).plan, Transform.x[eid]!, Transform.y[eid]!, dx, dy, Radius.v[eid]! + DRIFT_GLIDE_U * UNIT, clearM(eid))
  },
  fleeDir(sim, eid, awayX, awayY) {
    if (phases(sim.world, eid, 'landmark')) return { x: awayX, y: awayY }
    return glide(desertOf(sim).plan, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + DRIFT_GLIDE_U * UNIT, clearM(eid))
  },
  outside(sim, x, y) {
    const m = FAR_EDGE_U * UNIT
    return Math.abs(wrapU(x - leaderX(sim), sim.mapW)) > sim.mapW / 2 - m || Math.abs(wrapU(y - leaderY(sim), sim.mapH)) > sim.mapH / 2 - m
  },
  /** 刷怪点在环面上随便一处，离队长至少 minPlayerDist 格，头目更远；不压着标志物 */
  spawnPoint(sim, boss) {
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    const min = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: lx + sim.mapW / 2, y: ly }
    for (let i = 0; i < 24; i++) {
      p = { x: lx + (sim.rng.next() - 0.5) * sim.mapW, y: ly + (sim.rng.next() - 0.5) * sim.mapH }
      if (Math.hypot(p.x - lx, p.y - ly) >= min) break
    }
    return pushOut(desertOf(sim).plan, p.x, p.y, (boss ? BOSS_SETTLE_U : SETTLE_U) * UNIT)
  },
  /** 环面没有中心：据点从队伍出发的地方起算 */
  center(sim) {
    const st = desertOf(sim).plan.start
    return nearLeader(sim, st.x * UNIT, st.y * UNIT)
  },
  settle(sim, p) {
    const q = nearLeader(sim, p.x, p.y)
    return pushOut(desertOf(sim).plan, q.x, q.y, SETTLE_U * UNIT)
  },
  ground(sim) {
    return sim.hooks.basin(sim)
  },
  /** 不压着标志物 */
  canSpawn(sim, x, y, radius) {
    return solidAt(desertOf(sim).plan, x / UNIT, y / UNIT, SOLID).d * UNIT >= radius
  },
  /** 每处都给离队长最近的那一份：吸附按直线距离量 */
  landmarks(sim) {
    const out: Record<string, Landmark[]> = {}
    for (const [k, list] of Object.entries(desertOf(sim).marks)) out[k] = list.map((m) => ({ ...m, ...nearLeader(sim, m.x, m.y) }))
    return out
  },
  lean() {
    return ZERO
  },
  onStart(sim) {
    desertOf(sim)
  },
  /** 先把一切挪到离队长最近的那一份上，再按这一帧走过的路落印子；队长离出发点又沿横竖哪个方向多走满一圈就记一次 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = desertOf(sim)
    rewrap(sim)
    const lead = leaderPoint(sim)
    s.origin ??= lead
    const laps = Math.floor(Math.max(Math.abs(lead.x - s.origin.x) / sim.mapW, Math.abs(lead.y - s.origin.y) / sim.mapH))
    for (; s.laps < laps; s.laps++) mapEvent(sim, 'lap')
    s.tracks.now = sim.elapsedMs / 1000
    const plan = s.plan
    stepTracks(sim, s.tracks, cfg, plan.sizeU, (x, y) => gridAt(plan, plan.soft, x / UNIT, y / UNIT), delta / 1000)
  },
}
