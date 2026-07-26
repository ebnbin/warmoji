import { addComponent, hasComponent, query, removeComponent, removeEntity } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import type { BoomerangDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Sprite, Tint, Transform } from '../../components'
import { spawnSprite } from '../../entities/sprite'
import { flyerHits } from '../../store'
import { cooldownMul, damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Cooldown, FACTION, Faction, Flyer, Frozen, Gear, Owner } from '../../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindBoomerang } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

// 回旋镖：出手瞬间锁定最远点，去程飞向该点、回程追踪持有者实时位置；途中碰到的敌人
// 受伤（去程/回程各判一次）。全部接住后才开始计冷却。
// 主镖就是持有物实体本身——飞行期给它挂上 Flyer，接住即摘掉，回落成持有物姿态。

/** 每帧：推进在途的镖 + 摆位闲置的持有物 */
export function castBoomerangs(sim: Sim, dt: number): void {
  updateFlyers(sim, dt)
  placeBoomerangGear(sim)
  castScan<BoomerangDef>(sim, KindBoomerang, (e, def) => {
    if (airborne(sim, e) > 0) return false // 还没接住：不另起，也不消耗冷却
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)))
    if (aim === null) return false
    Aim.rad[e] = aim
    launch(sim, e, def, aim)
    return false // 冷却待全部接住后才开始计
  })
}

/** 在途镖数 */
function airborne(sim: Sim, e: number): number {
  let n = 0
  for (const f of query(sim.world, [Flyer, Owner])) if (Owner.eid[f] === e) n++
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
    const f = i === 0 ? Gear.eid[e]! : spawnTwin(sim, e, def)
    addComponent(sim.world, f, Flyer)
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

/** 双子镖：只在飞行中存在的第二枚 */
function spawnTwin(sim: Sim, e: number, def: BoomerangDef): number {
  const g = Gear.eid[e]!
  const t = spawnSprite(sim.world, sim.frames, {
    id: def.held.emoji,
    outline: Faction.v[e] === FACTION.enemy ? 'enemy' : 'player',
    x: Transform.x[g]!,
    y: Transform.y[g]!,
    size: def.held.size,
    z: 13,
  })
  Sprite.frame[t] = Sprite.frame[g]! // 与主镖同一变体（描边随持有者）
  addComponent(sim.world, t, Owner)
  Owner.eid[t] = e
  return t
}

/** 推进：自旋 + 去程缓动 / 回程追人 + 途中判伤 + 磁力吸币 */
function updateFlyers(sim: Sim, dt: number): void {
  for (const f of [...query(sim.world, [Flyer, Owner, Transform])]) {
    if (!hasComponent(sim.world, f, Flyer)) continue // 另一枚命中时连带回收了它
    const e = Owner.eid[f]!
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

/** 收镖：主镖摘掉 Flyer 回落成持有物，双子镖直接离场 */
function catchFlyer(sim: Sim, e: number, f: number): void {
  flyerHits[f] = undefined
  if (f === Gear.eid[e]) removeComponent(sim.world, f, Flyer)
  else removeEntity(sim.world, f)
}

/** 摆位：闲置的主镖当持有物挂在角色身上 */
function placeBoomerangGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindBoomerang, Gear, Aim])) {
    const g = Gear.eid[e]!
    if (g === 0 || hasComponent(sim.world, g, Flyer)) continue
    const held = (abilityDefAt(AbilityRef.def[e]!) as BoomerangDef).held
    const aim = Aim.rad[e]!
    Transform.x[g] = ownerX(e) + Math.cos(aim) * held.restOffset
    Transform.y[g] = ownerY(e) + Math.sin(aim) * held.restOffset
    Transform.rot[g] = aim + held.rotationOffsetDeg * DEG2RAD
    Tint.alpha[g] = Frozen.v[e] ? 0 : 1
  }
}
