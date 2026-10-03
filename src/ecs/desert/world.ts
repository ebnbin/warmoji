import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Barrier, Drive, Drop, Flyer, Motion, MOTION, Phys, Pickup, PrevPos, Shadow, Shard, Transform } from '../components'
import { traces } from '../store'
import { approach } from '../systems/shared/body'
import { leaderX, leaderY } from '../utils/team'
import { desertPlanFor, gridAt, slopeAt, sunAt, wrapU } from './terrain'
import { paceOf } from './gait'
import { newTracks, packAt, stepTracks } from './tracks'
import type { DesertPlan } from './terrain'
import type { Pace } from './gait'
import type { Tracks } from './tracks'
import type { DesertConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'
import type { Surface, WorldHooks } from '../worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 弹体飞到离队长这么近（格）的对面那一半就消失：再往前就该从背后绕回来了 */
const FAR_EDGE_U = 0.5

/** 沙漠此刻的状态：按种子生成的地形，沙上的印子与踩实 */
export interface DesertState {
  readonly plan: DesertPlan
  readonly tracks: Tracks
}

function cfgOf(sim: Sim): DesertConfig {
  return MAPS[sim.mapId].desert!
}

/** 这一局的沙漠地形：视图要它定出发点与画地面，规则要它定一切，两边按同一个种子各要一次 */
export function desertPlanOf(cfg: DesertConfig, sizeU: number, decorSeed: number): DesertPlan {
  return desertPlanFor(cfg, sizeU, decorSeed)
}

export function desertOf(sim: Sim): DesertState {
  let s = sim.worldState.desert
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = desertPlanOf(cfg, sim.mapW / UNIT, sim.run.decorSeed)
    s = { plan, tracks: newTracks(plan.sizeU) }
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
  constrainBody(sim, _eid, _from, next) {
    return nearLeader(sim, next.x, next.y)
  },
  basin() {
    return null
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside(sim, x, y) {
    const m = FAR_EDGE_U * UNIT
    return Math.abs(wrapU(x - leaderX(sim), sim.mapW)) > sim.mapW / 2 - m || Math.abs(wrapU(y - leaderY(sim), sim.mapH)) > sim.mapH / 2 - m
  },
  /** 刷怪点在环面上随便一处，离队长至少 minPlayerDist 格，头目更远 */
  spawnPoint(sim, boss) {
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    const min = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: lx + sim.mapW / 2, y: ly }
    for (let i = 0; i < 24; i++) {
      p = { x: lx + (sim.rng.next() - 0.5) * sim.mapW, y: ly + (sim.rng.next() - 0.5) * sim.mapH }
      if (Math.hypot(p.x - lx, p.y - ly) >= min) break
    }
    return p
  },
  /** 环面没有中心：据点从队伍出发的地方起算 */
  center(sim) {
    const st = desertOf(sim).plan.start
    return nearLeader(sim, st.x * UNIT, st.y * UNIT)
  },
  settle(sim, p) {
    return nearLeader(sim, p.x, p.y)
  },
  onStart(sim) {
    desertOf(sim)
  },
  /** 先把一切挪到离队长最近的那一份上，再按这一帧走过的路落印子 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = desertOf(sim)
    rewrap(sim)
    s.tracks.now = sim.elapsedMs / 1000
    const plan = s.plan
    stepTracks(sim, s.tracks, cfg, plan.sizeU, (x, y) => gridAt(plan, plan.soft, x / UNIT, y / UNIT), delta / 1000)
  },
}
