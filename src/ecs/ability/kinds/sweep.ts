import { query } from 'bitecs'
import { DEG2RAD } from '../../../core/units'
import type { SweepDef } from '../../../data/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { sectorHitIndices } from '../../../war/abilities/hit'
import { Tint, Transform } from '../../components'
import { sineEaseInOut } from '../../ease'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Frozen, Gear, Swing } from '../components'
import { abilityDefAt } from '../defs'
import { applyAbilityEffects } from '../effects'
import { castScan } from '../systems/cast'
import { KindSweep } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 横扫：持有物绕角色扫过一段圆弧，扇形判定内每敌一次伤害；onHit 逐被扫中目标施加 */
export function castSweeps(sim: Sim): void {
  placeSweepGear(sim)
  castScan<SweepDef>(sim, KindSweep, (e, def) => {
    const ox = ownerX(e)
    const oy = ownerY(e)
    const list = targetsOf(sim, e)
    // 侦测门槛：扇形半径内无敌人就不出手（不空挥）
    const aim = nearestAngle(ox, oy, list, def.radius)
    if (aim === null) return false
    Aim.rad[e] = aim
    playSfx('whoosh')
    const damage = Math.round(def.damage * damageMul(sim, e))
    const hits: number[] = []
    for (const i of sectorHitIndices({ x: ox, y: oy }, aim, def.arcDeg * DEG2RAD, def.radius, list)) {
      damageTarget(sim, e, list[i]!.eid, damage, def.knockback, ox, oy)
      hits.push(list[i]!.eid)
    }
    applyAbilityEffects(sim, e, def.onHit, { x: ox, y: oy, baseDamage: damage, targets: hits })
    Swing.startMs[e] = sim.fxMs
    Swing.durMs[e] = def.sweepMs
    return true
  })
}

/** 摆位：持有物在瞄准方向两侧的弧上从一端扫到另一端，静止时停在末端 */
function placeSweepGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindSweep, Gear, Aim, Swing])) {
    const g = Gear.eid[e]!
    if (g === 0) continue
    const def = abilityDefAt(AbilityRef.def[e]!) as SweepDef
    const frozen = Frozen.v[e] === 1
    if (frozen) Swing.durMs[e] = 0
    const angle = Aim.rad[e]! + (sweepT(sim, e, def.sweepMs) * def.arcDeg * DEG2RAD) / 2
    Transform.x[g] = ownerX(e) + Math.cos(angle) * def.held.restOffset
    Transform.y[g] = ownerY(e) + Math.sin(angle) * def.held.restOffset
    Transform.rot[g] = angle + def.held.rotationOffsetDeg * DEG2RAD
    Tint.alpha[g] = frozen ? 0 : 1
  }
}

/** 扫掠进度 -1→1（Sine.easeInOut）：从弧的一端扫到另一端，扫完停在 1 */
function sweepT(sim: Sim, e: number, sweepMs: number): number {
  if (Swing.durMs[e] === 0 || sweepMs <= 0) return 1
  const p = (sim.fxMs - Swing.startMs[e]!) / sweepMs
  if (p >= 1) return 1
  return -1 + 2 * sineEaseInOut(p)
}
