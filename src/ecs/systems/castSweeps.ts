import { DEG2RAD } from '../../util/units'
import type { SweepDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { sectorHitIndices } from '../../war/hit'
import { damageMul, damageTarget, ownerX, ownerY } from '../ability/amp'
import { Aim, Swing } from '../components'
import { applyAbilityEffects } from '../ability/effects'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindSweep } from '../ability/tags'
import { nearestAngle, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 横扫：持有物绕角色扫过一段圆弧，扇形判定内每敌一次伤害；onHit 逐被扫中目标施加 */
export function castSweeps(sim: Sim): void {
  castScan<SweepDef>(sim, KindSweep, (e, def) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const list = targetsOf(sim, src)
    // 侦测门槛：扇形半径内无敌人就不出手（不空挥）
    const aim = nearestAngle(ox, oy, list, def.radius)
    if (aim === null) return false
    Aim.rad[e] = aim
    playSfx('whoosh')
    const damage = Math.round(def.damage * damageMul(sim, e))
    const hits: number[] = []
    for (const i of sectorHitIndices({ x: ox, y: oy }, aim, def.arcDeg * DEG2RAD, def.radius, list)) {
      damageTarget(sim, src, list[i]!.eid, damage, def.knockback, ox, oy)
      hits.push(list[i]!.eid)
    }
    applyAbilityEffects(sim, src, def.onHit, { x: ox, y: oy, baseDamage: damage, targets: hits })
    Swing.startMs[e] = sim.fxMs
    Swing.durMs[e] = def.sweepMs
    return true
  })
}
