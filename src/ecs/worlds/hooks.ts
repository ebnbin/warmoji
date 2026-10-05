import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { randomMapPoint } from '../utils/spawn'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import type { IceConfig, MapId, NebulaOldConfig, OldRiverConfig, SpaceConfig } from '../../types/maps'
import { onFloe } from './ice'
import { clampToDisc, confineVelocity, meteorSweep, ringPoint } from './space'
import { gravity, holeAt, inHorizon, meteorStart, meteorTrajectory } from './nebulaOld'
import type { NebulaState } from '../../maps/nebula/model'
import { awayFromWall, roomAt } from '../../maps/basin'
import type { Basin } from '../../maps/basin'
import type { GateRuntime } from './gates'
import type { Landmark } from '../../maps/landmark'
import type { VolcanoState } from '../../maps/volcano/model'
import type { ShipState } from '../../maps/ship/model'
import type { FloeState } from '../../maps/floe/model'
import type { CaveState } from '../../maps/cave/model'
import { clampToRiver, flowVector, pastDownstream, riverRect } from './oldRiver'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from './torus'
import type { RiverRect } from './oldRiver'
import { isHorizontal } from '../utils/remap'
import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Boss, Due, ENEMY_SET, Hp, Meteor, Pickup, PICKUP_SET, PROJ_SET, Radius, Slot, Swarmer, Tint, Transform, Uid } from '../components'
import { bodyRules, meteorHit, meteorPath } from '../store'
import { spawnMeteor } from '../entities/meteor'
import { FlowField, generateRuins, reachableCells, WallGrid } from './oldRuins'
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
import type { BodyStep } from '../systems/shared/body'
import { grounded, phases } from '../utils/pass'
import type { Crossing, Probe } from '../utils/pass'
import type { Solid } from './solids'
import type { ObstacleId } from '../../types/obstacles'
import type { MeadowState } from '../../maps/meadow/world'
import type { SakuraState } from '../../maps/sakura/world'
import type { CircuitState } from '../../maps/circuit/world'
import type { DesertState } from '../../maps/desert/world'
import type { RuinsState } from '../../maps/ruins/world'

export const ZERO: Point = { x: 0, y: 0 }
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
export function groundOf(sim: Sim): Surface {
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
  /** (x, y) 处立着的实心，挡身体的与挡弹体的都算，取规则用的那份；只给开发面板画高度，不写就当没有 */
  solidAt?(sim: Sim, x: number, y: number): Solid | null
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
  /** 这个身体此刻每秒换多少口气，按体力点数：正的是喘得上气，走着也按它补；负的是憋着气，按它往下掉，歇着也回不来；不写就照常 */
  breath?(sim: Sim, eid: number): number
  /** 这张图要队伍盯住的一处：在屏幕外时队长身边画一个指过去的箭头；不写就没有 */
  beacon?(sim: Sim): Point | null
  onStart(sim: Sim): void
  tick(sim: Sim, delta: number): void
}

export const bounded: WorldHooks = {
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

export const ice: WorldHooks = {
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
      if (Alive.v[m] && grounded(sim.world, m) && !onFloe(Transform.x[m]!, Transform.y[m]!, px)) hit(sim, src, m, dmg, { tick: true })
    }
    const edmg = Math.round(cfg.waterEnemyDps * frac)
    for (const eid of [...query(sim.world, ENEMY_SET)]) {
      if (grounded(sim.world, eid) && !onFloe(Transform.x[eid]!, Transform.y[eid]!, px)) hit(sim, src, eid, edmg, { tick: true })
    }
  },
}

export const oldRuins: WorldHooks = {
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
export const space: WorldHooks = {
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
export const nebulaOld: WorldHooks = {
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

/** 游荡着走到壁跟前就像撞上地图边一样折回来 */
export function wanderIn(b: Basin, eid: number, dx: number, dy: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  const dot = dx * n.x + dy * n.y
  return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
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

export const oldRiver: WorldHooks = {
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

export const torus: WorldHooks = {
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
