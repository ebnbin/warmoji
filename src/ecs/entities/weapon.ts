import { addComponent, addComponents, hasComponent, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { DEG2RAD } from '../../util/units'
import type { HeldVisual } from '../../types/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { attachDrawable } from './drawable'
import {
  Boomerang,
  BoomerangTwin,
  Boss,
  Depth,
  Elite,
  FACTION,
  Flyer,
  Held,
  Quad,
  Sprite,
  Thrown,
  Tint,
  Transform,
  VisOff,
  Weapon,
} from '../components'
import type { Sim } from '../sim'
import { playSfx } from '../../audio/sfx'
import { flyerHits } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'


export function holderOutline(faction: number, holderEid: number): OutlineKind {
  return faction === FACTION.enemy ? (Elite.v[holderEid] || Boss.v[holderEid] ? 'elite' : 'enemy') : 'player'
}

export function spawnWeaponBody(sim: Sim, holderEid: number, held: HeldVisual, faction: number): number {
  const world = sim.world
  const e = newEntity(world)
  addComponent(world, e, Weapon)
  const outline = holderOutline(faction, holderEid)
  attachDrawable(world, e, sim.frames, {
    id: held.emoji,
    outline,
    x: Transform.x[holderEid]!,
    y: Transform.y[holderEid]!,
    size: held.size,
    z: 13,
  })
  addComponent(world, e, Held)
  Held.restOffset[e] = held.restOffset
  Held.rotOffset[e] = held.rotationOffsetDeg * DEG2RAD
  Held.side[e] = held.mountSide ?? 0
  Held.gap[e] = held.mountGap ?? 0
  Held.size[e] = held.size
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
  Depth.z[t] = 13
  Quad.v[t] = 0
  return t
}

export function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  removeEntity(sim.world, f)
  Thrown.n[e] = Math.max(0, Thrown.n[e]! - 1)
}

export function launch(sim: Sim, e: number, aim: number): void {
  playSfx('whoosh')
  const damage = Math.round(Boomerang.damage[e]! * damageMul(sim, e))
  const range = Boomerang.range[e]!
  const ox = ownerX(e)
  const oy = ownerY(e)
  const count = hasComponent(sim.world, e, BoomerangTwin) ? 2 : 1
  Thrown.n[e] = count
  for (let i = 0; i < count; i++) {
    const angle = aim + i * Math.PI
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
}
