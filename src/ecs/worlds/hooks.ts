import { DEG2RAD, FRAME_U, SAFE_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { ENEMIES, SPAWN } from '../../data/enemies'
import { ENEMY_BODY } from '../../data/abilities'
import { randomMapPoint } from '../utils/spawn'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { centered, FRAME_MID } from '../frame'
import type { CaveConfig, FloeConfig, IceConfig, MapDef, MapId, NebulaConfig, NebulaOldConfig, OldRiverConfig, ShipConfig, SpaceConfig, VolcanoConfig } from '../../types/maps'
import { onFloe } from '../worlds/ice'
import { clampToDisc, confineVelocity, meteorSweep, ringPoint } from '../worlds/space'
import { gravity, holeAt, inHorizon, meteorStart, meteorTrajectory } from '../worlds/nebulaOld'
import { accrete, aroundCircle, endMeteor, feed, flyMeteor, gravityAt, inHorizon as inNebulaHorizon, keepInCavity, launchMeteor, makeNebula, pruneFlares, reachPx, settleSpot, spawnSpot, sweepContact } from '../worlds/nebula'
import type { NebulaMeteor, NebulaState } from '../worlds/nebula'
import { around, fumaroles, makeField, moltenAt, NO_SPILL, spillOf, spillVolume, stepLava, VENT_COUNT, volcanoMarks } from '../worlds/volcano'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import type { Basin } from '../worlds/basin'
import { roomFor } from '../worlds/gates'
import type { GateRuntime, Landmark } from '../worlds/gates'
import type { VolcanoState } from '../worlds/volcano'
import { GRAVITY as SHIP_G } from '../../data/ship'
import { addWeight, bumpBalls, clearWeights, makeShip, paceOf, stepBalls, stepOnDeck, stepShip } from '../worlds/ship'
import type { ShipState } from '../worlds/ship'
import { ashore, bulk, edgeAt, FALLING, fallTime, floeFor, footingOf, frictionAt, GRAVITY, gustSpan, heightAt, ICE, inWater, newFloe, seaward, slideLoose, standing, stepInWater, stepOnIce, SWIMMING, windAt, windPush } from '../worlds/floe'
import type { FloeField, FloeState } from '../worlds/floe'
import { clearPath, diffuseLux, directLux, flowDir, flowFrom, inPool, makeCaveState, outward, pushOut, rockHit, roomOf, skyAt, stepLight, stepTorch, torchesLux, torchSpot } from '../worlds/cave'
import type { CaveState, Rock } from '../worlds/cave'
import { clockSec } from '../fight/clock'
import { charSize } from '../systems/shared/scale'
import { clampToRiver, flowVector, pastDownstream, riverRect } from '../worlds/oldRiver'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from '../worlds/torus'
import type { RiverRect } from '../worlds/oldRiver'
import { isHorizontal } from '../utils/remap'
import { hasComponent, query, removeEntity } from 'bitecs'
import { Airborne, Alive, Boss, Drive, Due, ENEMY_SET, GrantCoins, Hp, Meteor, Motion, MOTION, Phasing, Phys, Pickup, PICKUP_SET, PROJ_SET, Radius, Shard, Slot, Stats, Swarmer, Tint, Transform, Uid } from '../components'
import { bodyRules, meteorHit, meteorPath } from '../store'
import { spawnMeteor } from '../entities/meteor'
import { FlowField, generateRuins, reachableCells, WallGrid } from '../worlds/oldRuins'
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
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import { ruins } from '../ruins/world'
import { phases } from '../utils/pass'
import type { Crossing, Probe } from '../utils/pass'
import type { ObstacleId } from '../../types/obstacles'
import { meadow } from '../meadow/world'
import type { MeadowState } from '../meadow/world'
import { sakura } from '../sakura/world'
import type { SakuraState } from '../sakura/world'
import { circuit } from '../circuit/world'
import type { CircuitState } from '../circuit/world'
import { desert } from '../desert/world'
import type { DesertState } from '../desert/world'
import type { RuinsState } from '../ruins/world'

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
  ruins: RuinsState | null
  nebula: NebulaState | null
  floe: FloeState | null
  cave: CaveState | null
  desert: DesertState | null
  meadow: MeadowState | null
  sakura: SakuraState | null
  circuit: CircuitState | null
  gates: GateRuntime | null
}

export function newWorldState(): WorldState {
  return { tickAt: 0, walls: null, hole: null, volcano: null, ship: null, ruins: null, nebula: null, floe: null, cave: null, desert: null, meadow: null, sakura: null, circuit: null, gates: null }
}

const NO_MARKS: Readonly<Record<string, readonly Landmark[]>> = {}

export interface WorldHooks {
  readonly torus: boolean
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  ghosts(sim: Sim, x: number, y: number): Point[]
  wrap(sim: Sim, x: number, y: number): Point
  projectileLifeMs(sim: Sim): number
  mediumVelocity(sim: Sim, x: number, y: number): Point
  /** 这里的引力加速度，像素/秒² */
  pull(sim: Sim, x: number, y: number): Point
  /** 这里是不是汇（黑洞的视界）：进了这里的身体、弹体就停下，由地图吞掉 */
  sink(sim: Sim, x: number, y: number): boolean
  surface(sim: Sim, x: number, y: number): Surface
  /** 在这里朝 (dx, dy) 赶路的费力倍率：逆着介质更累，顺着更省力 */
  effort(sim: Sim, x: number, y: number, dx: number, dy: number): number
  /** 地面自己的接触力学：接管这一步就把位置与速度写进 out 并返回 true，否则按常规积分 */
  contact(sim: Sim, eid: number, dt: number, x: number, y: number, vx: number, vy: number, out: BodyStep): boolean
  /** 任何身体的位置修正：边界、障碍、环面回绕，按身体半径 */
  constrainBody(sim: Sim, eid: number, from: Point, next: Point): Point
  /** 岩壁、舷墙这类硬边界围出的能走的地面，身体按它挡在壁外；边界不是这样定的地图没有 */
  basin(sim: Sim): Basin | null
  /** 能站的地面：出怪口沿它的外边界摆，翻进从它外面起跳；默认是 basin，冰面外是海、空腔外是软壳层这类没有硬墙的地图另给 */
  ground(sim: Sim): Basin | null
  chaseDir(sim: Sim, eid: number, tx: number, ty: number): Point
  /** 线段 a→b 上第一处探测在它里面、又要贯穿才过得去的实心（贯穿几次按 utils/pass 的 passCost）；不写就按 wallHit */
  trace?(sim: Sim, probe: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null
  /** 线段第一次碰上墙的地方：碰上的一律当作岩体挡下；写了 trace 的不看它 */
  wallHit?(sim: Sim, ax: number, ay: number, bx: number, by: number): Point | null
  /** 破坏力打在 (x, y) 离地 z 米处、半径 r 像素的范围里，按材质的强度折算能打掉多少，返回实际用掉的；不写就什么也打不坏 */
  breach?(sim: Sim, x: number, y: number, z: number, r: number, amount: number): number
  /** 弹体或出手撞上了障碍：给画面崩点碎屑 */
  impact?(sim: Sim, x: number, y: number, material: ObstacleId): void
  /** 引擎不调用：破坏一律走 breach */
  smashWall?(sim: Sim, x: number, y: number): void
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  fleeDir(sim: Sim, eid: number, awayX: number, awayY: number): Point
  /** 飞行物出了这里就消失 */
  outside(sim: Sim, x: number, y: number): boolean
  spawnPoint(sim: Sim, boss: boolean): Point
  /** 地图的中心：据点与定点刷怪从这里起算 */
  center(sim: Sim): Point
  /** 把一个点收进敌人能站、能走到队伍的范围 */
  settle(sim: Sim, p: Point): Point
  /** 半径 radius 像素的一只敌人此刻能不能落在这里：站得下、脚下没有要命的东西；只有出怪口挑落点时用 */
  canSpawn(sim: Sim, x: number, y: number, radius: number): boolean
  /** 地图自己的地标，按组：出怪口里摆在同名地标上的从这里取；一组要么整组都在、要么整组都空（火山口只在喷发时有），组里的次序不变 */
  landmarks(sim: Sim): Readonly<Record<string, readonly Landmark[]>>
  /** 此刻怪更多从哪一侧来：方向是那一侧朝外的方向，长度按这张图自己的单位（船是倾角的度数，浮冰是风速）；不偏为零 */
  lean(sim: Sim): Point
  /** 队员在队长 from 身后的坑位 at 落在会伤人的地方时挪开；不写就不挪 */
  seat?(sim: Sim, from: Point, at: Point): Point
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
  sink() {
    return false
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
  basin() {
    return null
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
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
  ground(sim) {
    return sim.hooks.basin(sim)
  },
  canSpawn() {
    return true
  },
  landmarks() {
    return NO_MARKS
  },
  lean() {
    return ZERO
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

const oldRuins: WorldHooks = {
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
    if (!w || phases(sim.world, eid, 'wall')) return box
    return w.grid.separateCircle(box.x, box.y, Math.min(Radius.v[eid]!, MAPS[sim.mapId].walls!.bodyRadiusCapU * UNIT))
  },
  chaseDir(sim, eid, tx, ty) {
    const w = sim.worldState.walls
    if (!w || phases(sim.world, eid, 'wall')) return bounded.chaseDir(sim, eid, tx, ty)
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
  trace(sim, _probe, ax, ay, bx, by) {
    const hit = sim.worldState.walls?.grid.segmentHit(ax, ay, bx, by)
    if (!hit) return null
    const len = Math.hypot(bx - ax, by - ay)
    const t = len > 0 ? Math.hypot(hit.x - ax, hit.y - ay) / len : 0
    return { t0: t, t1: t, material: 'wall' }
  },
  /** 破坏力碰上的墙格整格碎掉，不论多少 */
  breach(sim, x, y, _z, r) {
    const w = sim.worldState.walls
    if (!w) return 0
    const g = w.grid
    const half = g.cellPx / 2
    for (let cy = g.cellY(y - r); cy <= g.cellY(y + r); cy++) {
      for (let cx = g.cellX(x - r); cx <= g.cellX(x + r); cx++) {
        if (!g.isBlockedCell(cx, cy) || Math.hypot((cx + 0.5) * g.cellPx - x, (cy + 0.5) * g.cellPx - y) > r + half) continue
        g.setBlocked(cx, cy, false)
        w.smashed.push(cy * g.cols + cx)
        w.flowCellX = -1
      }
    }
    return 0
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

function nebulaOldCfg(sim: Sim): NebulaOldConfig {
  return MAPS[sim.mapId].nebulaOld!
}

/** 空腔的边：壳层从这里开始 */
function nebulaOldWall(sim: Sim): number {
  return nebulaOldCfg(sim).shell.innerU * UNIT
}

/** 黑洞的位置由布景种子定下，视图从这里读 */
function holeOf(sim: Sim): Point {
  if (!sim.worldState.hole) sim.worldState.hole = holeAt(new Rng(sim.run.decorSeed ^ 0x6e62), nebulaOldCfg(sim))
  return sim.worldState.hole
}

const HOLE_TINT = 0x7c4dff
const METEOR_TINT = 0xffaa33

/** 中心进了视界的都被吞噬：角色倒下，敌人与召唤出的身体死去，掉落物、蜜蜂、弹体消失；穿行中没有实体，不吞 */
function swallow(sim: Sim): void {
  const cfg = nebulaOldCfg(sim)
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
function launchNebulaOldMeteor(sim: Sim): void {
  const cfg = nebulaOldCfg(sim)
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
function nebulaOldMeteorStrike(sim: Sim, m: number, x: number, y: number, speed: number): void {
  const mc = nebulaOldCfg(sim).meteor
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

/** 旧星云的流星：预警后沿积分好的轨迹飞，轨迹走完（扎回壳层或掉进视界）就消失 */
function nebulaOldMeteors(sim: Sim, delta: number): void {
  const mc = nebulaOldCfg(sim).meteor
  const now = sim.elapsedMs
  const m = query(sim.world, [Meteor])[0]
  if (m === undefined) {
    if (now >= sim.worldState.tickAt) launchNebulaOldMeteor(sim)
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
  nebulaOldMeteorStrike(sim, m, x, y, Math.hypot(dx, dy) / (mc.stepMs / 1000))
}

/** 旧星云：圆心在原点的空心星云，黑洞与壳层的万有引力作用于一切；没有墙，走进壳层的都被它的引力拉回空腔 */
const nebulaOld: WorldHooks = {
  ...bounded,
  pull(sim, x, y) {
    return gravity(holeOf(sim), nebulaOldCfg(sim), x, y)
  },
  constrainBody(_sim, _eid, _from, next) {
    return next
  },
  wanderDir(sim, eid, dx, dy) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = Math.hypot(x, y)
    if (d < nebulaOldWall(sim) - 0.6 * UNIT || x * dx + y * dy <= 0) return { x: dx, y: dy }
    const dot = (dx * x + dy * y) / d
    return { x: dx - (2 * dot * x) / d, y: dy - (2 * dot * y) / d }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  outside(sim, x, y) {
    return Math.hypot(x, y) > nebulaOldCfg(sim).shell.outerU * UNIT
  },
  spawnPoint(sim, boss) {
    const hole = holeOf(sim)
    const clear2 = (nebulaOldCfg(sim).hole.clearU * UNIT) ** 2
    const near2 = (SPAWN.minPlayerDist * UNIT * (boss ? 2 : 1)) ** 2
    const inner = nebulaOldWall(sim) - UNIT
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
    const clear = nebulaOldCfg(sim).hole.clearU * UNIT
    const dx = p.x - hole.x
    const dy = p.y - hole.y
    const d = Math.hypot(dx, dy)
    const q = d >= clear ? p : d < 1e-6 ? { x: hole.x + clear, y: hole.y } : { x: hole.x + (dx / d) * clear, y: hole.y + (dy / d) * clear }
    return clampToDisc(q.x, q.y, 0, 0, nebulaOldWall(sim) - UNIT)
  },
  onStart(sim) {
    holeOf(sim)
    sim.worldState.tickAt = nebulaOldCfg(sim).meteor.firstMs
  },
  tick(sim, delta) {
    swallow(sim)
    nebulaOldMeteors(sim, delta)
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
    const size = MAPS[sim.mapId].size!
    const field = makeField(new Rng(sim.run.decorSeed ^ 0x7a1c), cfg, centered(size.w, size.h), FRAME_MID)
    const vents = fumaroles(field, cfg, VENT_COUNT)
    s = { field, vents, marks: volcanoMarks(field, cfg, vents), phase: 'dormant', since: 0, nextAt: cfg.eruption.firstMs, spill: NO_SPILL, count: 0, stepAcc: 0, hurtAt: cfg.lava.tickMs }
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
  basin(sim) {
    return volcanoOf(sim).field.basin
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
  canSpawn(sim, x, y, radius) {
    const f = volcanoOf(sim).field
    return roomFor(f.basin, x, y, radius) && !moltenAt(f, x, y)
  },
  /** 火山口只在喷发时抛出东西 */
  landmarks(sim) {
    const s = volcanoOf(sim)
    return s.phase === 'erupt' ? s.marks.erupt : s.marks.calm
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
  basin(sim) {
    return shipOf(sim).deck.basin
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
  canSpawn(sim, x, y, radius) {
    return roomFor(shipOf(sim).deck.basin, x, y, radius)
  },
  landmarks(sim) {
    return shipOf(sim).deck.marks
  },
  /** 往低的一舷偏，偏多少按倾角的度数：低的一侧干舷离水面近，登船的多 */
  lean(sim) {
    const s = shipOf(sim)
    const along = Math.hypot(s.gx, s.gy)
    if (along === 0) return ZERO
    const deg = Math.asin(Math.min(1, along / ((SHIP_G * UNIT) / shipCfg(sim).meterPerU))) / DEG2RAD
    return { x: (s.gx / along) * deg, y: (s.gy / along) * deg }
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

function nebulaCfg(sim: Sim): NebulaConfig {
  return MAPS[sim.mapId].nebula!
}

/** 星云的摆法由布景种子定下，视图开战前就按它摆镜头；黑洞的质量与流星由对局推进 */
function nebulaOf(sim: Sim): NebulaState {
  let s = sim.worldState.nebula
  if (!s) {
    s = makeNebula(nebulaCfg(sim), sim.run.decorSeed, FRAME_MID)
    sim.worldState.nebula = s
  }
  return s
}

/** 敌人的身体都一样：终端漂移按质量/阻力 */
const FOE_FALL = ENEMY_BODY.mass / ENEMY_BODY.drag
const SLOWEST = new Map<MapId, number>()

/** 这张图会刷出来的敌人里最慢的能走多快，格/秒 */
function slowestFoeU(sim: Sim): number {
  let v = SLOWEST.get(sim.mapId)
  if (v === undefined) {
    const def = MAPS[sim.mapId]
    v = Math.min(...def.mix.map((r) => ENEMIES[r.kind].speed), ENEMIES[def.boss].speed)
    SLOWEST.set(sim.mapId, v)
  }
  return v
}

/** 刷怪点离黑洞至少多远，像素：这张图最慢的敌人此刻走不出来的半径，再加余量 */
function nebulaClearPx(sim: Sim): number {
  return reachPx(nebulaOf(sim), FOE_FALL, slowestFoeU(sim)) + nebulaCfg(sim).spawnClearU * UNIT
}

const ACCRETION_TINT = 0xffb36b
const METEOR_GLOW_TINT = 0xff8a3d
/** 流星撞碎后这么久里碎块还会被甩进空腔，毫秒；碎块从内壁往里这么远处甩出，格 */
const SHARDS_MS = 3000
const SHARDS_IN_U = 0.5

/** 吞下的身体折成多少 GM：按质量与半径的三次方 */
function bodyGm(cfg: NebulaConfig, eid: number): number {
  return cfg.swallow.bodyGm * Phys.mass[eid]! * (Radius.v[eid]! / (cfg.swallow.bodyRadiusU * UNIT)) ** 3
}

/** 不在活动的平面上：穿行中没有实体，跳起来的在空中 */
function offPlane(eid: number): boolean {
  return inTransit(eid) || Motion.kind[eid] === MOTION.arc
}

/** 中心进了视界的都被吞掉：角色倒下，敌人死去，掉落物、蜜蜂、碎片与弹体消失；吞下的质量让黑洞长大，放出的光能化作一阵闪耀 */
function swallowNebula(sim: Sim, s: NebulaState, cfg: NebulaConfig): void {
  const now = sim.elapsedMs
  const src = hazardSource('blackhole', ACCRETION_TINT)
  const st = sim.run.stats
  const inside = (eid: number): boolean => inNebulaHorizon(s, Transform.x[eid]!, Transform.y[eid]!)
  for (const m of sim.characters) {
    if (!Alive.v[m] || offPlane(m) || !inside(m)) continue
    const slot = Slot.v[m]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + Hp.v[m]!
    st.hazardDamage.blackhole = (st.hazardDamage.blackhole ?? 0) + Hp.v[m]!
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const gm = bodyGm(cfg, m)
    die(sim, m, src, 0, 0)
    feed(s, cfg, gm, now, x, y)
  }
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (!Alive.v[eid] || offPlane(eid) || !inside(eid)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const gm = bodyGm(cfg, eid)
    die(sim, eid, src, 0, 0)
    feed(s, cfg, gm, now, x, y)
  }
  for (const eid of [...query(sim.world, PICKUP_SET)]) {
    if (!inside(eid)) continue
    feed(s, cfg, cfg.swallow.pickupGm, now, Transform.x[eid]!, Transform.y[eid]!)
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Swarmer, Transform])]) {
    if (!inside(eid)) continue
    feed(s, cfg, bodyGm(cfg, eid), now, Transform.x[eid]!, Transform.y[eid]!)
    bodyRules[eid] = undefined
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Shard, Transform])]) {
    if (inside(eid)) removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    if (!inside(eid)) continue
    feed(s, cfg, cfg.swallow.shotGm, now, Transform.x[eid]!, Transform.y[eid]!)
    cullProjectile(sim, eid)
  }
}

/**
 * 流星撞上身体：两者按完全非弹性碰撞交换动量，身体沿碰上那一刻的法线被撞开；
 * 伤害按碰撞损耗的动能，随法向相对速度的平方变，正面以 speedU 撞上时是 damage
 */
function strikeNebula(sim: Sim, cfg: NebulaConfig, m: NebulaMeteor, x0: number, y0: number): void {
  const mc = cfg.meteor
  const src = hazardSource('meteor', METEOR_GLOW_TINT)
  const meteorMass = mc.gm / cfg.swallow.bodyGm
  const ref = mc.speedU * UNIT
  const strike = (eid: number): void => {
    if (m.hit.has(Uid.v[eid]!) || offPlane(eid)) return
    const n = sweepContact(x0, y0, m.x, m.y, Transform.x[eid]!, Transform.y[eid]!, mc.radiusU * UNIT + Radius.v[eid]!)
    if (!n) return
    m.hit.add(Uid.v[eid]!)
    const vn = Math.max(0, (m.vx - Phys.vx[eid]!) * n.x + (m.vy - Phys.vy[eid]!) * n.y)
    const mass = Phys.mass[eid]!
    const j = ((meteorMass * mass) / (meteorMass + mass)) * vn
    hit(sim, src, eid, mc.damage * (vn / ref) ** 2, { tick: true, knockback: j, from: { x: Transform.x[eid]! - n.x, y: Transform.y[eid]! - n.y } })
  }
  for (const c of sim.characters) if (Alive.v[c]) strike(c)
  for (const eid of [...query(sim.world, ENEMY_SET)]) if (Alive.v[eid]) strike(eid)
}

/** 流星：到点在内壁上起预兆，预兆完冲进空腔，只受引力；扎进壳层被撕碎、掉进视界被吞掉、飞到时限散掉，之后隔一阵再来 */
function nebulaMeteors(sim: Sim, s: NebulaState, cfg: NebulaConfig, delta: number): void {
  const mc = cfg.meteor
  const now = sim.elapsedMs
  const m = s.meteor
  if (!m) {
    if (now >= s.meteorAt) s.meteor = launchMeteor(s, cfg, sim.rng, leaderX(sim), leaderY(sim), now)
    return
  }
  if (m.phase === 'warn') {
    if (now < m.since + mc.warnMs) return
    m.phase = 'fly'
    m.since = now
  }
  const x0 = m.x
  const y0 = m.y
  const end = flyMeteor(s, cfg, m, delta / 1000)
  strikeNebula(sim, cfg, m, x0, y0)
  if (!end && now - m.since < mc.maxFlightMs) return
  if (end === 'swallow') feed(s, cfg, mc.gm, now, m.x, m.y)
  if (end === 'shatter') s.shatter = { x: m.x, y: m.y, at: now }
  endMeteor(s, { kind: end ?? 'fade', x: m.x, y: m.y, vx: m.vx, vy: m.vy, at: now })
  s.meteor = null
  s.meteorAt = now + mc.intervalMs + (sim.rng.next() * 2 - 1) * mc.intervalJitterMs
}

/**
 * 星云：一团空心星云的空腔，没有墙。黑洞（Paczyński–Wiita 势）与壳层（牛顿壳层定理）的万有引力作用于一切，走进壳层的都被拉回空腔；
 * 中心进了视界的被吞掉，黑洞随吞下的质量长大；壳层不时甩出流星横穿空腔。敌人只顾着追人，头目会绕开自己走不出来的那一圈
 */
const nebula: WorldHooks = {
  ...bounded,
  pull(sim, x, y) {
    return gravityAt(nebulaOf(sim), nebulaCfg(sim), x, y)
  },
  sink(sim, x, y) {
    return inNebulaHorizon(nebulaOf(sim), x, y)
  },
  /** 壳层平时就把人拉回来；被击退、冲刺或瞬移甩出去的也停在安全区的内切圆里 */
  constrainBody(sim, eid, _from, next) {
    const L = nebulaOf(sim).layout
    return clampToDisc(next.x, next.y, L.cx, L.cy, (FRAME_U / 2 - SAFE_U) * UNIT - Radius.v[eid]!)
  },
  chaseDir(sim, eid, tx, ty) {
    if (Boss.v[eid] !== 1) return bounded.chaseDir(sim, eid, tx, ty)
    const s = nebulaOf(sim)
    const r = reachPx(s, Phys.mass[eid]! / Phys.drag[eid]!, Stats.moveSpeed[eid]!) + UNIT
    return aroundCircle(Transform.x[eid]!, Transform.y[eid]!, tx, ty, s.layout.hx, s.layout.hy, r)
  },
  wanderDir(sim, eid, dx, dy) {
    return keepInCavity(nebulaOf(sim), nebulaCfg(sim), Transform.x[eid]!, Transform.y[eid]!, dx, dy, Radius.v[eid]! + 0.6 * UNIT)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return keepInCavity(nebulaOf(sim), nebulaCfg(sim), Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    return spawnSpot(nebulaOf(sim), nebulaCfg(sim), () => sim.rng.next(), nebulaClearPx(sim), (boss ? 2 : SPAWN.edgeInset) * UNIT, leaderX(sim), leaderY(sim), near)
  },
  center(sim) {
    const L = nebulaOf(sim).layout
    return { x: L.cx, y: L.cy }
  },
  settle(sim, p) {
    return settleSpot(nebulaOf(sim), nebulaCfg(sim), p.x, p.y, nebulaClearPx(sim), SPAWN.edgeInset * UNIT)
  },
  ground(sim) {
    return nebulaOf(sim).cavity
  },
  /** 和刷怪点一样：在空腔里离内壁留得出身体，离黑洞在最慢的敌人走得出来的地方 */
  canSpawn(sim, x, y, radius) {
    const s = nebulaOf(sim)
    return roomFor(s.cavity, x, y, radius) && Math.hypot(x - s.layout.hx, y - s.layout.hy) >= nebulaClearPx(sim)
  },
  /**
   * hole 是黑洞；meteor 是刚撞碎在壳层上的流星，碎块从那里的内壁甩进来，撞碎后一阵就没了；
   * horizon 是黑洞朝着队长那一侧、最慢的敌人刚好走得出来的地方，朝着队长
   */
  landmarks(sim) {
    const s = nebulaOf(sim)
    const L = s.layout
    const sh = s.shatter
    const meteor: Landmark[] = []
    if (sh && sim.elapsedMs - sh.at <= SHARDS_MS) {
      const ox = sh.x - L.cx
      const oy = sh.y - L.cy
      const d = Math.hypot(ox, oy) || 1
      const r = (nebulaCfg(sim).shell.innerU - SHARDS_IN_U) * UNIT
      meteor.push({ x: L.cx + (ox / d) * r, y: L.cy + (oy / d) * r, r: 0, nx: -ox / d, ny: -oy / d })
    }
    const lx = leaderX(sim) - L.hx
    const ly = leaderY(sim) - L.hy
    const away = Math.hypot(lx, ly) > 1e-6 ? norm(lx, ly) : norm(L.cx - L.hx, L.cy - L.hy)
    const clear = nebulaClearPx(sim)
    return {
      hole: [{ x: L.hx, y: L.hy, r: 0, nx: 0, ny: 0 }],
      meteor,
      horizon: [{ x: L.hx + away.x * clear, y: L.hy + away.y * clear, r: 0, nx: away.x, ny: away.y }],
    }
  },
  onStart(sim) {
    nebulaOf(sim)
  },
  tick(sim, delta) {
    const cfg = nebulaCfg(sim)
    const s = nebulaOf(sim)
    accrete(s, cfg, delta / 1000)
    swallowNebula(sim, s, cfg)
    nebulaMeteors(sim, s, cfg, delta)
    pruneFlares(s, cfg, sim.elapsedMs)
  },
}

function floeCfg(sim: Sim): FloeConfig {
  return MAPS[sim.mapId].floe!
}

/** 浮冰的形状由布景种子定下，视图从这里读；阵风哪一刻来、偏多少由对局的随机数定 */
function floeOf(sim: Sim): FloeState {
  let s = sim.worldState.floe
  if (!s) {
    const cfg = floeCfg(sim)
    s = newFloe(floeFor(sim.run.decorSeed, cfg), cfg)
    sim.worldState.floe = s
  }
  return s
}

const WATER_TINT = 0x4fc3f7
/** 冰上的路多久按队长的位置重铺一次，毫秒 */
const PATH_MS = 250
/** 直线走过去时，沿途离冰缘至少留多远，格；目标本身离冰缘更近就按目标的算 */
const LINE_CLEAR_U = 0.35
/** 离目标这么近（格）就直扑过去：冰缘边上的目标也够得着，扑过头就滑进海里 */
const LUNGE_U = 1.5
/** 漂在水上的小东西随海流漂：速度朝海流靠拢的速率，每秒 */
const FLOAT_K = 2
/** 此刻的风推得动的身体落在离冰缘再远这么多的地方，格：免得一落地就被吹下海 */
const BLOWN_U = 1

/** 离冰缘 reach 格以内还朝着海走，就改为顺着冰缘走；正对着海时转向一侧 */
function alongEdge(f: FloeField, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (edgeAt(f, x, y) > reach) return { x: dx, y: dy }
  const n = seaward(f, x, y)
  const out = dx * n.x + dy * n.y
  if (out <= 0) return { x: dx, y: dy }
  const tx = dx - out * n.x
  const ty = dy - out * n.y
  const l = Math.hypot(tx, ty)
  return l > 1e-3 ? { x: tx / l, y: ty / l } : { x: -n.y, y: n.x }
}

/** 两点之间的直线一路都在冰上、离冰缘留得出 clear 格 */
function clearLine(f: FloeField, x: number, y: number, tx: number, ty: number, clear: number): boolean {
  const n = Math.ceil(Math.hypot(tx - x, ty - y) / (0.5 * UNIT))
  for (let k = 1; k <= n; k++) if (edgeAt(f, x + ((tx - x) * k) / n, y + ((ty - y) * k) / n) < clear) return false
  return true
}

/** 在冰上从 (x, y) 去 (tx, ty)：贴近了直扑；看得到就直走；隔着水就顺着冰上的路绕（路通往队长那里），否则贴着冰缘走 */
function walkTo(s: FloeState, x: number, y: number, tx: number, ty: number, reach: number): Point {
  const f = s.field
  const d = norm(tx - x, ty - y)
  if (Math.hypot(tx - x, ty - y) < LUNGE_U * UNIT) return d
  if (clearLine(f, x, y, tx, ty, Math.min(LINE_CLEAR_U, edgeAt(f, tx, ty)))) return alongEdge(f, x, y, d.x, d.y, reach)
  const src = s.paths.source
  if (src >= 0) {
    const c = s.paths.center(src)
    if (Math.hypot(c.x - tx, c.y - ty) < 3 * UNIT) {
      const down = s.paths.downhill(x, y)
      if (down) return down
    }
  }
  return alongEdge(f, x, y, d.x, d.y, reach)
}

/** 阵风：到点就起下一轮，风向偏一点；一轮没落尽不起新的 */
function tickGust(sim: Sim, s: FloeState, cfg: FloeConfig): void {
  const w = cfg.wind
  const now = sim.elapsedMs
  if (now < s.nextGust) return
  s.gust = { at: now, veer: (sim.rng.next() * 2 - 1) * w.veerDeg * (Math.PI / 180) }
  s.nextGust = now + Math.max(gustSpan(w), w.intervalMs + (sim.rng.next() * 2 - 1) * w.jitterMs)
}

/** 泡在冰水里的按体温往下掉血：冻僵的时长与体型成正比（散热按表面积、热容按体积），满血的标准身体 freezeSec 秒冻死 */
function chill(sim: Sim, s: FloeState, cfg: FloeConfig): void {
  const now = sim.elapsedMs
  if (now < s.hurtAt) return
  s.hurtAt = now + cfg.coldTickMs
  const src = hazardSource('coldWater', WATER_TINT)
  const frac = cfg.coldTickMs / 1000
  const freeze = (eid: number): void => {
    if (!Alive.v[eid] || inTransit(eid) || !inWater(s, eid, Uid.v[eid]!)) return
    const t = cfg.body.freezeSec * bulk(cfg, Radius.v[eid]!, Phys.mass[eid]!)
    hit(sim, src, eid, Math.max(1, Math.round((Hp.max[eid]! * frac) / t)), { tick: true })
  }
  for (const m of sim.characters) freeze(m)
  for (const eid of [...query(sim.world, ENEMY_SET)]) freeze(eid)
}

/** 掉进海里的金币沉下去；别的掉落物浮着，随海流漂 */
function sinkCoins(sim: Sim, s: FloeState): void {
  for (const eid of [...query(sim.world, [Pickup, GrantCoins, Transform])]) {
    if (!inWater(s, eid, Uid.v[eid]!)) continue
    s.splashes.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, r: Radius.v[eid]!, at: sim.elapsedMs, sink: true })
    removeEntity(sim.world, eid)
  }
}

/** 冰上的路按队长的位置重铺：队长在水里就通往离他最近的冰 */
function tickPaths(sim: Sim, s: FloeState): void {
  if (sim.elapsedMs < s.pathAt) return
  s.pathAt = sim.elapsedMs + PATH_MS
  const c = s.paths.nearest(leaderX(sim), leaderY(sim))
  if (c !== s.paths.source) s.paths.build(c)
}

/** 复活落座、跳跃这类脚本位移不走 contact：被它从水里带上冰的，脚下改回冰上 */
function landed(s: FloeState, cfg: FloeConfig): void {
  for (const [eid, foot] of s.feet) {
    if (foot.mode !== SWIMMING || Uid.v[eid] !== foot.uid) continue
    if (edgeAt(s.field, Transform.x[eid]!, Transform.y[eid]!) * UNIT < Radius.v[eid]! * cfg.body.climbFrac) continue
    foot.mode = ICE
    foot.slip = true
  }
}

/**
 * 浮冰：南极海上一块没有边的浮冰。冰上一切按库仑摩擦走、滑、停，摩擦随积雪、老冰、新冰变，阵风按风压推着身体；
 * 重心探出冰缘就掉进海里，水里按二次阻力与推力游、随海流漂，游到冰缘爬上来；泡在冰水里的按体型冻得掉血，金币沉底
 */
const floe: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    if (edgeAt(floeOf(sim).field, x, y) >= 0) return groundOf(sim)
    const cfg = floeCfg(sim)
    return { ...GROUND, exertion: cfg.waterExertion, regen: cfg.waterRegen }
  },
  /**
   * 一步：站在冰上的按摩擦与风走；重心撑不住就从冰缘往下掉，掉的这一下不受摩擦；落进水里按阻力与推力游，重心爬过冰缘一截就上了冰。
   * 自己发动的冲刺、跳跃由能力推着走、也由能力刹住，收尾时还回冲之前的速度；被打飞、被扔出去的照样带着速度滑
   */
  contact(sim, eid, dt, x, y, vx, vy, out) {
    if (hasComponent(sim.world, eid, Phasing)) return false
    const cfg = floeCfg(sim)
    const s = floeOf(sim)
    const f = s.field
    const foot = footingOf(s, eid, Uid.v[eid]!)
    if (foot.at >= 0 && hasComponent(sim.world, eid, Motion) && Motion.self[eid] === 1 && Motion.stamp[eid]! >= foot.at) {
      vx = foot.vx
      vy = foot.vy
    }
    const g = (GRAVITY / cfg.meterPerU) * UNIT
    const r = Radius.v[eid]!
    const footR = r * cfg.body.footFrac
    const pickup = hasComponent(sim.world, eid, Pickup)
    const loose = pickup || hasComponent(sim.world, eid, Shard)
    const dx = Drive.x[eid]!
    const dy = Drive.y[eid]!
    const pulled = pickup && (dx !== 0 || dy !== 0)
    const k = (Phys.drag[eid]! * Phys.grip[eid]!) / Phys.mass[eid]!
    if (foot.mode === ICE && !standing(f, x, y, footR)) {
      foot.mode = FALLING
      foot.fall = 0
      foot.drop = foot.h
    }
    if (foot.mode === FALLING) {
      out.x = x + vx * dt
      out.y = y + vy * dt
      out.vx = vx
      out.vy = vy
      foot.fall += dt
      if (standing(f, out.x, out.y, footR)) foot.mode = ICE
      else if (foot.fall >= fallTime(foot.drop)) {
        foot.mode = SWIMMING
        if (!loose) s.splashes.push({ x: out.x, y: out.y, r, at: sim.elapsedMs, sink: false })
      }
    } else if (foot.mode === SWIMMING) {
      if (pulled) approach(out, x, y, vx, vy, dx, dy, k, dt)
      else if (loose) approach(out, x, y, vx, vy, s.current.x, s.current.y, FLOAT_K, dt)
      else {
        const len = cfg.body.dragU * UNIT * bulk(cfg, r, Phys.mass[eid]!)
        const sp = Math.hypot(dx, dy)
        const swim = sp * cfg.body.swimRatio
        stepInWater(out, x, y, vx, vy, sp > 0 ? dx / sp : 0, sp > 0 ? dy / sp : 0, (swim * swim) / len, len, s.current.x, s.current.y, dt)
      }
      if (edgeAt(f, out.x, out.y) * UNIT >= r * cfg.body.climbFrac) {
        foot.mode = ICE
        foot.slip = true
      }
    } else {
      const t = sim.hooks.surface(sim, x, y).traction
      if (pulled) approach(out, x, y, vx, vy, dx, dy, k, dt)
      else if (loose) slideLoose(out, x, y, vx, vy, cfg.friction.loose * t, g, dt)
      else {
        const mu = frictionAt(f, cfg, x, y)
        const w = windAt(f, cfg, s.gust, sim.elapsedMs)
        const push = windPush(cfg, w.speed, w.angle, vx, vy, bulk(cfg, r, Phys.mass[eid]!))
        stepOnIce(out, foot, x, y, vx, vy, dx, dy, k, mu.s * t, mu.k * t, g, push.x, push.y, dt)
      }
      foot.h = heightAt(f, out.x, out.y)
    }
    foot.at = Math.fround(sim.elapsedMs)
    foot.vx = out.vx
    foot.vy = out.vy
    return true
  },
  constrainBody(_sim, _eid, _from, next) {
    return next
  },
  chaseDir(sim, eid, tx, ty) {
    const s = floeOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (inWater(s, eid, Uid.v[eid]!) || hasComponent(sim.world, eid, Phasing)) return norm(tx - x, ty - y)
    const reach = Radius.v[eid]! / UNIT + 0.6
    if (edgeAt(s.field, tx, ty) >= 0) return walkTo(s, x, y, tx, ty, reach)
    // 目标在水里：不跟着跳下去，走到离它最近的冰上守着
    const c = s.paths.nearest(tx, ty)
    if (c < 0) return { x: 0, y: 0 }
    const p = s.paths.center(c)
    if (Math.hypot(p.x - x, p.y - y) < 0.5 * UNIT) return { x: 0, y: 0 }
    return walkTo(s, x, y, p.x, p.y, reach)
  },
  wanderDir(sim, eid, dx, dy) {
    const f = floeOf(sim).field
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (edgeAt(f, x, y) > Radius.v[eid]! / UNIT + 1.2) return { x: dx, y: dy }
    const n = seaward(f, x, y)
    const dot = dx * n.x + dy * n.y
    return dot <= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongEdge(floeOf(sim).field, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! / UNIT + 1.5)
  },
  outside(sim, x, y) {
    const m = 4 * UNIT
    return x < -m || x > sim.mapW + m || y < -m || y > sim.mapH + m
  },
  spawnPoint(sim, boss) {
    const f = floeOf(sim).field
    const min = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const inset = boss ? 3 : 1.5
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    let p: Point = f.heart
    for (let i = 0; i < 48; i++) {
      const q = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (edgeAt(f, q.x, q.y) < inset) continue
      p = q
      if (Math.hypot(q.x - lx, q.y - ly) >= min) break
    }
    return p
  },
  center(sim) {
    return floeOf(sim).field.heart
  },
  settle(sim, p) {
    return ashore(floeOf(sim).field, p.x, p.y, SPAWN.edgeInset)
  },
  ground(sim) {
    return floeOf(sim).ground
  },
  /** 落在冰上离冰缘留得出身体；此刻的风推得动它的地方（光冰、新冰）离冰缘再多留一截 */
  canSpawn(sim, x, y, radius) {
    const s = floeOf(sim)
    if (!roomFor(s.ground, x, y, radius)) return false
    const cfg = floeCfg(sim)
    const w = windAt(s.field, cfg, s.gust, sim.elapsedMs)
    const push = windPush(cfg, w.speed, w.angle, 0, 0, bulk(cfg, radius, ENEMY_BODY.mass))
    const hold = frictionAt(s.field, cfg, x, y).s * (GRAVITY / cfg.meterPerU) * UNIT
    return Math.hypot(push.x, push.y) <= hold || roomFor(s.ground, x, y, radius + BLOWN_U * UNIT)
  },
  landmarks(sim) {
    return floeOf(sim).marks
  },
  /** 往上风偏，偏多少按此刻的风速（米/秒）：风从哪边来，从哪边冰缘爬上来的就多 */
  lean(sim) {
    const s = floeOf(sim)
    const w = windAt(s.field, floeCfg(sim), s.gust, sim.elapsedMs)
    return { x: -Math.cos(w.angle) * w.speed, y: -Math.sin(w.angle) * w.speed }
  },
  onStart(sim) {
    floeOf(sim)
  },
  tick(sim) {
    const cfg = floeCfg(sim)
    const s = floeOf(sim)
    tickGust(sim, s, cfg)
    tickPaths(sim, s)
    landed(s, cfg)
    chill(sim, s, cfg)
    sinkCoins(sim, s)
    if (s.splashes.length > 64) s.splashes.splice(0, s.splashes.length - 64)
  },
}

function caveCfg(sim: Sim): CaveConfig {
  return MAPS[sim.mapId].cave!
}

/** 溶洞的地形与这一局的月龄由布景种子定下，视图从这里读；光照按难度时钟走，同一局里接着上一场的钟点 */
function caveOf(sim: Sim): CaveState {
  let s = sim.worldState.cave
  if (!s) {
    const size = MAPS[sim.mapId].size!
    s = makeCaveState(caveCfg(sim), centered(size.w, size.h), new Rng(sim.run.decorSeed ^ 0x3c4e), clockSec(sim))
    sim.worldState.cave = s
  }
  return s
}

/** 重算洞里的光、重算绕路的间隔，毫秒 */
const CAVE_LIGHT_MS = 200
const CAVE_FLOW_MS = 250

const WADES = new Map<MapId, Surface>()

/** 水潭里的地面：黏滞与费力来自地图，回复同平地 */
function wadeOf(sim: Sim): Surface {
  let w = WADES.get(sim.mapId)
  if (!w) {
    const p = caveCfg(sim).pools
    w = { ...groundOf(sim), viscosity: p.viscosity, exertion: p.exertion }
    WADES.set(sim.mapId, w)
  }
  return w
}

/** 离岩石 reach 以内、方向扎进岩石时改成顺着壁面走，免得顶在石头上不动 */
function glide(r: Rock, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (roomOf(r, x, y) > reach) return { x: dx, y: dy }
  const n = outward(r, x, y)
  const dot = dx * n.x + dy * n.y
  if (dot >= -0.2) return { x: dx, y: dy }
  const tx = dx - dot * n.x
  const ty = dy - dot * n.y
  const len = Math.hypot(tx, ty)
  return len > 1e-6 ? { x: tx / len, y: ty / len } : { x: -n.y, y: n.x }
}

/** 队员的火把此刻在哪、多亮 */
function caveTorches(sim: Sim, s: CaveState): { spots: Point[]; lits: number[] } {
  const spots: Point[] = []
  const lits: number[] = []
  for (const m of sim.characters) {
    const t = s.torches.get(m)
    if (!t || t.uid !== Uid.v[m] || t.lit <= 0) continue
    spots.push(torchSpot(Transform.x[m]!, Transform.y[m]!, charSize(m)))
    lits.push(t.lit)
  }
  return { spots, lits }
}

/** 怪物只从照度不到 spawnLux 的地方出来，离队长至少 minPlayerDist 格；挑不到就挑最暗的 */
function caveSpawn(sim: Sim, boss: boolean): Point {
  const s = caveOf(sim)
  const cfg = caveCfg(sim)
  const cells = boss ? s.layout.bossSpawns : s.layout.spawns
  const n = cells.length / 2
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
  const { spots, lits } = caveTorches(sim, s)
  let best: Point = { x: cells[0]!, y: cells[1]! }
  let bestLux = Infinity
  for (let k = 0; k < 64; k++) {
    const i = Math.floor(sim.rng.next() * n)
    const x = cells[i * 2]!
    const y = cells[i * 2 + 1]!
    if (Math.hypot(x - lx, y - ly) < near) continue
    const e = diffuseLux(s.light, x, y) + directLux(s.layout, s.sky, x, y, 0) + torchesLux(cfg.torch, spots, lits, x, y)
    if (e < cfg.spawnLux) return { x, y }
    if (e < bestLux) {
      bestLux = e
      best = { x, y }
    }
  }
  return best
}

/**
 * 溶洞：能走的是洞厅与支洞，洞壁、石柱与挡路的石笋是硬边界，挡人也挡子弹；绕不过去的按步数场绕。
 * 光照随真实的太阳月亮走，队员天暗了点起火把；怪物只从暗处出来；水潭里蹚水更慢更累
 */
const cave: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    return inPool(caveOf(sim).layout, x, y) ? wadeOf(sim) : groundOf(sim)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    return pushOut(caveOf(sim).layout.rock, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return caveOf(sim).layout.rock
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'rock')) return d
    const s = caveOf(sim)
    const rock = s.layout.rock
    const rad = Radius.v[eid]!
    if (clearPath(rock, x, y, tx, ty, rad * 0.9)) return glide(rock, x, y, d.x, d.y, rad + 0.3 * UNIT)
    const f = flowDir(s.flow, x, y) ?? d
    return glide(rock, x, y, f.x, f.y, rad + 0.3 * UNIT)
  },
  trace(sim, _probe, ax, ay, bx, by) {
    const hit = rockHit(caveOf(sim).layout.rock, ax, ay, bx, by)
    if (!hit) return null
    const len = Math.hypot(bx - ax, by - ay)
    const t = len > 0 ? Math.hypot(hit.x - ax, hit.y - ay) / len : 0
    return { t0: t, t1: t, material: 'rock' }
  },
  wanderDir(sim, eid, dx, dy) {
    const rock = caveOf(sim).layout.rock
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomOf(rock, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = outward(rock, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return glide(caveOf(sim).layout.rock, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    return caveSpawn(sim, boss)
  },
  /** 只看站不站得下：暗处由刷怪点挑，白天亮着的地标整组不出 */
  canSpawn(sim, x, y, radius) {
    return roomFor(caveOf(sim).layout.rock, x, y, radius)
  },
  /** 洞里暗到看不清了，水潭、荧光丛与天窗才出怪：白天那里亮堂堂的，怪只从暗处出来 */
  landmarks(sim) {
    const s = caveOf(sim)
    return s.light.hallLux < caveCfg(sim).view.clearLux ? s.marks : s.dayMarks
  },
  settle(sim, p) {
    const rock = caveOf(sim).layout.rock
    const inset = SPAWN.edgeInset * UNIT
    const q = pushOut(rock, p.x, p.y, inset)
    if (roomOf(rock, q.x, q.y) >= inset * 0.9) return q
    const cells = caveOf(sim).layout.spawns
    let best = { x: cells[0]!, y: cells[1]! }
    let bd = Infinity
    for (let i = 0; i < cells.length; i += 2) {
      const d = (cells[i]! - p.x) ** 2 + (cells[i + 1]! - p.y) ** 2
      if (d < bd) {
        bd = d
        best = { x: cells[i]!, y: cells[i + 1]! }
      }
    }
    return best
  },
  onStart(sim) {
    const s = caveOf(sim)
    flowFrom(s.flow, leaderX(sim), leaderY(sim))
  },
  /** 每隔一阵按此刻的天重算洞里的光；火把每帧推进；绕路的步数场跟着队长重算 */
  tick(sim, delta) {
    const cfg = caveCfg(sim)
    const s = caveOf(sim)
    s.lightIn -= delta
    if (s.lightIn <= 0) {
      s.lightIn += CAVE_LIGHT_MS
      skyAt(cfg, clockSec(sim), s.age0, s.sky)
      stepLight(s.light, s.layout, cfg, s.sky)
    }
    sim.characters.forEach((m, slot) => {
      let t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m]) {
        t = { uid: Uid.v[m]!, on: false, lit: 0, due: 0, want: false }
        s.torches.set(m, t)
      }
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      stepTorch(t, cfg.torch, diffuseLux(s.light, x, y) + directLux(s.layout, s.sky, x, y, 0), Alive.v[m] === 1, slot, sim.elapsedMs, delta)
    })
    s.flowIn -= delta
    if (s.flowIn <= 0) {
      s.flowIn = CAVE_FLOW_MS
      flowFrom(s.flow, leaderX(sim), leaderY(sim))
    }
  },
}

function oldRiverCfg(sim: Sim): OldRiverConfig {
  return MAPS[sim.mapId].oldRiver!
}

function oldRiverOf(sim: Sim): RiverRect {
  return riverRect(sim.mapW, sim.mapH, oldRiverCfg(sim).width * UNIT)
}

function oldFlowOf(sim: Sim): Point {
  return flowVector(isHorizontal(sim.mapW, sim.mapH), oldRiverCfg(sim).flow * UNIT)
}

const oldRiver: WorldHooks = {
  ...bounded,
  mediumVelocity(sim) {
    return oldFlowOf(sim)
  },
  /** 按行进方向与水流夹角的余弦在逆流与顺流的倍率之间插值，横渡不变 */
  effort(sim, _x, _y, dx, dy) {
    const f = oldFlowOf(sim)
    const len = Math.hypot(dx, dy) * Math.hypot(f.x, f.y)
    if (len === 0) return 1
    const c = (dx * f.x + dy * f.y) / len
    const cfg = oldRiverCfg(sim)
    return c < 0 ? 1 + (cfg.upstream - 1) * -c : 1 + (cfg.downstream - 1) * c
  },
  constrainBody(sim, eid, _from, next) {
    const r = oldRiverOf(sim)
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
    return pastDownstream({ x, y }, sim.mapW, sim.mapH, oldRiverCfg(sim).coinCullPad * UNIT)
  },
  spawnPoint(sim, boss) {
    const r = oldRiverOf(sim)
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
    return clampToRiver(p, oldRiverOf(sim), 0.5 * UNIT)
  },
  /** 漂过下游太远的敌人被冲走 */
  tick(sim) {
    const pad = oldRiverCfg(sim).enemyCullPad * UNIT
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
  oldRuins,
  ruins,
  ice,
  oldRiver,
  void: torus,
  space,
  nebulaOld,
  nebula,
  volcano,
  ship,
  floe,
  cave,
  meadow,
  sakura,
  desert,
  circuit,
}

const BUILT = new Map<WorldHooks, WorldHooks>()

/** 地图的规则，叠上能力造出的地形 */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  const base = def.ice ? ice : def.walls ? oldRuins : BY_KIND[def.kind]!
  let hooks = BUILT.get(base)
  if (!hooks) {
    hooks = withBuilt(base)
    BUILT.set(base, hooks)
  }
  return hooks
}

