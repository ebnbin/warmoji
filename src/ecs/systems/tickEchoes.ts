import { query } from 'bitecs'
import { blastAt } from '../ability/kinds/areaBlast'
import type { AreaBlastDef } from '../../types/abilityDefs'
import { ACQUIRE } from '../../data/abilities'
import { UNIT } from '../../util/units'
import { ownerX, ownerY } from '../ability/amp'
import { Ability, AbilityRef, Followup, Frozen } from '../components'
import { abilityDefAt } from '../ability/defs'
import { sourceOf } from '../ability/source'
import { KindAreaBlast } from '../ability/tags'
import { targetsOf, targetsWithin } from '../ability/targets'
import type { Sim } from '../sim'

/** 后手轰炸的倒计时：与冷却同口径，只在未冻结时推进 */
export function tickEchoes(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, KindAreaBlast, Followup])) {
    if (Followup.left[e]! <= 0 || Frozen.v[e]) continue
    Followup.left[e] = Followup.left[e]! - dt
    if (Followup.left[e]! > 0) continue
    Followup.left[e] = 0
    // 落点取索敌上限内的随机敌人：无限地图上不能轰到无穷远
    const near = targetsWithin(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), ACQUIRE.range * UNIT)
    if (near.length === 0) continue
    const t = near[Math.floor(Math.random() * near.length)]!
    blastAt(sim, e, abilityDefAt(AbilityRef.def[e]!) as AreaBlastDef, t.x, t.y, Followup.damage[e]!)
  }
}
