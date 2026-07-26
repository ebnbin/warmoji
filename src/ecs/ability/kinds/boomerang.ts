import { addComponent, query, removeComponent, removeEntity } from 'bitecs'
import type { BoomerangDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Flyer, Tint, Transform } from '../../components'
import { spawnWeaponCopy } from '../../entities/weapon'
import { flyerHits } from '../../store'
import { damageMul, ownerX, ownerY } from '../amp'
import type { Sim } from '../../sim'

// 回旋镖：出手瞬间锁定最远点，去程飞向该点、回程追踪持有者实时位置；途中碰到的敌人
// 受伤（去程/回程各判一次）。全部接住后才开始计冷却。
// 主镖就是武器实体本身——飞行期给它挂上 Flyer，接住即摘掉，回落成握持姿态；
// 双子镖是一枚临时副本（不是武器），全靠 Flyer.of 认亲。

/** 在途镖数（主镖自己 + 它的双子） */
export function airborne(sim: Sim, e: number): number {
  let n = 0
  for (const f of query(sim.world, [Flyer])) if (Flyer.of[f] === e) n++
  return n
}

/** 掷出：主镖沿瞄准方向，双子镖朝正反两个方向 */
export function launch(sim: Sim, e: number, def: BoomerangDef, aim: number): void {
  playSfx('whoosh')
  const damage = Math.round(def.damage * damageMul(sim, e))
  const ox = ownerX(e)
  const oy = ownerY(e)
  const count = def.twin ? 2 : 1
  for (let i = 0; i < count; i++) {
    const angle = aim + i * Math.PI
    const f = i === 0 ? e : spawnWeaponCopy(sim, e) // 主镖就是武器自己，双子是它的分身
    addComponent(sim.world, f, Flyer)
    Flyer.of[f] = e
    Flyer.phase[f] = 0
    Flyer.t[f] = 0
    Flyer.launchX[f] = ox
    Flyer.launchY[f] = oy
    Flyer.destX[f] = ox + Math.cos(angle) * def.range
    Flyer.destY[f] = oy + Math.sin(angle) * def.range
    Flyer.damage[f] = damage
    Transform.x[f] = ox
    Transform.y[f] = oy
    Tint.alpha[f] = 1
    flyerHits[f] = new Set()
  }
}

/** 收镖：主镖（= 武器本身）摘掉 Flyer 回落成握持姿态，双子镖直接离场 */
export function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  if (f === e) removeComponent(sim.world, f, Flyer)
  else removeEntity(sim.world, f)
}

