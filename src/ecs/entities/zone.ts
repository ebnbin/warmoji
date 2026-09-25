import { addComponent, addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Lifetime, Owner, Ring, Tint, Transform, Zone, ZoneBurn, ZoneChill, ZoneFollow } from '../components'
import { zoneSrcName } from '../store'
import type { Sim } from '../sim'


export interface ZoneSpec {
  x: number
  y: number
  radius: number
  faction: number
  durationMs: number
  enterMs: number
  color: number
  fillAlpha: number
  lineAlpha: number
  lineWidth: number
  burn?: { damage: number; tickMs: number; srcSlot: number; srcName: string }
  chill?: { factor: number }
  follow?: { of: number; owner: number }
}

export function spawnZone(sim: Sim, spec: ZoneSpec): number {
  const world = sim.world
  const eid = newEntity(world)
  addComponents(world, eid, Zone, Transform, Tint, Ring, Lifetime)
  Zone.radius[eid] = spec.radius
  Zone.faction[eid] = spec.faction
  Zone.enterMs[eid] = spec.enterMs
  Zone.on[eid] = 1
  Transform.x[eid] = spec.x
  Transform.y[eid] = spec.y
  Transform.rot[eid] = 0
  Transform.w[eid] = 0
  Transform.h[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Ring.color[eid] = spec.color
  Ring.radius[eid] = spec.radius * (spec.enterMs > 0 ? 0.3 : 1)
  Ring.fillAlpha[eid] = spec.fillAlpha
  Ring.lineAlpha[eid] = spec.lineAlpha
  Ring.lineWidth[eid] = spec.lineWidth
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 2
  Ring.breathe[eid] = 0
  Lifetime.until[eid] = spec.durationMs > 0 ? sim.elapsedMs + spec.durationMs : 0
  if (spec.burn) {
    addComponent(world, eid, ZoneBurn)
    ZoneBurn.damage[eid] = spec.burn.damage
    ZoneBurn.tickMs[eid] = spec.burn.tickMs
    ZoneBurn.nextAt[eid] = sim.elapsedMs + spec.burn.tickMs
    ZoneBurn.srcSlot[eid] = spec.burn.srcSlot
    zoneSrcName[eid] = spec.burn.srcName
  }
  if (spec.chill) {
    addComponent(world, eid, ZoneChill)
    ZoneChill.factor[eid] = spec.chill.factor
  }
  if (spec.follow) {
    addComponents(world, eid, ZoneFollow, Owner)
    ZoneFollow.of[eid] = spec.follow.of
    Owner.eid[eid] = spec.follow.owner
  }
  return eid
}
