import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { sectorHitIndices } from '../../war/hit'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { Aim, Sweep, Swing } from '../components'
import { abilityOnHit } from '../store'
import { applyAbilityEffects } from './shared/effects'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 横扫：持有物绕角色扫过一段圆弧，扇形判定内每敌一次伤害；onHit 逐被扫中目标施加 */
export function castSweeps(sim: Sim): void {
  castScan(sim, Sweep, (e) => {
    const src = sourceOf(sim, e)
    const radius = Sweep.radius[e]!
    const ox = ownerX(e)
    const oy = ownerY(e)
    const list = targetsOf(sim, src)
    // 侦测门槛：扇形半径内无敌人就不出手（不空挥）
    const aim = nearestAngle(ox, oy, list, radius)
    if (aim === null) return false
    Aim.rad[e] = aim
    playSfx('whoosh')
    const damage = Math.round(Sweep.damage[e]! * damageMul(sim, e))
    const hits: number[] = []
    for (const i of sectorHitIndices({ x: ox, y: oy }, aim, Sweep.arcDeg[e]! * DEG2RAD, radius, list)) {
      damageTarget(sim, src, list[i]!.eid, damage, Sweep.knockback[e]!, ox, oy)
      hits.push(list[i]!.eid)
    }
    applyAbilityEffects(sim, src, abilityOnHit[e], { x: ox, y: oy, baseDamage: damage, targets: hits })
    Swing.startMs[e] = sim.fxMs
    Swing.durMs[e] = Sweep.sweepMs[e]!
    return true
  })
}
