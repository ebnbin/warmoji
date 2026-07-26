import { blastAt } from '../ops/areaBlast'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { hasComponent } from 'bitecs'
import { AreaBlast, BlastEcho, Followup } from '../components'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { nearestTarget, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 远程范围轰炸：在侦测范围内以最近敌人为爆心，对爆心圆内所有敌人各一次伤害。
 * echo 连锁：主炸后延迟一段向索敌上限内的随机敌人再补一发折损轰炸 */
export function castAreaBlasts(sim: Sim): void {
  castScan(sim, AreaBlast, (e) => {
    const src = sourceOf(sim, e)
    const center = nearestTarget(ownerX(e), ownerY(e), targetsOf(sim, src), AreaBlast.detectRange[e]!)
    if (!center) return false // 侦测范围内无敌人就不出手
    const damage = Math.round(AreaBlast.damage[e]! * damageMul(sim, e))
    blastAt(sim, e, center.x, center.y, damage)
    if (hasComponent(sim.world, e, BlastEcho)) {
      Followup.left[e] = BlastEcho.delayMs[e]!
      Followup.damage[e] = Math.max(1, Math.round(damage * BlastEcho.ratio[e]!))
    }
    return true
  })
}
