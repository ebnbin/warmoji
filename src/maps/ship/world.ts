import { DEG2RAD, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import type { ShipConfig } from '../../types/maps'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { GRAVITY as SHIP_G } from './physics'
import { addWeight, bumpBalls, clearWeights, makeShip, paceOf, stepBalls, stepOnDeck, stepShip } from './model'
import type { ShipState } from './model'
import { hasComponent, query } from 'bitecs'
import { Alive, Drive, Phys, Pickup, Radius, Shard, Transform, Uid } from '../../ecs/components'
import type { Sim } from '../../ecs/sim'
import { grounded } from '../../ecs/utils/pass'
import { solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { bounded, wanderIn, ZERO } from '../../ecs/worlds/hooks'
import type { WorldHooks } from '../../ecs/worlds/hooks'

function shipCfg(sim: Sim): ShipConfig {
  return MAPS[sim.mapId].ship!
}

/** 炮弹的位置与涌浪的相位由布景种子定下；船从正浮开始摇 */
function shipOf(sim: Sim): ShipState {
  let s = sim.worldState.ship
  if (!s) {
    s = makeShip(shipCfg(sim), !sim.portrait, new Rng(sim.run.decorSeed ^ 0x5b1d))
    sim.worldState.ship = s
  }
  return s
}

/** 压在甲板上的重量，千克：身体按半径的三次方与身体的质量折算；脚不沾地的、死了的与碎片不压甲板 */
function deckKg(sim: Sim, cfg: ShipConfig, eid: number): number {
  if (!Alive.v[eid] || !grounded(sim.world, eid) || hasComponent(sim.world, eid, Shard)) return 0
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
export const ship: WorldHooks = {
  ...bounded,
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(shipOf(sim).deck.solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(shipOf(sim).deck.solids, x, y)
  },
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
