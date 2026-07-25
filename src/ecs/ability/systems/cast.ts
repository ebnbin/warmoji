import { hasComponent, query, removeComponent } from 'bitecs'
import type { AbilityDef } from '../../../data/abilityDefs'
import { cooldownMul } from '../amp'
import { Ability, AbilityRef, CastRequest, Cooldown, Disarmed, Frozen, Manual } from '../components'
import { abilityDefAt } from '../defs'
import type { Sim } from '../../sim'

// 「何时出手」只此一处：各 kind 的系统只回答「出手做什么」。
// 手动能力（队长技能载荷）不参与自动扫描，只等施放请求。

/** 施放扫描：带本帧施放请求的立即出手；自动能力在未冻结、未缴械、冷却就绪时出手。
 * cast 返回 false 表示这一下没打出去（没索到目标等），冷却不消耗 */
export function castScan<D extends AbilityDef>(
  sim: Sim,
  tag: object,
  cast: (eid: number, def: D) => boolean | void,
): void {
  for (const e of query(sim.world, [Ability, tag])) {
    const def = abilityDefAt(AbilityRef.def[e]!) as D
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      cast(e, def)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    if (Frozen.v[e] || Disarmed.v[e] || Cooldown.left[e]! > 0) continue
    if (cast(e, def) === false) continue
    Cooldown.left[e] = ('cooldownMs' in def ? def.cooldownMs : 0) * cooldownMul(sim, e)
  }
}
