import { hasComponent, query, removeComponent } from 'bitecs'
import { cooldownMul } from '../../utils/amp'
import { Ability, CastRequest, Disarmed, Fired, Frozen, Manual } from '../../components'
import type { CdComp } from '../../components'
import type { Sim } from '../../sim'

// 「何时出手」只此一处：各 kind 的系统只回答「出手做什么」。
// 手动能力（队长技能载荷）不参与自动扫描，只等施放请求。

/** 施放扫描。comp = 这一种能力的组件——它既是「归谁管」的标记，也装着执行参数，
 * 所以 cast 不再收 def，自己从组件读。
 * cast 返回 false 表示这一下没打出去（没索到目标等），冷却不消耗 */
export function castScan(sim: Sim, comp: object & CdComp, cast: (eid: number) => boolean | void): void {
  // 取快照迭代：出手可能连带击杀持有者，进而回收它名下的能力实体（同 kind 也可能被摘掉）
  for (const e of [...query(sim.world, [Ability, comp])]) {
    if (!hasComponent(sim.world, e, Ability)) continue
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      cast(e)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    if (Frozen.v[e] || Disarmed.v[e] || comp.cdLeft[e]! > 0) continue
    if (cast(e) === false) continue
    // 出手事件：只有挂了 Fired 的才记（弩塔靠它触发拉弓动画）
    if (hasComponent(sim.world, e, Fired)) Fired.at[e] = sim.fxMs
    // 按登记的间隔重置；baseMs = 0 的（光环 / 周期召唤）没有冷却概念，由 kind 自己安排下一次
    if (comp.cdBase[e]! > 0) comp.cdLeft[e] = comp.cdBase[e]! * cooldownMul(sim, e)
  }
}
