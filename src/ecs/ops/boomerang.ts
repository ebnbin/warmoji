import { addComponent, removeComponent, removeEntity } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { hasComponent } from 'bitecs'
import { Boomerang, BoomerangTwin, Flyer, Tint, Transform } from '../components'
import { spawnWeaponCopy } from '../entities/weapon'
import { flyerHits } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

/** 收镖：主镖（= 武器本身）摘掉 Flyer 回落成握持姿态，双子镖直接离场 */
export function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  if (f === e) removeComponent(sim.world, f, Flyer)
  else removeEntity(sim.world, f)
}

/** 掷出：主镖沿瞄准方向，双子镖朝正反两个方向 */
export function launch(sim: Sim, e: number, aim: number): void {
  playSfx('whoosh')
  const damage = Math.round(Boomerang.damage[e]! * damageMul(sim, e))
  const range = Boomerang.range[e]!
  const ox = ownerX(e)
  const oy = ownerY(e)
  const count = hasComponent(sim.world, e, BoomerangTwin) ? 2 : 1
  for (let i = 0; i < count; i++) {
    const angle = aim + i * Math.PI
    const f = i === 0 ? e : spawnWeaponCopy(sim, e) // 主镖就是武器自己，双子是它的分身
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
