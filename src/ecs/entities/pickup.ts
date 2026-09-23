import { addComponent, addComponents, hasComponent, query } from 'bitecs'
import { newEntity } from './entity'
import {
  Bob,
  GrantCoins,
  GrantFlash,
  GrantMod,
  Enemy,
  Grab,
  Lifetime,
  Magnet,
  Pickup,
  PICKUP_SET,
  PickupFx,
  Pop,
  Pull,
  Ring,
  Transform,
  Vel,
} from '../components'
import { attachDrawable } from './drawable'
import { enemyCarries, pickupDef, pickupSfx } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { SfxId } from '../../types/sfx'
import type { Sim } from '../sim'
import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { FIELD, POLARITY_COLOR } from '../../data/battlefield'
import { backEaseOut } from '../utils/ease'


export interface PickupSpec {
  emoji: string
  /** 显示尺寸(px) */
  size: number
  z: number
  /** 磁吸半径(px);0 = 不磁吸 */
  pull: number
  /** 拾取半径(px) */
  grab: number
  /** 地面停留(ms);0 = 永不过期 */
  groundMs: number
  /** 入场弹出时长(ms);0 = 无 */
  popMs: number
  /** 待拾缓浮幅度(px);0 = 不浮 */
  bob: number
  /** 省略即无圈；radius 应与 grab 同值 */
  ring?: { color: number; radius: number; fillAlpha: number; z: number }
  def?: FieldPickupDef
  // ── 到手效果：各自对应一个组件，都不给也合法 ──
  coins?: number
  /** 用 def */
  mod?: boolean
  flash?: { color: number; ms: number }
  fx?: { burst: number; sfx: SfxId }
}

/** 落点先过世界钩子 */
export function spawnPickup(sim: Sim, x: number, y: number, spec: PickupSpec): number {
  const p = sim.hooks.constrainCoin(sim, x, y)
  const eid = newEntity(sim.world)
  // Bob 恒挂，amp = 0 即不浮
  addComponents(sim.world, eid, Pickup, Pull, Grab, Lifetime, Vel, Pop, Bob)
  attachDrawable(sim.world, eid, sim.frames, {
    id: spec.emoji,
    outline: 'player',
    x: p.x,
    y: p.y,
    size: spec.size,
    z: spec.z,
  })
  Pickup.bornMs[eid] = sim.elapsedMs
  Pull.radius[eid] = spec.pull
  Grab.radius[eid] = spec.grab
  Lifetime.until[eid] = spec.groundMs > 0 ? sim.elapsedMs + spec.groundMs : 0
  Vel.x[eid] = 0
  Vel.y[eid] = 0
  Pop.until[eid] = spec.popMs > 0 ? sim.fxMs + spec.popMs : 0
  Pop.ms[eid] = spec.popMs
  Pop.size[eid] = spec.size
  Pop.back[eid] = 1
  Pop.alpha[eid] = 1
  Bob.y0[eid] = p.y
  Bob.amp[eid] = spec.bob
  Bob.halfMs[eid] = 620
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

// ── 掉落 ──────────────────────────────────────────────────


function coinSpec(sim: Sim): PickupSpec {
  return {
    emoji: PICKUPS.coin.emoji,
    size: PICKUPS.coin.size * UNIT,
    z: 3,
    pull: Magnet.radius[sim.captain]!,
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
    pull: 0,
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
  const spec = coinSpec(sim)
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
  Ring.lineAlpha[eid] = 0.9
  Ring.lineWidth[eid] = 3
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 4
  Ring.breathe[eid] = 1
}


/** 走视觉钟 */
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
    // 光圈按 -off 抵消，贴在落点
    const t = (sim.fxMs % (Bob.halfMs[eid]! * 2)) / Bob.halfMs[eid]!
    const off = -Bob.amp[eid]! * (t <= 1 ? t : 2 - t)
    Transform.y[eid] = Bob.y0[eid]! + off
    Ring.dy[eid] = -off
  }
}

export function pickupCounts(sim: Sim): { pickups: number; carriers: number } {
  let pickups = 0
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (hasComponent(sim.world, eid, GrantMod)) pickups++
  }
  let carriers = 0
  for (const eid of query(sim.world, [Enemy])) {
    if (enemyCarries[eid] !== undefined) carriers++
  }
  return { pickups, carriers }
}

export function spawnCoins(sim: Sim, x: number, y: number, count: number): void {
  if (sim.over) return
  sim.out.bursts.push({ x, y, count: 6, kind: 'coin' })
  playSfx('coin')
  dropCoins(sim, x, y, count)
}
