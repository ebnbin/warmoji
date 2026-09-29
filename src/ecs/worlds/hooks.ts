import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { randomMapPoint } from '../utils/spawn'
import { Rng } from '../../util/rng'
import { MAP, MAPS } from '../../data/maps'
import type { IceConfig, MapDef, MapId, NebulaConfig, RiverConfig, ShipConfig, SpaceConfig, VolcanoConfig } from '../../types/maps'
import { onFloe } from '../worlds/ice'
import { clampToDisc, confineVelocity, meteorSweep, ringPoint } from '../worlds/space'
import { gravity, holeAt, inHorizon, meteorStart, meteorTrajectory } from '../worlds/nebula'
import { around, makeField, moltenAt, NO_SPILL, spillOf, spillVolume, stepLava } from '../worlds/volcano'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import type { Basin } from '../worlds/basin'
import type { VolcanoState } from '../worlds/volcano'
import { addWeight, bumpBalls, clearWeights, makeShip, paceOf, stepBalls, stepOnDeck, stepShip } from '../worlds/ship'
import type { ShipState } from '../worlds/ship'
import { clampToRiver, flowVector, pastDownstream, riverRect } from '../worlds/river'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from '../worlds/torus'
import type { RiverRect } from '../worlds/river'
import { isHorizontal } from '../utils/remap'
import { hasComponent, query, removeEntity } from 'bitecs'
import { Airborne, Alive, Boss, BreaksWalls, Drive, Due, ENEMY_SET, Hp, Meteor, Motion, MOTION, Phasing, Phys, Pickup, PICKUP_SET, PROJ_SET, Radius, Shard, Slot, Swarmer, Tint, Transform, Uid } from '../components'
import { bodyRules, meteorHit, meteorPath } from '../store'
import { spawnMeteor } from '../entities/meteor'
import { FlowField, generateRuins, reachableCells, WallGrid } from '../worlds/ruins'
import { hit } from '../systems/shared/damage'
import { despawnEnemy, die } from '../systems/shared/combat'
import { cullProjectile } from '../systems/shared/projectile'
import { inTransit } from '../utils/marks'
import { hazardSource } from '../utils/source'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { fleeSteer } from '../systems/shared/steer'
import { leaderX, leaderY, leaderPoint } from '../utils/team'
import { iceTraction } from '../systems/shared/squad'
import { withBuilt } from './built'
import type { BodyStep } from '../systems/shared/body'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []

export interface Surface {
  readonly traction: number
  readonly viscosity: number
  /** 赶路每走一格扣掉的体力点数 */
  readonly exertion: number
  /** 歇着时体力回复的倍率 */
  readonly regen: number
}
/** 脚不沾地时的地面：不打滑、不黏、不费力 */
export const GROUND: Surface = { traction: 1, viscosity: 1, exertion: 0, regen: 1 }

const GROUNDS = new Map<MapId, Surface>()

/** 这张图的地面：费力与回复来自地图，其余同平地 */
function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { ...GROUND, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

interface Walls {
  grid: WallGrid
  flow?: FlowField
  flowCellX: number
  flowCellY: number
  reflowAcc: number
  spawnCells: number[]
  smashed: number[]
}

export interface WorldState {
  tickAt: number
  walls: Walls | null
  hole: Point | null
  volcano: VolcanoState | null
  ship: ShipState | null
}

export function newWorldState(): WorldState {
  return { tickAt: 0, walls: null, hole: null, volcano: null, ship: null }
}

export interface WorldHooks {
  readonly torus: boolean
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  ghosts(sim: Sim, x: number, y: number): Point[]
  wrap(sim: Sim, x: number, y: number): Point
  projectileLifeMs(sim: Sim): number
  mediumVelocity(sim: Sim, x: number, y: number): Point
  /** 这里的引力加速度，像素/秒² */
  pull(sim: Sim, x: number, y: number): Point
  surface(sim: Sim, x: number, y: number): Surface
  /** 在这里朝 (dx, dy) 赶路的费力倍率：逆着介质更累，顺着更省力 */
  effort(sim: Sim, x: number, y: number, dx: number, dy: number): number
  /** 地面自己的接触力学：接管这一步就把位置与速度写进 out 并返回 true，否则按常规积分 */
  contact(sim: Sim, eid: number, dt: number, x: number, y: number, vx: number, vy: number, out: BodyStep): boolean
  /** 任何身体的位置修正：边界、障碍、环面回绕，按身体半径 */
  constrainBody(sim: Sim, eid: number, from: Point, next: Point): Point
  chaseDir(sim: Sim, eid: number, tx: number, ty: number): Point
  wallHit(sim: Sim, ax: number, ay: number, bx: number, by: number): Point | null
  smashWall(sim: Sim, x: number, y: number): void
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  fleeDir(sim: Sim, eid: number, awayX: number, awayY: number): Point
  /** 飞行物出了这里就消失 */
  outside(sim: Sim, x: number, y: number): boolean
  spawnPoint(sim: Sim, boss: boolean): Point
  /** 地图的中心：据点与定点刷怪从这里起算 */
  center(sim: Sim): Point
  /** 把一个点收进敌人能站、能走到队伍的范围 */
  settle(sim: Sim, p: Point): Point
  onStart(sim: Sim): void
  tick(sim: Sim, delta: number): void
}

const bounded: WorldHooks = {
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
  contact() {
    return false
  },
  constrainBody(sim, eid, _from, next) {
    const r = Radius.v[eid]!
    return {
      x: Math.min(Math.max(next.x, r), sim.mapW - r),
      y: Math.min(Math.max(next.y, r), sim.mapH - r),
    }
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const margin = 0.6 * UNIT
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return {
      x: (x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0) ? -dx : dx,
      y: (y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0) ? -dy : dy,
    }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return fleeSteer(Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  spawnPoint(sim, boss) {
    return randomMapPoint(
      sim.rng,
      sim.mapW,
      sim.mapH,
      (boss ? 2 : SPAWN.edgeInset) * UNIT,
      leaderPoint(sim),
      SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1),
    )
  },
  center(sim) {
    return { x: sim.mapW / 2, y: sim.mapH / 2 }
  },
  settle(sim, p) {
    const inset = SPAWN.edgeInset * UNIT
    return { x: Math.min(Math.max(p.x, inset), sim.mapW - inset), y: Math.min(Math.max(p.y, inset), sim.mapH - inset) }
  },
  onStart() {},
  tick() {},
}

function iceCfg(sim: Sim): IceConfig {
  return MAPS[sim.mapId].ice!
}

function floePx(sim: Sim): number {
  return iceCfg(sim).floeU * UNIT
}

const ice: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    if (!hasComponent(sim.world, eid, Pickup)) return next
    const r = Radius.v[eid]!
    const max = floePx(sim) - r
    return { x: Math.min(Math.max(next.x, r), max), y: Math.min(Math.max(next.y, r), max) }
  },
  surface(sim, x, y) {
    const cfg = iceCfg(sim)
    const g = groundOf(sim)
    if (onFloe(x, y, floePx(sim))) return { ...g, traction: iceTraction() }
    return { traction: cfg.waterTraction, viscosity: cfg.waterViscosity, exertion: cfg.waterExertion, regen: cfg.waterRegen }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside(sim, x, y) {
    const m = 6 * UNIT
    const px = floePx(sim)
    return x < -m || x > px + m || y < -m || y > px + m
  },
  onStart(sim) {
    sim.worldState.tickAt = iceCfg(sim).waterTickMs
  },
  tick(sim) {
    const cfg = iceCfg(sim)
    if (sim.elapsedMs < sim.worldState.tickAt) return
    sim.worldState.tickAt = sim.elapsedMs + cfg.waterTickMs
    const px = floePx(sim)
    const frac = cfg.waterTickMs / 1000
    const dmg = Math.round(cfg.waterTeamDps * frac)
    const src = hazardSource('coldWater', 0x4fc3f7)
    for (const m of sim.characters) {
      if (Alive.v[m] && !onFloe(Transform.x[m]!, Transform.y[m]!, px)) hit(sim, src, m, dmg, { tick: true })
    }
    const edmg = Math.round(cfg.waterEnemyDps * frac)
    for (const eid of [...query(sim.world, ENEMY_SET)]) {
      if (!onFloe(Transform.x[eid]!, Transform.y[eid]!, px)) hit(sim, src, eid, edmg, { tick: true })
    }
  },
}

const ruins: WorldHooks = {
  ...bounded,
  onStart(sim) {
    const cfg = MAPS[sim.mapId].walls
    if (!cfg) return
    const cols = Math.round(sim.mapW / UNIT)
    const rows = Math.round(sim.mapH / UNIT)
    const rng = new Rng(sim.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), cols, rows, {
      blocks: cfg.blocks,
      maxLen: cfg.maxLen,
      centerClearU: cfg.centerClearU,
    })
    const grid = new WallGrid(cols, rows, UNIT, blocked)
    const spawnCells = [...reachableCells(grid, Math.floor(cols / 2), Math.floor(rows / 2))]
    sim.worldState.walls = { grid, flowCellX: -1, flowCellY: -1, reflowAcc: 0, spawnCells, smashed: [] }
  },
  constrainBody(sim, eid, from, next) {
    const box = bounded.constrainBody(sim, eid, from, next)
    const w = sim.worldState.walls
    if (!w || hasComponent(sim.world, eid, Phasing) || hasComponent(sim.world, eid, BreaksWalls)) return box
    return w.grid.separateCircle(box.x, box.y, Math.min(Radius.v[eid]!, MAPS[sim.mapId].walls!.bodyRadiusCapU * UNIT))
  },
  chaseDir(sim, eid, tx, ty) {
    const w = sim.worldState.walls
    if (!w || hasComponent(sim.world, eid, Phasing)) return bounded.chaseDir(sim, eid, tx, ty)
    const dir = w.flow?.sampleDir(Transform.x[eid]!, Transform.y[eid]!)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return bounded.chaseDir(sim, eid, tx, ty)
  },
  wanderDir(sim, eid, dx, dy) {
    const d = bounded.wanderDir(sim, eid, dx, dy)
    const w = sim.worldState.walls
    if (!w) return d
    const ahead = 0.8 * UNIT
    if (w.grid.pointBlocked(Transform.x[eid]! + d.x * ahead, Transform.y[eid]! + d.y * ahead)) {
      return { x: -d.x, y: -d.y }
    }
    return d
  },
  wallHit(sim, ax, ay, bx, by) {
    return sim.worldState.walls?.grid.segmentHit(ax, ay, bx, by) ?? null
  },
  smashWall(sim, x, y) {
    const w = sim.worldState.walls
    if (!w) return
    const cx = w.grid.cellX(x)
    const cy = w.grid.cellY(y)
    if (!w.grid.isBlockedCell(cx, cy)) return
    w.grid.setBlocked(cx, cy, false)
    w.smashed.push(cy * w.grid.cols + cx)
    w.flowCellX = -1
  },
  spawnPoint(sim, boss) {
    const w = sim.worldState.walls
    if (!w || w.spawnCells.length === 0) return bounded.spawnPoint(sim, boss)
    const cfg = MAPS[sim.mapId].walls!
    const minCellDist = cfg.spawnMinCellDist + (boss ? 2 : 0)
    const ccx = w.grid.cellX(leaderX(sim))
    const ccy = w.grid.cellY(leaderY(sim))
    const min2 = minCellDist * minCellDist
    const cellCenter = (idx: number): Point => ({
      x: ((idx % w.grid.cols) + 0.5) * UNIT,
      y: (Math.floor(idx / w.grid.cols) + 0.5) * UNIT,
    })
    let fallback = cellCenter(w.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = w.spawnCells[Math.floor(sim.rng.next() * w.spawnCells.length)]!
      const p = cellCenter(idx)
      fallback = p
      const dx = (idx % w.grid.cols) - ccx
      const dy = Math.floor(idx / w.grid.cols) - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  },
  settle(sim, p) {
    const box = bounded.settle(sim, p)
    const w = sim.worldState.walls
    if (!w || w.spawnCells.length === 0) return box
    const cols = w.grid.cols
    const at = w.grid.cellY(box.y) * cols + w.grid.cellX(box.x)
    if (w.spawnCells.includes(at)) return box
    let best = w.spawnCells[0]!
    let bestD = Infinity
    for (const idx of w.spawnCells) {
      const dx = ((idx % cols) + 0.5) * UNIT - box.x
      const dy = (Math.floor(idx / cols) + 0.5) * UNIT - box.y
      if (dx * dx + dy * dy < bestD) {
        bestD = dx * dx + dy * dy
        best = idx
      }
    }
    return { x: ((best % cols) + 0.5) * UNIT, y: (Math.floor(best / cols) + 0.5) * UNIT }
  },
  tick(sim, delta) {
    const w = sim.worldState.walls
    if (!w) return
    w.reflowAcc += delta
    const cx = w.grid.cellX(leaderX(sim))
    const cy = w.grid.cellY(leaderY(sim))
    if (cx === w.flowCellX && cy === w.flowCellY && w.reflowAcc < MAPS[sim.mapId].walls!.reflowMs) return
    w.flow = new FlowField(w.grid, cx, cy)
    w.flowCellX = cx
    w.flowCellY = cy
    w.reflowAcc = 0
  },
}

function spaceCfg(sim: Sim): SpaceConfig {
  return MAPS[sim.mapId].space!
}

function fieldR(sim: Sim): number {
  return spaceCfg(sim).blackholeRadiusU * UNIT
}

/** 圆心在原点的禁锢圈：边界由圈约束，不按地图矩形反弹、剔除 */
const space: WorldHooks = {
  ...bounded,
  constrainBody(sim, _eid, from, next) {
    const r = fieldR(sim)
    const v = confineVelocity(from.x, from.y, 0, 0, next.x - from.x, next.y - from.y, r)
    return clampToDisc(from.x + v.x, from.y + v.y, 0, 0, r)
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside() {
    return false
  },
  spawnPoint(sim, boss) {
    const inner = fieldR(sim) - UNIT
    if (boss) {
      const b = ringPoint(sim.rng, ZERO, 6 * UNIT, 8 * UNIT)
      return clampToDisc(b.x, b.y, 0, 0, inner)
    }
    const min2 = (SPAWN.minPlayerDist * UNIT) ** 2
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    let p = ringPoint(sim.rng, ZERO, 0, inner)
    for (let i = 0; i < 20 && (p.x - lx) ** 2 + (p.y - ly) ** 2 < min2; i++) p = ringPoint(sim.rng, ZERO, 0, inner)
    return p
  },
  center() {
    return ZERO
  },
  settle(sim, p) {
    return clampToDisc(p.x, p.y, 0, 0, fieldR(sim) - UNIT)
  },
  onStart(sim) {
    sim.worldState.tickAt = 7000
  },
  tick(sim, delta) {
    const cfg = spaceCfg(sim).meteor
    const now = sim.elapsedMs
    const rr = cfg.radiusU * UNIT
    const m = query(sim.world, [Meteor])[0]
    if (m === undefined) {
      if (now < sim.worldState.tickAt) return
      const angle = sim.rng.next() * Math.PI * 2
      const offset = (sim.rng.next() * 2 - 1) * cfg.offsetU * UNIT
      const s = meteorSweep(leaderX(sim), leaderY(sim), angle, offset, (cfg.travelU * UNIT) / 2)
      spawnMeteor(sim, s, cfg.warnMs, rr * 2)
      return
    }
    if (now < Due.at[m]!) return
    const sx = Meteor.sx[m]!
    const sy = Meteor.sy[m]!
    const len = Math.hypot(Meteor.ex[m]! - sx, Meteor.ey[m]! - sy) || 1
    const t = Meteor.t[m]! + (cfg.speedU * UNIT * (delta / 1000)) / len
    Meteor.t[m] = t
    const x = sx + (Meteor.ex[m]! - sx) * t
    const y = sy + (Meteor.ey[m]! - sy) * t
    Transform.x[m] = x
    Transform.y[m] = y
    Transform.rot[m] = Transform.rot[m]! + (sim.dtMs / 1000) * 1.4
    Tint.alpha[m] = 1
    const struck = meteorHit[m]!
    const src = hazardSource('meteor', 0xffaa33)
    for (const mem of sim.characters) {
      if (!Alive.v[mem] || struck.has(Uid.v[mem]!)) continue
      if (Math.hypot(Transform.x[mem]! - x, Transform.y[mem]! - y) < rr) {
        struck.add(Uid.v[mem]!)
        hit(sim, src, mem, cfg.damage, { tick: true })
      }
    }
    for (const eid of [...query(sim.world, ENEMY_SET)]) {
      if (struck.has(Uid.v[eid]!)) continue
      if (Math.hypot(Transform.x[eid]! - x, Transform.y[eid]! - y) < rr) {
        struck.add(Uid.v[eid]!)
        hit(sim, src, eid, cfg.damage, { tick: true })
      }
    }
    if (t < 1) return
    removeEntity(sim.world, m)
    sim.worldState.tickAt = now + cfg.intervalMs + (sim.rng.next() * 2 - 1) * cfg.intervalJitterMs
  },
}

function nebulaCfg(sim: Sim): NebulaConfig {
  return MAPS[sim.mapId].nebula!
}

/** 空腔的边：壳层从这里开始 */
function nebulaWall(sim: Sim): number {
  return nebulaCfg(sim).shell.innerU * UNIT
}

/** 黑洞的位置由布景种子定下，视图从这里读 */
function holeOf(sim: Sim): Point {
  if (!sim.worldState.hole) sim.worldState.hole = holeAt(new Rng(sim.run.decorSeed ^ 0x6e62), nebulaCfg(sim))
  return sim.worldState.hole
}

const HOLE_TINT = 0x7c4dff
const METEOR_TINT = 0xffaa33

/** 中心进了视界的都被吞噬：角色倒下，敌人与召唤出的身体死去，掉落物、蜜蜂、弹体消失；穿行中没有实体，不吞 */
function swallow(sim: Sim): void {
  const cfg = nebulaCfg(sim)
  const hole = holeOf(sim)
  const inside = (eid: number): boolean => inHorizon(hole, cfg, Transform.x[eid]!, Transform.y[eid]!)
  const src = hazardSource('blackhole', HOLE_TINT)
  const st = sim.run.stats
  for (const m of sim.characters) {
    if (!Alive.v[m] || inTransit(m) || !inside(m)) continue
    const slot = Slot.v[m]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + Hp.v[m]!
    st.hazardDamage.blackhole = (st.hazardDamage.blackhole ?? 0) + Hp.v[m]!
    die(sim, m, src, 0, 0)
  }
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (Alive.v[eid] && !inTransit(eid) && inside(eid)) die(sim, eid, src, 0, 0)
  }
  for (const eid of [...query(sim.world, PICKUP_SET)]) {
    if (inside(eid)) removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Swarmer, Transform])]) {
    if (!inside(eid)) continue
    bodyRules[eid] = undefined
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    if (inside(eid)) cullProjectile(sim, eid)
  }
}

/** 壳层落下的碎块从内壁冲进空腔，初速对准队长身旁的瞄准点，之后只受引力 */
function launchNebulaMeteor(sim: Sim): void {
  const cfg = nebulaCfg(sim)
  const mc = cfg.meteor
  const a = sim.rng.next() * Math.PI * 2
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const off = (sim.rng.next() * 2 - 1) * mc.offsetU * UNIT
  const s = meteorStart(cfg, leaderX(sim) - dy * off, leaderY(sim) + dx * off, dx, dy)
  const v = mc.speedU * UNIT
  const path = meteorTrajectory(holeOf(sim), cfg, s.x, s.y, dx * v, dy * v)
  const last = path.length - 2
  const eid = spawnMeteor(sim, { sx: path[0]!, sy: path[1]!, ex: path[last]!, ey: path[last + 1]! }, mc.warnMs, mc.radiusU * UNIT * 2)
  meteorPath[eid] = path
}

/** 流星本体扫到的敌我各挨一下，伤害与此刻的动能成正比，即随速度的平方变化 */
function nebulaMeteorStrike(sim: Sim, m: number, x: number, y: number, speed: number): void {
  const mc = nebulaCfg(sim).meteor
  const rr = mc.radiusU * UNIT
  const damage = mc.damage * (speed / (mc.speedU * UNIT)) ** 2
  const struck = meteorHit[m]!
  const src = hazardSource('meteor', METEOR_TINT)
  const strike = (eid: number): void => {
    if (struck.has(Uid.v[eid]!) || Math.hypot(Transform.x[eid]! - x, Transform.y[eid]! - y) >= rr) return
    struck.add(Uid.v[eid]!)
    hit(sim, src, eid, damage, { tick: true })
  }
  for (const mem of sim.characters) if (Alive.v[mem]) strike(mem)
  for (const eid of [...query(sim.world, ENEMY_SET)]) strike(eid)
}

/** 星云的流星：预警后沿积分好的轨迹飞，轨迹走完（扎回壳层或掉进视界）就消失 */
function nebulaMeteors(sim: Sim, delta: number): void {
  const mc = nebulaCfg(sim).meteor
  const now = sim.elapsedMs
  const m = query(sim.world, [Meteor])[0]
  if (m === undefined) {
    if (now >= sim.worldState.tickAt) launchNebulaMeteor(sim)
    return
  }
  if (now < Due.at[m]!) return
  const path = meteorPath[m]!
  const t = Meteor.t[m]! + delta
  Meteor.t[m] = t
  const f = t / mc.stepMs
  const i = Math.floor(f)
  if (i * 2 + 3 >= path.length) {
    meteorPath[m] = undefined
    meteorHit[m] = undefined
    removeEntity(sim.world, m)
    sim.worldState.tickAt = now + mc.intervalMs + (sim.rng.next() * 2 - 1) * mc.intervalJitterMs
    return
  }
  const w = f - i
  const dx = path[i * 2 + 2]! - path[i * 2]!
  const dy = path[i * 2 + 3]! - path[i * 2 + 1]!
  const x = path[i * 2]! + dx * w
  const y = path[i * 2 + 1]! + dy * w
  Transform.x[m] = x
  Transform.y[m] = y
  Transform.rot[m] = Transform.rot[m]! + (sim.dtMs / 1000) * 1.4
  Tint.alpha[m] = 1
  nebulaMeteorStrike(sim, m, x, y, Math.hypot(dx, dy) / (mc.stepMs / 1000))
}

/** 星云：圆心在原点的空心星云，黑洞与壳层的万有引力作用于一切；没有墙，走进壳层的都被它的引力拉回空腔 */
const nebula: WorldHooks = {
  ...bounded,
  pull(sim, x, y) {
    return gravity(holeOf(sim), nebulaCfg(sim), x, y)
  },
  constrainBody(_sim, _eid, _from, next) {
    return next
  },
  wanderDir(sim, eid, dx, dy) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = Math.hypot(x, y)
    if (d < nebulaWall(sim) - 0.6 * UNIT || x * dx + y * dy <= 0) return { x: dx, y: dy }
    const dot = (dx * x + dy * y) / d
    return { x: dx - (2 * dot * x) / d, y: dy - (2 * dot * y) / d }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside(sim, x, y) {
    return Math.hypot(x, y) > nebulaCfg(sim).shell.outerU * UNIT
  },
  spawnPoint(sim, boss) {
    const hole = holeOf(sim)
    const clear2 = (nebulaCfg(sim).hole.clearU * UNIT) ** 2
    const near2 = (SPAWN.minPlayerDist * UNIT * (boss ? 2 : 1)) ** 2
    const inner = nebulaWall(sim) - UNIT
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    let p = ringPoint(sim.rng, ZERO, 0, inner)
    for (let i = 0; i < 24; i++) {
      if ((p.x - hole.x) ** 2 + (p.y - hole.y) ** 2 >= clear2 && (p.x - lx) ** 2 + (p.y - ly) ** 2 >= near2) break
      p = ringPoint(sim.rng, ZERO, 0, inner)
    }
    return p
  },
  center() {
    return ZERO
  },
  settle(sim, p) {
    const hole = holeOf(sim)
    const clear = nebulaCfg(sim).hole.clearU * UNIT
    const dx = p.x - hole.x
    const dy = p.y - hole.y
    const d = Math.hypot(dx, dy)
    const q = d >= clear ? p : d < 1e-6 ? { x: hole.x + clear, y: hole.y } : { x: hole.x + (dx / d) * clear, y: hole.y + (dy / d) * clear }
    return clampToDisc(q.x, q.y, 0, 0, nebulaWall(sim) - UNIT)
  },
  onStart(sim) {
    holeOf(sim)
    sim.worldState.tickAt = nebulaCfg(sim).meteor.firstMs
  },
  tick(sim, delta) {
    swallow(sim)
    nebulaMeteors(sim, delta)
  },
}

function volcanoCfg(sim: Sim): VolcanoConfig {
  return MAPS[sim.mapId].volcano!
}

/** 火山的地形由布景种子定下，视图从这里读；喷发的时刻与熔岩往哪几股漫出由对局的随机数决定 */
function volcanoOf(sim: Sim): VolcanoState {
  let s = sim.worldState.volcano
  if (!s) {
    const cfg = volcanoCfg(sim)
    const field = makeField(new Rng(sim.run.decorSeed ^ 0x7a1c), cfg, sim.mapW, sim.mapH, MAP.cameraMargin * UNIT)
    s = { field, phase: 'dormant', since: 0, nextAt: cfg.eruption.firstMs, spill: NO_SPILL, count: 0, stepAcc: 0, hurtAt: cfg.lava.tickMs }
    sim.worldState.volcano = s
  }
  return s
}

/** 山体最远伸到离火山口多远，像素 */
function mountainPx(sim: Sim): number {
  const c = volcanoCfg(sim).cone
  return c.blockU * (1 + c.blockJitter) * UNIT
}

/** 离岩壁 reach 像素以内几乎正对着岩壁走时改为顺着壁面走，免得顶在壁上不动；斜着撞上的由碰撞自己滑开 */
function alongWall(b: Basin, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (roomAt(b, x, y) > reach) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  if (dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 游荡着走到壁跟前就像撞上地图边一样折回来 */
function wanderIn(b: Basin, eid: number, dx: number, dy: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  const dot = dx * n.x + dy * n.y
  return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
}

const LAVA_TINT = 0xff6d00

/** 喷发的节奏：到点先起预兆并定下熔岩往哪几股漫出，预兆完了熔岩漫过口沿，流量先涨后落，出完回到平静 */
function tickEruption(sim: Sim, s: VolcanoState, cfg: VolcanoConfig): void {
  const e = cfg.eruption
  const now = sim.elapsedMs
  if (s.phase === 'dormant' && now >= s.nextAt) {
    s.spill = spillOf(s.field, cfg, sim.rng)
    s.phase = 'warn'
    s.since = now
    s.nextAt = now + e.intervalMs + (sim.rng.next() * 2 - 1) * e.intervalJitterMs
  } else if (s.phase === 'warn' && now >= s.since + e.warnMs) {
    s.phase = 'erupt'
    s.since = now
    s.count++
  } else if (s.phase === 'erupt' && now >= s.since + e.effuseMs) {
    s.phase = 'dormant'
    s.since = now
  }
}

/** 脚下的熔岩没凝固就挨烫：穿行、腾空的身体不沾地 */
function burnOnLava(sim: Sim, s: VolcanoState, cfg: VolcanoConfig): void {
  const now = sim.elapsedMs
  if (now < s.hurtAt) return
  s.hurtAt = now + cfg.lava.tickMs
  const frac = cfg.lava.tickMs / 1000
  const src = hazardSource('lava', LAVA_TINT)
  const onLava = (eid: number): boolean =>
    Motion.kind[eid] !== MOTION.transit && Motion.kind[eid] !== MOTION.arc && moltenAt(s.field, Transform.x[eid]!, Transform.y[eid]!)
  const dmg = Math.round(cfg.lava.teamDps * frac)
  for (const m of sim.characters) if (Alive.v[m] && onLava(m)) hit(sim, src, m, dmg, { tick: true })
  const edmg = Math.round(cfg.lava.enemyDps * frac)
  for (const eid of [...query(sim.world, ENEMY_SET)]) if (onLava(eid)) hit(sim, src, eid, edmg, { tick: true })
}

/** 刷怪点落在盆地里、离岩壁至少一格，避开熔岩 */
function clearGround(sim: Sim, p: Point): boolean {
  const f = volcanoOf(sim).field
  return roomAt(f.basin, p.x, p.y) >= UNIT && !moltenAt(f, p.x, p.y)
}

/**
 * 火山：能走的是崖壁围着的盆地，岩壁与山体是硬边界，身体走到跟前就停住、顺着壁面滑；火山定期喷发，
 * 熔岩按地势往四面八方流、离火山口越远凉得越快，盖住的地方敌我都受伤
 */
const volcano: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    return keepOut(volcanoOf(sim).field.basin, next.x, next.y, Radius.v[eid]!)
  },
  chaseDir(sim, eid, tx, ty) {
    const f = volcanoOf(sim).field
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const rad = Radius.v[eid]!
    const d = around(f, mountainPx(sim) + rad + 0.3 * UNIT, x, y, tx, ty)
    return alongWall(f.basin, x, y, d.x, d.y, rad + 0.3 * UNIT)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(volcanoOf(sim).field.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongWall(volcanoOf(sim).field.basin, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    let p = bounded.spawnPoint(sim, boss)
    for (let i = 0; i < 24 && !clearGround(sim, p); i++) p = bounded.spawnPoint(sim, boss)
    return keepOut(volcanoOf(sim).field.basin, p.x, p.y, UNIT)
  },
  settle(sim, p) {
    return keepOut(volcanoOf(sim).field.basin, p.x, p.y, SPAWN.edgeInset * UNIT)
  },
  onStart(sim) {
    volcanoOf(sim)
  },
  tick(sim, delta) {
    const cfg = volcanoCfg(sim)
    const s = volcanoOf(sim)
    tickEruption(sim, s, cfg)
    const step = cfg.lava.stepMs
    s.stepAcc = Math.min(s.stepAcc + delta, step * 4)
    while (s.stepAcc >= step) {
      s.stepAcc -= step
      const now = sim.elapsedMs - s.stepAcc
      const erupting = s.phase === 'erupt'
      stepLava(s.field, cfg.lava, step / 1000, now, erupting ? s.spill : NO_SPILL, erupting ? spillVolume(cfg, now - s.since) : 0)
    }
    burnOnLava(sim, s, cfg)
  },
}

function shipCfg(sim: Sim): ShipConfig {
  return MAPS[sim.mapId].ship!
}

/** 炮弹的位置与涌浪的相位由布景种子定下；船从正浮开始摇 */
function shipOf(sim: Sim): ShipState {
  let s = sim.worldState.ship
  if (!s) {
    s = makeShip(shipCfg(sim), sim.mapW, sim.mapH, new Rng(sim.run.decorSeed ^ 0x5b1d))
    sim.worldState.ship = s
  }
  return s
}

/** 压在甲板上的重量，千克：身体按半径的三次方与身体的质量折算；腾空、被抛着、穿行中、死了的与碎片不压甲板 */
function deckKg(sim: Sim, cfg: ShipConfig, eid: number): number {
  if (!Alive.v[eid] || hasComponent(sim.world, eid, Airborne) || hasComponent(sim.world, eid, Shard)) return 0
  const k = Motion.kind[eid]
  if (k === MOTION.arc || k === MOTION.transit) return 0
  if (hasComponent(sim.world, eid, Pickup)) return cfg.weight.pickupKg
  return cfg.weight.bodyKg * Phys.mass[eid]! * (Radius.v[eid]! / (cfg.weight.bodyRadiusU * UNIT)) ** 3
}

/** 平地上赶路的阻力，像素/秒² */
function resistPx(cfg: ShipConfig): number {
  return (cfg.gait.flatResistance * UNIT) / cfg.meterPerU
}

/**
 * 船：能走的是舷墙围着的甲板，舷墙与桅杆是硬边界。甲板上一切有重量的东西让船横摇、纵摇，海浪也推着它摇；
 * 甲板倾斜后赶路按恒定功率上坡慢、下坡快，闲着的身体与掉落物按库仑摩擦滑，炮弹按滚动摩擦滚
 */
const ship: WorldHooks = {
  ...bounded,
  /** 恒定功率下每秒花的体力不变，每格的费力是功率之比：上坡照常花、走得慢，下坡快到顶就刹着走、花得少 */
  effort(sim, _x, _y, dx, dy) {
    const len = Math.hypot(dx, dy)
    if (len === 0) return 1
    const cfg = shipCfg(sim)
    const s = shipOf(sim)
    const c = resistPx(cfg)
    const along = (s.gx * dx + s.gy * dy) / len
    return Math.max(cfg.gait.effortMin, paceOf(s.gx, s.gy, dx, dy, c, cfg.gait.downhillMax) * (1 - along / c))
  },
  contact(sim, eid, dt, x, y, vx, vy, out) {
    if (hasComponent(sim.world, eid, Shard)) return false
    const cfg = shipCfg(sim)
    const s = shipOf(sim)
    const coin = hasComponent(sim.world, eid, Pickup)
    const dx = Drive.x[eid]!
    const dy = Drive.y[eid]!
    const walking = dx !== 0 || dy !== 0
    const f = walking && !coin ? paceOf(s.gx, s.gy, dx, dy, resistPx(cfg), cfg.gait.downhillMax) : 1
    const g = sim.hooks.surface(sim, x, y)
    const k = (Phys.drag[eid]! * Phys.grip[eid]! * g.traction * g.viscosity) / Phys.mass[eid]!
    stepOnDeck(s, out, eid, Uid.v[eid]!, x, y, vx, vy, Radius.v[eid]!, dt, k, dx * f, dy * f, walking, coin ? cfg.friction.coin : cfg.friction.body)
    return true
  },
  constrainBody(sim, eid, _from, next) {
    return keepOut(shipOf(sim).deck.basin, next.x, next.y, Radius.v[eid]!)
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    return alongWall(shipOf(sim).deck.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(shipOf(sim).deck.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongWall(shipOf(sim).deck.basin, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    const b = shipOf(sim).deck.basin
    let p = bounded.spawnPoint(sim, boss)
    for (let i = 0; i < 24 && roomAt(b, p.x, p.y) < UNIT; i++) p = bounded.spawnPoint(sim, boss)
    return keepOut(b, p.x, p.y, UNIT)
  },
  settle(sim, p) {
    return keepOut(shipOf(sim).deck.basin, p.x, p.y, SPAWN.edgeInset * UNIT)
  },
  onStart(sim) {
    shipOf(sim)
  },
  /** 先称出甲板上的重量推进船的摇摆，再让炮弹顺着新的倾斜滚、被身体碰开 */
  tick(sim, delta) {
    const cfg = shipCfg(sim)
    const s = shipOf(sim)
    clearWeights(s)
    for (const eid of query(sim.world, [Phys, Transform, Radius])) {
      const kg = deckKg(sim, cfg, eid)
      if (kg > 0) addWeight(s, cfg, kg, Transform.x[eid]!, Transform.y[eid]!)
    }
    for (const b of s.balls) addWeight(s, cfg, cfg.weight.ballKg, b.x, b.y)
    const dt = Math.min(delta, 50) / 1000
    stepShip(s, cfg, dt)
    stepBalls(s, cfg, dt)
    for (const eid of query(sim.world, [Phys, Transform, Radius])) {
      if (deckKg(sim, cfg, eid) <= 0 || hasComponent(sim.world, eid, Pickup)) continue
      bumpBalls(s, cfg, Transform.x[eid]!, Transform.y[eid]!, Radius.v[eid]!, Phys.vx[eid]!, Phys.vy[eid]!)
    }
  },
}

function riverCfg(sim: Sim): RiverConfig {
  return MAPS[sim.mapId].river!
}

function riverOf(sim: Sim): RiverRect {
  return riverRect(sim.mapW, sim.mapH, riverCfg(sim).width * UNIT)
}

function flowOf(sim: Sim): Point {
  return flowVector(isHorizontal(sim.mapW, sim.mapH), riverCfg(sim).flow * UNIT)
}

const river: WorldHooks = {
  ...bounded,
  mediumVelocity(sim) {
    return flowOf(sim)
  },
  /** 按行进方向与水流夹角的余弦在逆流与顺流的倍率之间插值，横渡不变 */
  effort(sim, _x, _y, dx, dy) {
    const f = flowOf(sim)
    const len = Math.hypot(dx, dy) * Math.hypot(f.x, f.y)
    if (len === 0) return 1
    const c = (dx * f.x + dy * f.y) / len
    const cfg = riverCfg(sim)
    return c < 0 ? 1 + (cfg.upstream - 1) * -c : 1 + (cfg.downstream - 1) * c
  },
  constrainBody(sim, eid, _from, next) {
    const r = riverOf(sim)
    const rad = Radius.v[eid]!
    if (Boss.v[eid] === 1 || hasComponent(sim.world, eid, Slot)) return clampToRiver(next, r, rad)
    if (r.horizontal) return { x: next.x, y: Math.min(Math.max(next.y, r.y + rad), r.y + r.h - rad) }
    return { x: Math.min(Math.max(next.x, r.x + rad), r.x + r.w - rad), y: next.y }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside(sim, x, y) {
    return pastDownstream({ x, y }, sim.mapW, sim.mapH, riverCfg(sim).coinCullPad * UNIT)
  },
  spawnPoint(sim, boss) {
    const r = riverOf(sim)
    const pad = 0.5 * UNIT
    const pick = (): Point => ({
      x: r.x + pad + sim.rng.next() * (r.w - pad * 2),
      y: r.y + pad + sim.rng.next() * (r.h - pad * 2),
    })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      const dx = pos.x - leaderX(sim)
      const dy = pos.y - leaderY(sim)
      if (dx * dx + dy * dy >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
  settle(sim, p) {
    return clampToRiver(p, riverOf(sim), 0.5 * UNIT)
  },
  /** 漂过下游太远的敌人被冲走 */
  tick(sim) {
    const pad = riverCfg(sim).enemyCullPad * UNIT
    for (const eid of [...query(sim.world, ENEMY_SET)]) {
      if (Boss.v[eid] === 1) continue
      if (pastDownstream({ x: Transform.x[eid]!, y: Transform.y[eid]! }, sim.mapW, sim.mapH, pad)) despawnEnemy(sim, eid, false)
    }
  },
}

const torus: WorldHooks = {
  ...bounded,
  torus: true,
  worldDelta(sim, fromX, fromY, toX, toY) {
    return torusDelta({ x: fromX, y: fromY }, { x: toX, y: toY }, sim.mapW, sim.mapH)
  },
  ghosts(sim, x, y) {
    return ghostImages({ x, y }, sim.mapW, sim.mapH)
  },
  wrap(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  projectileLifeMs(sim) {
    return MAPS[sim.mapId].torus!.projectileLifeMs
  },
  constrainBody(sim, _eid, _from, next) {
    return wrapPoint(next, sim.mapW, sim.mapH)
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside() {
    return false
  },
  spawnPoint(sim, boss) {
    const pick = (): Point => ({ x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      if (torusDist2(pos, leaderPoint(sim), sim.mapW, sim.mapH) >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
  settle(sim, p) {
    return wrapPoint(p, sim.mapW, sim.mapH)
  },
}

const BY_KIND: Record<MapDef['kind'], WorldHooks> = {
  bounded,
  daynight: bounded,
  ruins: ruins,
  ice,
  river,
  void: torus,
  space,
  nebula,
  volcano,
  ship,
}

const BUILT = new Map<WorldHooks, WorldHooks>()

/** 地图的规则，叠上能力造出的地形 */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  const base = def.ice ? ice : def.walls ? ruins : BY_KIND[def.kind]!
  let hooks = BUILT.get(base)
  if (!hooks) {
    hooks = withBuilt(base)
    BUILT.set(base, hooks)
  }
  return hooks
}

