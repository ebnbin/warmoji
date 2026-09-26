import { hasComponent, query, removeEntity } from 'bitecs'
import { AI } from '../../data/enemies'
import { PICKUPS } from '../../data/pickups'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import {
  Alive,
  Chase,
  CoinThief,
  Drive,
  Flee,
  GrantCoins,
  Nest,
  Orbit,
  PICKUP_SET,
  Radius,
  Roam,
  Slowed,
  Speed,
  Standoff,
  Steering,
  Thief,
  Transform,
} from '../components'
import { freshFoe, nearestFoe, wanderDir } from './shared/steer'
import type { Sim } from '../sim'

function drive(eid: number, dx: number, dy: number, speed: number): void {
  Drive.x[eid] = dx * speed
  Drive.y[eid] = dy * speed
}

/** 追最近的敌人，没有就慢速游荡 */
function chase(sim: Sim): void {
  for (const eid of query(sim.world, [Chase, Steering, Transform, Speed, Slowed])) {
    if (!Steering.v[eid]) continue
    const speed = Speed.v[eid]! * Slowed.v[eid]!
    const target = nearestFoe(sim, eid, Transform.x[eid]!, Transform.y[eid]!)
    if (!target) {
      const d = wanderDir(sim, eid)
      drive(eid, d.x, d.y, speed * 0.5)
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    drive(eid, dir.x, dir.y, speed)
  }
}

function roam(sim: Sim): void {
  for (const eid of query(sim.world, [Roam, Steering, Speed, Slowed])) {
    if (!Steering.v[eid]) continue
    const d = wanderDir(sim, eid)
    drive(eid, d.x, d.y, Speed.v[eid]! * Slowed.v[eid]!)
  }
}

/** 敌人进到 range 内就逃，否则慢速游荡 */
function flee(sim: Sim): void {
  for (const eid of query(sim.world, [Flee, Steering, Transform, Speed, Slowed])) {
    if (!Steering.v[eid]) continue
    const speed = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestFoe(sim, eid, ex, ey)
    if (target) {
      const d = sim.hooks.worldDelta(sim, ex, ey, target.x, target.y)
      const r = Flee.range[eid]!
      if (d.x * d.x + d.y * d.y <= r * r) {
        const away = norm(-d.x, -d.y)
        const dir = sim.hooks.fleeDir(sim, eid, away.x, away.y)
        drive(eid, dir.x, dir.y, speed)
        continue
      }
    }
    const w = wanderDir(sim, eid)
    drive(eid, w.x, w.y, speed * AI.fleeIdleSpeedMul)
  }
}

/** 探测到敌人后保持在 standoffDist 附近：远了靠近，近了后退，带内不动 */
function standoff(sim: Sim): void {
  const band = AI.standoffBandU * UNIT
  for (const eid of query(sim.world, [Standoff, Steering, Transform, Speed, Slowed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestFoe(sim, eid, ex, ey)
    const dx = target ? target.x - ex : 0
    const dy = target ? target.y - ey : 0
    const dist = target ? Math.hypot(dx, dy) : Infinity
    if (dist > Standoff.detectRange[eid]!) {
      const d = wanderDir(sim, eid)
      drive(eid, d.x, d.y, sp * 0.5)
      continue
    }
    const stand = Standoff.standoffDist[eid]!
    if (dist > stand + band) {
      const d = norm(dx, dy)
      drive(eid, d.x, d.y, sp)
      continue
    }
    if (dist < stand - band) {
      const away = norm(-dx, -dy)
      const d = sim.hooks.fleeDir(sim, eid, away.x, away.y)
      drive(eid, d.x, d.y, sp)
    }
  }
}

/** 绕着锚点转；该扑的时候扑向目标；锚点没了就只剩追 */
function orbit(sim: Sim): void {
  for (const eid of query(sim.world, [Orbit, Nest, Steering, Transform, Speed, Slowed])) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const seek = Orbit.seek[eid]!
    const target = Orbit.fresh[eid] ? freshFoe(sim, eid, ex, ey, seek) : nearestFoe(sim, eid, ex, ey, seek)
    const anchor = Nest.of[eid]!
    let circling = anchor >= 0 && Alive.v[anchor] === 1
    if (circling && target) {
      const aggro = Orbit.aggro[eid]!
      if (aggro === 0) {
        circling = false
      } else {
        const td = sim.hooks.worldDelta(sim, Transform.x[anchor]!, Transform.y[anchor]!, target.x, target.y)
        if (td.x * td.x + td.y * td.y <= aggro * aggro) circling = false
      }
    }
    if (!circling) {
      if (!target) continue
      const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
      drive(eid, dir.x, dir.y, sp)
      continue
    }
    const rel = sim.hooks.worldDelta(sim, Transform.x[anchor]!, Transform.y[anchor]!, ex, ey)
    const r = Math.hypot(rel.x, rel.y)
    const ux = r > 1e-6 ? rel.x / r : 1
    const uy = r > 1e-6 ? rel.y / r : 0
    const want = Orbit.radius[eid]!
    const spin = Orbit.spin[eid]!
    const tangential = spin > 0 ? Math.min(sp, spin * want) : sp
    const radial = ((want - r) / want) * 1.5 * sp
    let vx = -uy * tangential + ux * radial
    let vy = ux * tangential + uy * radial
    const len = Math.hypot(vx, vy)
    if (len > sp) {
      vx *= sp / len
      vy *= sp / len
    }
    Drive.x[eid] = vx
    Drive.y[eid] = vy
  }
}

/** 奔向最近的金币吃掉，没有金币就慢速游荡 */
function coinThief(sim: Sim): void {
  const thieves = query(sim.world, [CoinThief, Steering, Transform, Speed, Slowed, Radius])
  if (thieves.length === 0) return
  const coins: number[] = []
  for (const c of query(sim.world, PICKUP_SET)) {
    if (hasComponent(sim.world, c, GrantCoins)) coins.push(c)
  }
  for (const eid of thieves) {
    if (!Steering.v[eid]) continue
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    let coin = -1
    let coinAt = -1
    let bestD = Infinity
    let coinX = 0
    let coinY = 0
    for (let k = 0; k < coins.length; k++) {
      const c = coins[k]!
      if (c < 0) continue
      const w = sim.hooks.worldDelta(sim, ex, ey, Transform.x[c]!, Transform.y[c]!)
      const d = w.x * w.x + w.y * w.y
      if (d < bestD) {
        bestD = d
        coin = c
        coinAt = k
        coinX = ex + w.x
        coinY = ey + w.y
      }
    }
    if (coin < 0) {
      const d = wanderDir(sim, eid)
      drive(eid, d.x, d.y, sp * 0.3)
      continue
    }
    const eatR = Radius.v[eid]! + PICKUPS.coin.radius * UNIT
    if (bestD <= eatR * eatR) {
      if (sim.elapsedMs >= Thief.nextEatAt[eid]!) {
        removeEntity(sim.world, coin)
        coins[coinAt] = -1
        Thief.eaten[eid] = Thief.eaten[eid]! + 1
        Thief.nextEatAt[eid] = sim.elapsedMs + AI.coinThiefEatCdMs
      }
      continue
    }
    const dir = norm(coinX - ex, coinY - ey)
    drive(eid, dir.x, dir.y, sp)
  }
}

/** 驱动：每种走法把期望速度写进 Drive，积分交给 moveBodies；Steering 为 0 的身体这一帧不动 */
export function steerBodies(sim: Sim): void {
  chase(sim)
  roam(sim)
  flee(sim)
  standoff(sim)
  orbit(sim)
  coinThief(sim)
}
