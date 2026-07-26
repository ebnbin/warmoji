import { blastAt } from '../ability/kinds/areaBlast'
import type { AreaBlastDef } from '../../types/abilityDefs'
import { damageMul, ownerX, ownerY } from '../ability/amp'
import { Followup } from '../components'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindAreaBlast } from '../ability/tags'
import { nearestTarget, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 远程范围轰炸：在侦测范围内以最近敌人为爆心，对爆心圆内所有敌人各一次伤害。
 * echo 连锁：主炸后延迟一段向索敌上限内的随机敌人再补一发折损轰炸 */
export function castAreaBlasts(sim: Sim): void {
  castScan<AreaBlastDef>(sim, KindAreaBlast, (e, def) => {
    const src = sourceOf(sim, e)
    const center = nearestTarget(ownerX(e), ownerY(e), targetsOf(sim, src), def.detectRange)
    if (!center) return false // 侦测范围内无敌人就不出手
    const damage = Math.round(def.damage * damageMul(sim, e))
    blastAt(sim, e, def, center.x, center.y, damage)
    if (def.echo) {
      Followup.left[e] = def.echo.delayMs
      Followup.damage[e] = Math.max(1, Math.round(damage * def.echo.ratio))
    }
    return true
  })
}
