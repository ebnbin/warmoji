import { query } from 'bitecs'
import { DEG2RAD } from '../../../core/units'
import type { LaserDef } from '../../../data/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../../war/hit'
import { Tint, Transform } from '../../components'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Frozen, Gear, Radial } from '../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindLaser } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 贯穿激光：向最近敌人发射光束，线段胶囊判定打穿直线上所有敌人。
 * backBeam 正后方补一道；radial 出手改为绕一周的多向序列扫射（取代常规单束） */
export function castLasers(sim: Sim): void {
  placeLaserGear(sim)
  fireRadials(sim)
  castScan<LaserDef>(sim, KindLaser, (e, def) => {
    if (Radial.left[e]! > 0) return false // 扫射在途：本轮不另起
    const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), def.range)
    if (aim === null) return false // 最近敌人在射程内才开火
    Aim.rad[e] = aim
    if (def.radial) {
      // 从瞄准角起步，逐束旋转铺满 360°；首束下一帧兑现
      Radial.left[e] = def.radial.beams
      Radial.nextAt[e] = sim.elapsedMs
      Radial.angle[e] = aim
      return true
    }
    fireBeam(sim, e, def, aim, 1)
    if (def.backBeam) fireBeam(sim, e, def, aim + Math.PI, 1)
    return true
  })
}

/** 全域扫射：按时序逐束兑现，跟随角色实时位置；持有者倒下即作废 */
function fireRadials(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindLaser, Radial])) {
    if (Radial.left[e]! <= 0) continue
    if (Frozen.v[e]) {
      Radial.left[e] = 0
      continue
    }
    const def = abilityDefAt(AbilityRef.def[e]!) as LaserDef
    if (!def.radial) continue
    while (Radial.left[e]! > 0 && Radial.nextAt[e]! <= sim.elapsedMs) {
      const angle = Radial.angle[e]!
      Aim.rad[e] = angle
      fireBeam(sim, e, def, angle, def.radial.ratio)
      Radial.left[e] = Radial.left[e]! - 1
      Radial.angle[e] = angle + (2 * Math.PI) / def.radial.beams
      Radial.nextAt[e] = Radial.nextAt[e]! + def.radial.stepMs
    }
  }
}

/** 发射一束：胶囊判定 + 光束特效（ratio 折损用于扫射分束） */
function fireBeam(sim: Sim, e: number, def: LaserDef, angle: number, ratio: number): void {
  const src = sourceOf(sim, e)
  playSfx('zap')
  const damage = Math.max(1, Math.round(def.damage * damageMul(sim, e) * ratio))
  const ox = ownerX(e)
  const oy = ownerY(e)
  const list = targetsOf(sim, src)
  for (const i of thrustHitIndices({ x: ox, y: oy }, angle, def.range, def.beamRadius, list)) {
    damageTarget(sim, src, list[i]!.eid, damage, def.knockback, ox, oy)
  }
  sim.pendingCues.push({
    kind: 'beam',
    x: ox,
    y: oy,
    angle,
    length: def.range,
    radius: def.beamRadius,
    color: def.color,
  })
}

/** 摆位：持有物定身指向瞄准方向 */
function placeLaserGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindLaser, Gear, Aim])) {
    const g = Gear.eid[e]!
    if (g === 0) continue
    const held = (abilityDefAt(AbilityRef.def[e]!) as LaserDef).held
    const aim = Aim.rad[e]!
    Transform.x[g] = ownerX(e) + Math.cos(aim) * held.restOffset
    Transform.y[g] = ownerY(e) + Math.sin(aim) * held.restOffset
    Transform.rot[g] = aim + held.rotationOffsetDeg * DEG2RAD
    Tint.alpha[g] = Frozen.v[e] ? 0 : 1
  }
}
