import { addComponent, hasComponent, query, removeComponent, removeEntity } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import type { BoomerangDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Tint, Transform } from '../../components'
import { spawnWeaponCopy } from '../../entities/weapon'
import { flyerHits } from '../../store'
import { cooldownMul, damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Cooldown, Flyer, Frozen, Held } from '../../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../castScan'
import { KindBoomerang } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

// 回旋镖：出手瞬间锁定最远点，去程飞向该点、回程追踪持有者实时位置；途中碰到的敌人
// 受伤（去程/回程各判一次）。全部接住后才开始计冷却。
// 主镖就是武器实体本身——飞行期给它挂上 Flyer，接住即摘掉，回落成握持姿态；
// 双子镖是一枚临时副本（不是武器），全靠 Flyer.of 认亲。

/** 每帧：推进在途的镖 + 摆位闲置的持有物 */
export function castBoomerangs(sim: Sim): void {
  const dt = sim.wdtMs
  updateFlyers(sim, dt)
  placeIdleBoomerangs(sim)
  castScan<BoomerangDef>(sim, KindBoomerang, (e, def) => {
    if (airborne(sim, e) > 0) return false // 还没接住：不另起，也不消耗冷却
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, def, aim)
    return false // 冷却待全部接住后才开始计
  })
}

/** 在途镖数（主镖自己 + 它的双子） */
function airborne(sim: Sim, e: number): number {
  let n = 0
  for (const f of query(sim.world, [Flyer])) if (Flyer.of[f] === e) n++
  return n
}

/** 掷出：主镖沿瞄准方向，双子镖朝正反两个方向 */
function launch(sim: Sim, e: number, def: BoomerangDef, aim: number): void {
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

/** 推进：自旋 + 去程缓动 / 回程追人 + 途中判伤 + 磁力吸币 */
function updateFlyers(sim: Sim, dt: number): void {
  for (const f of [...query(sim.world, [Flyer, Transform])]) {
    if (!hasComponent(sim.world, f, Flyer)) continue // 另一枚命中时连带回收了它
    const e = Flyer.of[f]!
    const def = abilityDefAt(AbilityRef.def[e]!) as BoomerangDef
    if (Frozen.v[e]) {
      // 持有者倒下：在途的镖一并作废，冷却按裸值重置
      catchFlyer(sim, e, f)
      Cooldown.left[e] = def.cooldownMs
      continue
    }
    Transform.rot[f] = Transform.rot[f]! + (def.spinDegPerSec * DEG2RAD * dt) / 1000
    if (Flyer.phase[f] === 0) {
      Flyer.t[f] = Math.min(1, Flyer.t[f]! + dt / def.outMs)
      const ease = Math.sin((Flyer.t[f]! * Math.PI) / 2)
      Transform.x[f] = Flyer.launchX[f]! + (Flyer.destX[f]! - Flyer.launchX[f]!) * ease
      Transform.y[f] = Flyer.launchY[f]! + (Flyer.destY[f]! - Flyer.launchY[f]!) * ease
      if (Flyer.t[f]! >= 1) {
        Flyer.phase[f] = 1
        flyerHits[f]!.clear()
      }
    } else {
      const dx = ownerX(e) - Transform.x[f]!
      const dy = ownerY(e) - Transform.y[f]!
      const dist = Math.hypot(dx, dy)
      const step = (def.returnSpeed * dt) / 1000
      if (dist <= Math.max(step, 20)) {
        catchFlyer(sim, e, f)
        if (airborne(sim, e) === 0) Cooldown.left[e] = def.cooldownMs * cooldownMul(sim, e)
        continue
      }
      Transform.x[f] = Transform.x[f]! + (dx / dist) * step
      Transform.y[f] = Transform.y[f]! + (dy / dist) * step
    }
    if (def.coinMagnetRadius) {
      const r = def.coinMagnetRadius
      sim.frameAttractors.push({ x: Transform.x[f]!, y: Transform.y[f]!, r2: r * r })
    }
    const hits = flyerHits[f]!
    const src = sourceOf(sim, e)
    for (const t of targetsOf(sim, src)) {
      if (hits.has(t.eid)) continue
      const dx = t.x - Transform.x[f]!
      const dy = t.y - Transform.y[f]!
      const rr = def.hitRadius + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      hits.add(t.eid)
      damageTarget(sim, src, t.eid, Flyer.damage[f]!, def.knockback, Transform.x[f]!, Transform.y[f]!)
    }
  }
}

/** 收镖：主镖（= 武器本身）摘掉 Flyer 回落成握持姿态，双子镖直接离场 */
function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  if (f === e) removeComponent(sim.world, f, Flyer)
  else removeEntity(sim.world, f)
}

/** 摆位：不在途的镖握在角色手上 */
function placeIdleBoomerangs(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindBoomerang, Aim, Held, Transform])) {
    if (hasComponent(sim.world, e, Flyer)) continue
    const aim = Aim.rad[e]!
    Transform.x[e] = ownerX(e) + Math.cos(aim) * Held.restOffset[e]!
    Transform.y[e] = ownerY(e) + Math.sin(aim) * Held.restOffset[e]!
    Transform.rot[e] = aim + Held.rotOffset[e]!
    Tint.alpha[e] = Frozen.v[e] ? 0 : 1
  }
}
