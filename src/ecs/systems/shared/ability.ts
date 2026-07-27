import { addComponent, query } from 'bitecs'
import { Ability, CastRequest, Manual, Owner } from '../../components'
import { ABILITY_COMPS } from '../../entities/ability'
import type { Sim } from '../../sim'

// 对**已装备**能力的运行期操作：由场景（按下技能键）与系统（复形后压冷却）调用。
// 它们不造东西、不挂能力，所以不在 entities/ 下；也不是 system（不 query 遍历全场、
// 是被指名对某个持有者做一下），所以在 shared 里。

/** 请求施放：给该持有者名下所有手动能力挂上 CastRequest，下一次施放扫描即放 */
export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
}

/** 把某持有者名下的能力冷却至少推迟 ms（变形复形后的缓冲，避免复形瞬间齐射） */
export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const comp of ABILITY_COMPS) {
    for (const e of query(sim.world, [Ability, comp, Owner])) {
      if (Owner.eid[e] === ownerEid) comp.cdLeft[e] = Math.max(comp.cdLeft[e]!, ms)
    }
  }
}

