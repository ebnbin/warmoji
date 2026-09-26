import { addComponent, addComponents } from 'bitecs'
import { newEntity } from './entity'
import {
  Alive,
  Bob,
  Clock,
  Drive,
  GrantCoins,
  GrantFlash,
  GrantMod,
  Grab,
  Lifetime,
  Phys,
  Pickup,
  PickupFx,
  Pop,
  Pull,
  Radius,
  Ring,
  Transform,
  VisOff,
} from '../components'
import { attachDrawable } from './drawable'
import { pickupDef, pickupSfx } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { SfxId } from '../../types/sfx'
import type { Sim } from '../sim'
import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { FIELD, POLARITY_COLOR } from '../../data/battlefield'
import { backEaseOut, sineEaseInOut } from '../utils/ease'


interface PickupSpec {
  emoji: string
  size: number
  z: number
  magnetic: boolean
  grab: number
  groundMs: number
  popMs: number
  bob: number
  ring?: { color: number; radius: number; fillAlpha: number; z: number }
  def?: FieldPickupDef
  coins?: number
  mod?: boolean
  flash?: { color: number; ms: number }
  fx?: { burst: number; sfx: SfxId }
}

/** 拾取物是响应极快的轻身体：磁吸是它的驱动，河流之类的介质自然带着它走 */
const PICKUP_BODY = { mass: 1, drag: 5, grip: 8 }

function spawnPickup(sim: Sim, x: number, y: number, spec: PickupSpec): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Pickup, Pull, Grab, Lifetime, Phys, Drive, Clock, Alive, Radius, Pop, Bob)
  Radius.v[eid] = PICKUPS.coin.radius * UNIT
  const p = sim.hooks.constrainBody(sim, eid, { x, y }, { x, y })
  attachDrawable(sim.world, eid, sim.frames, {
    id: spec.emoji,
    outline: 'player',
    x: p.x,
    y: p.y,
    size: spec.size,
    z: spec.z,
  })
  Pickup.bornMs[eid] = sim.elapsedMs
  Pull.on[eid] = spec.magnetic ? 1 : 0
  Grab.radius[eid] = spec.grab
  Lifetime.until[eid] = spec.groundMs > 0 ? sim.elapsedMs + spec.groundMs : 0
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  Phys.mass[eid] = PICKUP_BODY.mass
  Phys.drag[eid] = PICKUP_BODY.drag
  Phys.grip[eid] = PICKUP_BODY.grip
  Drive.x[eid] = 0
  Drive.y[eid] = 0
  Clock.v[eid] = 1
  Alive.v[eid] = 1
  Pop.until[eid] = spec.popMs > 0 ? sim.fxMs + spec.popMs : 0
  Pop.ms[eid] = spec.popMs
  Pop.size[eid] = spec.size
  Pop.back[eid] = 1
  Pop.alpha[eid] = 1
  Bob.amp[eid] = spec.bob
  Bob.halfMs[eid] = 620
  Bob.born[eid] = sim.fxMs
  if (spec.ring) {
    addComponent(sim.world, eid, Ring)
    Ring.color[eid] = spec.ring.color
    Ring.radius[eid] = spec.ring.radius
    Ring.fillAlpha[eid] = spec.ring.fillAlpha
    Ring.lineAlpha[eid] = 0.9
    Ring.lineWidth[eid] = 3
    Ring.born[eid] = sim.fxMs
    Ring.dy[eid] = 0
    Ring.z[eid] = spec.ring.z
    Ring.breathe[eid] = 1
  }
  pickupDef[eid] = spec.def
  pickupSfx[eid] = spec.fx?.sfx
  if (spec.coins !== undefined) {
    addComponent(sim.world, eid, GrantCoins)
    GrantCoins.n[eid] = spec.coins
  }
  if (spec.mod) addComponent(sim.world, eid, GrantMod)
  if (spec.flash) {
    addComponent(sim.world, eid, GrantFlash)
    GrantFlash.color[eid] = spec.flash.color
    GrantFlash.ms[eid] = spec.flash.ms
  }
  if (spec.fx) {
    addComponent(sim.world, eid, PickupFx)
    PickupFx.burst[eid] = spec.fx.burst
  }
  return eid
}


function coinSpec(): PickupSpec {
  return {
    emoji: PICKUPS.coin.emoji,
    size: PICKUPS.coin.size * UNIT,
    z: 3,
    magnetic: true,
    grab: PICKUP.collectRadius * UNIT,
    groundMs: 0,
    popMs: 160,
    bob: 0,
    coins: 1,
    fx: { burst: 4, sfx: 'coin' },
  }
}

function fieldSpec(def: FieldPickupDef): PickupSpec {
  const color = POLARITY_COLOR[def.polarity]
  return {
    emoji: def.emoji,
    size: 0.85 * UNIT,
    z: 6,
    magnetic: false,
    grab: FIELD.grabRadiusU * UNIT,
    groundMs: FIELD.groundMs,
    popMs: 180,
    bob: 6,
    ring: { color, radius: FIELD.grabRadiusU * UNIT, fillAlpha: 0.12, z: 3 },
    def,
    mod: true,
    flash: { color, ms: 300 },
    fx: { burst: 10, sfx: def.polarity === 'buff' ? 'levelup' : 'hurt' },
  }
}

export function dropCoins(sim: Sim, x: number, y: number, count: number): void {
  const spec = coinSpec()
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    spawnPickup(sim, x + jx, y + jy, spec)
  }
}

export function dropFieldPickup(sim: Sim, x: number, y: number, def: FieldPickupDef): void {
  spawnPickup(sim, x, y, fieldSpec(def))
}

export function attachCarrierRing(sim: Sim, eid: number, def: FieldPickupDef): void {
  addComponent(sim.world, eid, Ring)
  Ring.color[eid] = POLARITY_COLOR[def.polarity]
  Ring.radius[eid] = FIELD.auraRadiusU * UNIT
  Ring.fillAlpha[eid] = 0.18
  Ring.lineAlpha[eid] = 0.85
  Ring.lineWidth[eid] = 3
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 4
  Ring.breathe[eid] = 2
}


export function animatePickup(sim: Sim, eid: number): void {
  const popLeft = Pop.until[eid]! - sim.fxMs
  const size = Pop.size[eid]!
  if (popLeft > 0) {
    const k = size * (0.3 + 0.7 * backEaseOut(1 - popLeft / Pop.ms[eid]!))
    Transform.w[eid] = k
    Transform.h[eid] = k
  } else if (Transform.w[eid] !== size) {
    Transform.w[eid] = size
    Transform.h[eid] = size
  }
  if (Bob.amp[eid]! > 0) {
    const half = Bob.halfMs[eid]!
    const t = ((sim.fxMs - Bob.born[eid]!) % (half * 2)) / half
    VisOff.y[eid] = -Bob.amp[eid]! * sineEaseInOut(t <= 1 ? t : 2 - t)
  }
}

export function spawnCoins(sim: Sim, x: number, y: number, count: number): void {
  if (sim.over) return
  sim.out.bursts.push({ x, y, count: 6, kind: 'coin' })
  playSfx('coin')
  dropCoins(sim, x, y, count)
}
