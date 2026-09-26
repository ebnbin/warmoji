import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { randomMapPoint } from '../utils/spawn'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import type { IceConfig, InfiniteConfig, MapDef, MapId, RiverConfig, ShrinkRingConfig, SpaceConfig } from '../../types/maps'
import { onFloe } from '../worlds/ice'
import { outsideZone, ringPoint, zoneRadiusAt } from '../worlds/infinite'
import { clampToDisc, confineVelocity, meteorSweep } from '../worlds/space'
import { clampToRiver, flowVector, pastDownstream, riverRect } from '../worlds/river'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from '../worlds/torus'
import type { RiverRect } from '../worlds/river'
import { isHorizontal } from '../utils/remap'
import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Boss, BreaksWalls, Dormant, Due, ENEMY_SET, Meteor, Phasing, Pickup, Radius, Slot, Tint, Transform, Uid } from '../components'
import { meteorHit } from '../store'
import { spawnMeteor } from '../entities/meteor'
import { FlowField, generateRuins, reachableCells, WallGrid } from '../worlds/ruins'
import { hit } from '../systems/shared/damage'
import { hazardSource } from '../utils/source'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { fleeSteer } from '../systems/shared/steer'
import { leaderX, leaderY, leaderPoint } from '../utils/team'
import { iceTraction } from '../systems/shared/squad'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []

export interface Surface {
  readonly traction: number
  readonly viscosity: number
}
export const GROUND: Surface = { traction: 1, viscosity: 1 }

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
  zone: { x: number; y: number; r: number } | null
  walls: Walls | null
}

export function newWorldState(): WorldState {
  return { tickAt: 0, zone: null, walls: null }
}

export interface WorldHooks {
  readonly torus: boolean
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  ghosts(sim: Sim, x: number, y: number): Point[]
  wrap(sim: Sim, x: number, y: number): Point
  projectileLifeMs(sim: Sim): number
  mediumVelocity(sim: Sim, x: number, y: number): Point
  surface(sim: Sim, x: number, y: number): Surface
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
  activeHalf(sim: Sim): number
  onStart(sim: Sim): void
  onFinalWave(sim: Sim): void
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
  surface() {
    return GROUND
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
  activeHalf() {
    return Infinity
  },
  onStart() {},
  onFinalWave() {},
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
    if (onFloe(x, y, floePx(sim))) return { traction: iceTraction(), viscosity: 1 }
    return { traction: cfg.waterTraction, viscosity: cfg.waterViscosity }
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

function infCfg(sim: Sim): InfiniteConfig {
  return MAPS[sim.mapId].infinite!
}

function ringCfg(sim: Sim): ShrinkRingConfig {
  return MAPS[sim.mapId].shrinkRing!
}

const infinite: WorldHooks = {
  ...bounded,
  constrainBody(_sim, _eid, _from, next) {
    return next
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
    const zone = sim.worldState.zone
    if (boss) return ringPoint(sim.rng, zone ?? leaderPoint(sim), 6 * UNIT, 8 * UNIT)
    const cfg = infCfg(sim)
    const p = ringPoint(sim.rng, leaderPoint(sim), cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    if (!zone) return p
    const limit = zone.r - UNIT
    if (limit <= 0 || !outsideZone(p, zone, limit)) return p
    const d = Math.hypot(p.x - zone.x, p.y - zone.y) || 1
    return { x: zone.x + ((p.x - zone.x) / d) * limit, y: zone.y + ((p.y - zone.y) / d) * limit }
  },
  activeHalf(sim) {
    return infCfg(sim).activeHalf * UNIT
  },
  onFinalWave(sim) {
    sim.worldState.zone = { x: leaderX(sim), y: leaderY(sim), r: ringCfg(sim).r0 * UNIT }
    sim.worldState.tickAt = ringCfg(sim).tickMs
  },
  tick(sim) {
    const zone = sim.worldState.zone
    if (!zone) return
    const cfg = ringCfg(sim)
    zone.r = zoneRadiusAt(sim.elapsedMs, cfg) * UNIT
    if (sim.elapsedMs < sim.worldState.tickAt) return
    sim.worldState.tickAt = sim.elapsedMs + cfg.tickMs
    const src = hazardSource('poisonFog', 0xef5350)
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      if (outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r)) hit(sim, src, m, cfg.tickDamage, { tick: true })
    }
  },
}

function spaceCfg(sim: Sim): SpaceConfig {
  return MAPS[sim.mapId].space!
}

function fieldR(sim: Sim): number {
  return spaceCfg(sim).blackholeRadiusU * UNIT
}

const space: WorldHooks = {
  ...infinite,
  constrainBody(sim, _eid, from, next) {
    const r = fieldR(sim)
    const v = confineVelocity(from.x, from.y, 0, 0, next.x - from.x, next.y - from.y, r)
    return clampToDisc(from.x + v.x, from.y + v.y, 0, 0, r)
  },
  spawnPoint(sim, boss) {
    const cfg = infCfg(sim)
    const p = boss
      ? ringPoint(sim.rng, { x: 0, y: 0 }, 6 * UNIT, 8 * UNIT)
      : ringPoint(sim.rng, leaderPoint(sim), cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    return clampToDisc(p.x, p.y, 0, 0, fieldR(sim) - UNIT)
  },
  onFinalWave() {},
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
      if (Dormant.v[eid] || struck.has(Uid.v[eid]!)) continue
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
  activeHalf(sim) {
    return MAPS[sim.mapId].infinite!.activeHalf * UNIT
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
}

const BY_KIND: Record<MapDef['kind'], WorldHooks> = {
  bounded,
  daynight: bounded,
  ruins: ruins,
  ice,
  river,
  void: torus,
  space,
  infinite,
}

export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  if (def.ice) return ice
  if (def.walls) return ruins
  return BY_KIND[def.kind]!
}

