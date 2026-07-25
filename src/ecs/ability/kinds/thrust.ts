import { query } from 'bitecs'
import { DEG2RAD } from '../../../core/units'
import type { ThrustDef } from '../../../data/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../../war/abilities/hit'
import { Tint, Transform, VisOff } from '../../components'
import { sineEaseOut } from '../../ease'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Followup, Frozen, Gear, Owner, Swing } from '../components'
import { abilityDefAt } from '../defs'
import { applyAbilityEffects } from '../effects'
import { castScan } from '../systems/cast'
import { KindThrust } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 突刺：held 时持有物挥出收回，无 held 时角色本体前冲收回；胶囊判定内每敌一次伤害。
 * combo 二连突：主刺后隔一段重新索敌再刺一段（不吃冷却）；onHit 施加在突刺终点 */
export function castThrusts(sim: Sim, dt: number): void {
  placeThrustGear(sim)
  tickCombos(sim, dt)
  castScan<ThrustDef>(sim, KindThrust, (e, def) => {
    if (Followup.left[e]! > 0) return false // 二连突在途：本轮不另起
    // 侦测门槛：射程内无敌人就不出手（不空刺）
    if (nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, e), reachOf(def)) === null) return false
    strike(sim, e, def)
    if (def.combo) Followup.left[e] = def.combo.delayMs
    return true
  })
}

/** 攻击索敌上限：只打得到射程内的敌人才挥 */
function reachOf(def: ThrustDef): number {
  return def.reach + def.hitRadius
}

/** 二连突的第二段：与冷却同口径推进，到点重新索敌再刺一次 */
function tickCombos(sim: Sim, dt: number): void {
  for (const e of query(sim.world, [Ability, KindThrust, Followup])) {
    if (Followup.left[e]! <= 0 || Frozen.v[e]) continue
    Followup.left[e] = Followup.left[e]! - dt
    if (Followup.left[e]! > 0) continue
    Followup.left[e] = 0
    strike(sim, e, abilityDefAt(AbilityRef.def[e]!) as ThrustDef)
  }
}

/** 单段突刺：索敌 → 胶囊判定 → 终点命中效果 → 起一段挥击动画 */
function strike(sim: Sim, e: number, def: ThrustDef): void {
  const ox = ownerX(e)
  const oy = ownerY(e)
  const list = targetsOf(sim, e)
  const aim = nearestAngle(ox, oy, list, reachOf(def))
  if (aim === null) return
  Aim.rad[e] = aim
  playSfx('whoosh')
  const damage = Math.round(def.damage * damageMul(sim, e))
  for (const i of thrustHitIndices({ x: ox, y: oy }, aim, def.reach, def.hitRadius, list)) {
    damageTarget(sim, e, list[i]!.eid, damage, def.knockback, ox, oy)
  }
  applyAbilityEffects(sim, e, def.onHit, {
    x: ox + Math.cos(aim) * def.reach,
    y: oy + Math.sin(aim) * def.reach,
    baseDamage: damage,
  })
  Swing.startMs[e] = sim.fxMs
  Swing.durMs[e] = def.thrustMs
}

/** 摆位：持有物沿瞄准方向挥出收回；无持有物则改推角色本体的视觉偏移 */
function placeThrustGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindThrust, Gear, Aim, Swing])) {
    const def = abilityDefAt(AbilityRef.def[e]!) as ThrustDef
    const frozen = Frozen.v[e] === 1
    if (frozen) {
      // 阵亡即收势：动画归零、二连突作废（持有视觉不该悬在尸体上）
      Swing.durMs[e] = 0
      Followup.left[e] = 0
    }
    const t = frozen ? 0 : lungeT(sim, e, def.thrustMs)
    const g = Gear.eid[e]!
    if (g !== 0) {
      const held = def.held!
      const aim = Aim.rad[e]!
      const dist = held.restOffset + t * (def.reach - held.restOffset)
      Transform.x[g] = ownerX(e) + Math.cos(aim) * dist
      Transform.y[g] = ownerY(e) + Math.sin(aim) * dist
      Transform.rot[g] = aim + held.rotationOffsetDeg * DEG2RAD
      Tint.alpha[g] = frozen ? 0 : 1
      continue
    }
    const m = Owner.eid[e]!
    VisOff.x[m] = Math.cos(Aim.rad[e]!) * t * def.lungeDist
    VisOff.y[m] = Math.sin(Aim.rad[e]!) * t * def.lungeDist
  }
}

/** 挥击进度 0→1→0：去回各半程，两程都走 Sine.easeOut（镜像 yoyo 缓动） */
function lungeT(sim: Sim, e: number, thrustMs: number): number {
  const half = thrustMs / 2
  if (Swing.durMs[e] === 0 || half <= 0) return 0
  const p = (sim.fxMs - Swing.startMs[e]!) / half
  if (p >= 2) return 0
  return sineEaseOut(p <= 1 ? p : 2 - p)
}
