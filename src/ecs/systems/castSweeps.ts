import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { sectorHitIndices } from '../utils/hit'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { Aim, Sweep, Swing } from '../components'
import { abilityOnHit } from '../store'
import { applyAbilityEffects } from './shared/effects'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsNear } from '../utils/targets'
import type { Sim } from '../sim'

export function castSweeps(sim: Sim): void {
  castScan(sim, Sweep, (e) => {
    const src = sourceOf(sim, e)
    const radius = Sweep.radius[e]!
    const ox = ownerX(e)
    const oy = ownerY(e)
    const aim = nearestAngle(sim, src, ox, oy, radius)
    if (aim === null) return false
    const list = targetsNear(sim, src, ox, oy, radius)
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
