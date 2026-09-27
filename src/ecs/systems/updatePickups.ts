import { addComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { Alive, Collected, Drive, Grab, Radius, Lifetime, PICKUP_SET, Pull, Stats, Tint, Transform } from '../components'
import { animatePickup } from '../entities/pickup'
import { inTransit } from '../utils/marks'
import type { Sim } from '../sim'
import { leaderX, leaderY } from '../utils/team'

const FADE_MS = 250

/** 金币被吸附范围内最近的存活角色吸走、碰到任何角色即拾取；不吸附的拾取物只有队长走过去才捡；穿行中的角色没有实体，不捡也不吸；位移由 moveBodies 负责，漂出世界就消失 */
export function updatePickups(sim: Sim): void {
  const eids = query(sim.world, PICKUP_SET)
  if (eids.length === 0) return
  const now = sim.elapsedMs
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of eids) {
    animatePickup(sim, eid)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (sim.hooks.outside(sim, x, y)) {
      removeEntity(sim.world, eid)
      continue
    }
    const magnetic = Pull.on[eid] === 1
    if (sim.frameAttractors.length > 0 && magnetic) {
      let taken = false
      for (const a of sim.frameAttractors) {
        const ad = sim.hooks.worldDelta(sim, x, y, a.x, a.y)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          take(sim, eid)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    const grab = Grab.radius[eid]!
    const grabbed = magnetic ? nearAliveCharacter(sim, x, y, grab) : present(sim.leader) && within(sim, x, y, lx, ly, grab)
    if (grabbed) {
      take(sim, eid)
      continue
    }
    if (Lifetime.until[eid]! > 0) {
      const left = Lifetime.until[eid]! - now
      if (left <= 0) {
        removeEntity(sim.world, eid)
        continue
      }
      if (left < FADE_MS) Tint.alpha[eid] = left / FADE_MS
    }
    if (!magnetic) continue
    const pull = magnetPull(sim, x, y)
    if (pull) {
      const dir = norm(pull.x, pull.y)
      Drive.x[eid] = dir.x * PICKUP.magnetSpeed * UNIT
      Drive.y[eid] = dir.y * PICKUP.magnetSpeed * UNIT
    } else {
      Drive.x[eid] = 0
      Drive.y[eid] = 0
    }
  }
}

function take(sim: Sim, eid: number): void {
  addComponent(sim.world, eid, Collected)
}

function within(sim: Sim, x: number, y: number, tx: number, ty: number, r: number): boolean {
  const d = sim.hooks.worldDelta(sim, x, y, tx, ty)
  return d.x * d.x + d.y * d.y <= r * r
}

/** 在场上：活着且不在穿行 */
function present(m: number): boolean {
  return Alive.v[m] === 1 && !inTransit(m)
}

function nearAliveCharacter(sim: Sim, x: number, y: number, grab: number): boolean {
  const cr = PICKUPS.coin.radius * UNIT
  for (const m of sim.characters) {
    if (!present(m)) continue
    if (within(sim, x, y, Transform.x[m]!, Transform.y[m]!, Math.max(grab, Radius.v[m]! + cr))) return true
  }
  return false
}

/** 最近的存活角色把金币拉向自己，前提是金币在他的吸附半径内 */
function magnetPull(sim: Sim, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestD2 = Infinity
  let bestR = 0
  for (const m of sim.characters) {
    if (!present(m)) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 >= bestD2) continue
    bestD2 = d2
    bestR = Stats.magnet[m]! * UNIT
    best = d
  }
  return best && bestD2 < bestR * bestR ? best : null
}
