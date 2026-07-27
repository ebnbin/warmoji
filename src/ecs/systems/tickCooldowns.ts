import { query } from 'bitecs'
import { Ability, Frozen } from '../components'
import { ABILITY_COMPS } from '../entities/ability'
import type { Sim } from '../sim'

/** 冷却推进：唯一职责是让未冻结的能力冷却按时长递减。
 * 冷却下沉到每种能力的参数组件之后，「所有能力」不再是一个 query 能表达的集合，
 * 只能逐种扫——每种一次 query，18 次，各自只命中真正挂了那种能力的实体 */
export function tickCooldowns(sim: Sim): void {
  const dt = sim.wdtMs
  for (const comp of ABILITY_COMPS) {
    for (const e of query(sim.world, [Ability, comp, Frozen])) {
      if (Frozen.v[e]) continue
      comp.cdLeft[e] = comp.cdLeft[e]! - dt
    }
  }
}
