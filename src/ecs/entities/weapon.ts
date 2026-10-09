import { addComponent, addComponents, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { DEG2RAD } from '../../util/units'
import type { HeldVisual } from '../../types/abilityDefs'
import { attachDrawable } from './drawable'
import {
  Boss,
  Depth,
  Elite,
  FACTION,
  Flyer,
  FlyerShape,
  Held,
  Mounted,
  Quad,
  Sprite,
  Thrown,
  Tint,
  TINT_SIDE,
  Transform,
  VisOff,
} from '../components'
import type { TintSide } from '../components'
import type { Sim } from '../sim'
import { flyerHits } from '../store'
import { anchorX, anchorY } from '../utils/ability'

export function holderSide(faction: number, holderEid: number): TintSide {
  if (faction !== FACTION.enemy) return TINT_SIDE.team
  return Boss.v[holderEid] ? TINT_SIDE.boss : Elite.v[holderEid] ? TINT_SIDE.elite : TINT_SIDE.none
}

export function spawnWeaponBody(sim: Sim, holderEid: number, held: HeldVisual, faction: number): number {
  const world = sim.world
  const e = newEntity(world)
  attachDrawable(world, e, sim.frames, {
    id: held.look.emoji,
    side: holderSide(faction, holderEid),
    x: Transform.x[holderEid]!,
    y: Transform.y[holderEid]!,
    size: held.look.size,
    z: 13,
  })
  addComponents(world, e, Held, Mounted)
  Mounted.host[e] = holderEid
  Mounted.show[e] = 1
  Held.restOffset[e] = held.restOffset
  Held.rotOffset[e] = (held.look.rotationOffsetDeg ?? 0) * DEG2RAD
  Held.side[e] = held.mountSide ?? 0
  Held.gap[e] = held.mountGap ?? 0
  Held.size[e] = held.look.size
  return e
}

function spawnFlyerBody(sim: Sim, weaponEid: number): number {
  const t = newEntity(sim.world)
  addComponents(sim.world, t, Transform, Sprite, Tint, Depth, VisOff, Quad)
  const size = Held.size[weaponEid]!
  Transform.x[t] = Transform.x[weaponEid]!
  Transform.y[t] = Transform.y[weaponEid]!
  Transform.rot[t] = Transform.rot[weaponEid]!
  Transform.w[t] = size
  Transform.h[t] = size
  Sprite.frame[t] = Sprite.frame[weaponEid]!
  Sprite.flipX[t] = 0
  Tint.color[t] = 0xffffff
  Tint.effect[t] = 0
  Tint.alpha[t] = 1
  Tint.side[t] = Tint.side[weaponEid]!
  Depth.z[t] = 13
  Quad.v[t] = 0
  return t
}

export function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  removeEntity(sim.world, f)
  Thrown.n[e] = Math.max(0, Thrown.n[e]! - 1)
}

/** 掷出一枚飞返体：飞到射程尽头再飞回持有者 */
export function launch(sim: Sim, e: number, angle: number, damage: number): void {
  const range = FlyerShape.range[e]!
  const ox = anchorX(e)
  const oy = anchorY(e)
  Thrown.n[e] = Thrown.n[e]! + 1
  const f = spawnFlyerBody(sim, e)
  addComponent(sim.world, f, Flyer)
  Flyer.of[f] = e
  Flyer.phase[f] = 0
  Flyer.t[f] = 0
  Flyer.launchX[f] = ox
  Flyer.launchY[f] = oy
  Flyer.destX[f] = ox + Math.cos(angle) * range
  Flyer.destY[f] = oy + Math.sin(angle) * range
  Flyer.damage[f] = damage
  Transform.x[f] = ox
  Transform.y[f] = oy
  Tint.alpha[f] = 1
  flyerHits[f] = new Set()
}
