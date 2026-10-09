import { hasComponent, query, removeEntity } from 'bitecs'
import { AI } from '../../data/enemies'
import { PICKUPS } from '../../data/pickups'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import {
  Alive,
  AROUND,
  Chase,
  CoinThief,
  Drive,
  Flee,
  GrantCoins,
  March,
  Nest,
  Orbit,
  Phys,
  PICKUP_SET,
  Radius,
  Wander,
  Standoff,
  Stats,
  Ctl,
  Thief,
  Transform,
} from '../components'
import { freshFoe, nearestFoe, wanderDir } from './shared/steer'
import type { Found } from '../utils/targets'
import type { Point } from '../../util/vec'
import { marchMark } from '../store'
import { moveSpeed } from '../utils/stats'
import { leaderPoint } from '../utils/team'
import type { Sim } from '../sim'

function drive(eid: number, dx: number, dy: number, speed: number): void {
  Drive.x[eid] = dx * speed
  Drive.y[eid] = dy * speed
}

/** 没有目标时的游荡：不算赶路 */
function stroll(sim: Sim, eid: number, speed: number): void {
  const d = wanderDir(sim, eid)
  drive(eid, d.x, d.y, speed)
  Drive.idle[eid] = 1
}


/** 追索敌距离内最近的敌人，盯队长的追队长；直线够不着而穿门的路够得着时追队长；都够不着就慢速游荡 */
function chase(sim: Sim): void {
  for (const eid of query(sim.world, [Chase, Ctl, Transform, Phys, Stats])) {
    if (!Ctl.move[eid]) continue
    const speed = moveSpeed(eid)
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const seek = Chase.seek[eid]!
    let target: { x: number; y: number } | null
    if (Chase.leader[eid]) {
      const p = leaderPoint(sim)
      const d = sim.hooks.worldDelta(sim, ex, ey, p.x, p.y)
      target = d.x * d.x + d.y * d.y <= seek * seek ? { x: ex + d.x, y: ey + d.y } : null
    } else {
      target = nearestFoe(sim, eid, ex, ey, seek)
    }
    // 直线够不着、穿过传送门的路却在索敌距离内：追队长
    if (!target && sim.hooks.toLeader && sim.hooks.toLeader(sim, ex, ey) <= seek) target = leaderPoint(sim)
    if (!target) {
      stroll(sim, eid, speed * AI.idleSpeedMul.chase)
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    drive(eid, dir.x, dir.y, speed)
  }
}

function wander(sim: Sim): void {
  for (const eid of query(sim.world, [Wander, Ctl, Phys, Stats])) {
    if (!Ctl.move[eid]) continue
    stroll(sim, eid, moveSpeed(eid))
  }
}

/** 敌人进到 range 内就逃，否则慢速游荡 */
function flee(sim: Sim): void {
  for (const eid of query(sim.world, [Flee, Ctl, Transform, Phys, Stats])) {
    if (!Ctl.move[eid]) continue
    const speed = moveSpeed(eid)
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
    stroll(sim, eid, speed * AI.idleSpeedMul.flee)
  }
}

/** 索敌距离内有敌人就保持在 standoffDist 附近：远了靠近，近了后退，带内不动；没有就慢速游荡 */
function standoff(sim: Sim): void {
  const band = AI.standoffBandU * UNIT
  for (const eid of query(sim.world, [Standoff, Ctl, Transform, Phys, Stats])) {
    if (!Ctl.move[eid]) continue
    const sp = moveSpeed(eid)
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const target = nearestFoe(sim, eid, ex, ey, Standoff.seek[eid]!)
    if (!target) {
      stroll(sim, eid, sp * AI.idleSpeedMul.standoff)
      continue
    }
    const dx = target.x - ex
    const dy = target.y - ey
    const dist = Math.hypot(dx, dy)
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

/** 绕谁转：绕人的绕看得见的最近敌人；绕巢的绕还活着的锚点，目标进到锚点 aggro 内（aggro 为 0 时一看见）就不绕了；不绕返回 null */
function orbitCenter(sim: Sim, eid: number, target: Found | null): Point | null {
  if (Orbit.around[eid] === AROUND.foe) return target
  const anchor = Nest.of[eid]!
  if (anchor < 0 || Alive.v[anchor] !== 1) return null
  if (target) {
    const aggro = Orbit.aggro[eid]!
    if (aggro === 0) return null
    const td = sim.hooks.worldDelta(sim, Transform.x[anchor]!, Transform.y[anchor]!, target.x, target.y)
    if (td.x * td.x + td.y * td.y <= aggro * aggro) return null
  }
  return { x: Transform.x[anchor]!, y: Transform.y[anchor]! }
}

/** 绕着转（巡游不算赶路）；绕巢的该扑的时候扑向目标，锚点没了就只剩追；看不见目标就慢速游荡 */
function orbit(sim: Sim): void {
  for (const eid of query(sim.world, [Orbit, Nest, Ctl, Transform, Phys, Stats])) {
    if (!Ctl.move[eid]) continue
    const sp = moveSpeed(eid)
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    const seek = Orbit.seek[eid]!
    const target = Orbit.fresh[eid] ? freshFoe(sim, eid, ex, ey, seek) : nearestFoe(sim, eid, ex, ey, seek)
    const center = orbitCenter(sim, eid, target)
    if (!center) {
      if (!target) {
        stroll(sim, eid, sp * AI.idleSpeedMul.chase)
        continue
      }
      const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
      drive(eid, dir.x, dir.y, sp)
      continue
    }
    const rel = sim.hooks.worldDelta(sim, center.x, center.y, ex, ey)
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
    Drive.idle[eid] = 1
  }
}

/** 奔向最近的金币吃掉，没有金币就慢速游荡 */
function coinThief(sim: Sim): void {
  const thieves = query(sim.world, [CoinThief, Ctl, Transform, Phys, Stats, Radius])
  if (thieves.length === 0) return
  const coins: number[] = []
  for (const c of query(sim.world, PICKUP_SET)) {
    if (hasComponent(sim.world, c, GrantCoins)) coins.push(c)
  }
  for (const eid of thieves) {
    if (!Ctl.move[eid]) continue
    const sp = moveSpeed(eid)
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
      stroll(sim, eid, sp * AI.idleSpeedMul.coinThief)
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

/** 朝那一组地标里离自己最近的一处走，按地图的走法绕开障碍；那一组此刻没有就慢速游荡 */
function march(sim: Sim): void {
  const marchers = query(sim.world, [March, Ctl, Transform, Phys, Stats])
  if (marchers.length === 0) return
  const marks = sim.hooks.landmarks(sim)
  for (const eid of marchers) {
    if (!Ctl.move[eid]) continue
    const sp = moveSpeed(eid)
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    let target: { x: number; y: number } | null = null
    let bestD = Infinity
    for (const m of marks[marchMark[eid]!] ?? []) {
      const w = sim.hooks.worldDelta(sim, ex, ey, m.x, m.y)
      const d = w.x * w.x + w.y * w.y
      if (d < bestD) {
        bestD = d
        target = { x: ex + w.x, y: ey + w.y }
      }
    }
    if (!target) {
      stroll(sim, eid, sp * AI.idleSpeedMul.chase)
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    drive(eid, dir.x, dir.y, sp)
  }
}

/** 驱动：每种走法把期望速度写进 Drive，积分交给 moveBodies；Ctl.move 为 0 的身体这一帧不自己走 */
export function steerBodies(sim: Sim): void {
  chase(sim)
  wander(sim)
  flee(sim)
  standoff(sim)
  orbit(sim)
  coinThief(sim)
  march(sim)
}
