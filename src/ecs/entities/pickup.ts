import { addComponent, addComponents, hasComponent, query, removeEntity } from 'bitecs'
import { PICKUP_BODY } from '../../data/abilities'
import { startPop } from '../utils/pop'
import { newEntity } from './entity'
import {
  Alive,
  Bob,
  Clock,
  Collected,
  Drive,
  GrantCoins,
  GrantFlash,
  GrantMod,
  Grab,
  LevelUp,
  Lifetime,
  Phys,
  Pickup,
  PickupFx,
  Pop,
  Pull,
  Radius,
  Ring,
  Span,
  Transform,
  VisOff,
} from '../components'
import { attachDrawable } from './drawable'
import { pickupDef, pickupSfx } from '../store'
import type { FieldPickupDef, Polarity } from '../../types/battlefield'
import type { SfxId } from '../../types/sfx'
import type { Sim } from '../sim'
import { UNIT } from '../../util/units'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { FIELD } from '../../data/battlefield'
import { leaderX, leaderY } from '../utils/team'
import { backEaseOut, sineEaseInOut } from '../utils/ease'

const POLARITY_COLOR: Record<Polarity, number> = {
  buff: 0x66bb6a,
  debuff: 0xef5350,
}

interface PickupSpec {
  emoji: string
  size: number
  radius: number
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
  levelUp?: boolean
}

function spawnPickup(sim: Sim, x: number, y: number, spec: PickupSpec): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Pickup, Pull, Grab, Lifetime, Phys, Drive, Clock, Alive, Radius, Span, Pop, Bob)
  Radius.v[eid] = spec.radius
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
  if (spec.popMs > 0) startPop(sim, eid, spec.popMs)
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
  if (spec.levelUp) addComponent(sim.world, eid, LevelUp)
  return eid
}


function coinSpec(): PickupSpec {
  return {
    emoji: PICKUPS.coin.emoji,
    size: PICKUPS.coin.size * UNIT,
    radius: PICKUPS.coin.radius * UNIT,
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
    radius: PICKUPS.coin.radius * UNIT,
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

/** 升级道具的光圈与指向它的箭头 */
export const LEVEL_UP_COLOR = 0x4fc3f7
/** 升级道具离队长至少这么远（格）落地：得走过去才捡得到，不会一掉就被脚下踩到 */
const LEVEL_UP_AWAY = 2

/** 升级道具：比金币大、带光圈上下跳，不吸附也不消失，和场上的增益一样只有队长走上去才捡 */
function levelUpSpec(): PickupSpec {
  const grab = FIELD.grabRadiusU * UNIT
  return {
    emoji: PICKUPS.levelUp.emoji,
    size: PICKUPS.levelUp.size * UNIT,
    radius: PICKUPS.levelUp.radius * UNIT,
    z: 7,
    magnetic: false,
    grab,
    groundMs: 0,
    popMs: 260,
    bob: 8,
    ring: { color: LEVEL_UP_COLOR, radius: grab, fillAlpha: 0.16, z: 3 },
    flash: { color: LEVEL_UP_COLOR, ms: 360 },
    fx: { burst: 14, sfx: 'levelup' },
    levelUp: true,
  }
}

/** 掉一个升级道具，叮一声提醒；离队长太近就顺着队长到它的方向推远，贴着队长时推到队长侧面 */
export function dropLevelUp(sim: Sim, x: number, y: number): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const d = sim.hooks.worldDelta(sim, lx, ly, x, y)
  const len = Math.hypot(d.x, d.y)
  const away = LEVEL_UP_AWAY * UNIT
  if (len < away) {
    const u = len > 1 ? { x: d.x / len, y: d.y / len } : { x: -sim.heading.y, y: sim.heading.x }
    x = lx + u.x * away
    y = ly + u.y * away
  }
  sim.out.bursts.push({ x, y, count: 10, kind: 'coin' })
  sim.out.sfx.push('upgrade')
  spawnPickup(sim, x, y, levelUpSpec())
}

/** 地上还没被捡起的升级道具 */
export function levelUpsOnField(sim: Sim): number[] {
  return [...query(sim.world, [Pickup, LevelUp])].filter((eid) => !hasComponent(sim.world, eid, Collected))
}

/** 收走地上所有的升级道具：一场结束时替玩家捡起 */
export function sweepLevelUps(sim: Sim): void {
  for (const eid of levelUpsOnField(sim)) {
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'coin' })
    pickupDef[eid] = undefined
    pickupSfx[eid] = undefined
    removeEntity(sim.world, eid)
  }
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
  sim.out.sfx.push('coin')
  dropCoins(sim, x, y, count)
}
