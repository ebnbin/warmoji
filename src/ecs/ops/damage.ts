import { CRIT_MUL } from '../../data/items'
import { Alive, FACTION, Iframe } from '../components'
import { applyDamage, hurtMember } from './combat'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

// 施伤的唯一入口：阵营决定进哪条结算（敌→队员吃无敌帧节流，队→敌走暴击/击退）。
// 它不是 system——被人指着打某个目标，不 query；也不是纯函数——会写组件。

/** 施伤的唯一入口：阵营决定落点——队伍侧打敌人（暴击掷点 + 击退倍率在此生效），
 * 敌方侧打队员（吃无敌帧节流；队员无击退机制，击退参数忽略） */
export function damageTarget(
  sim: Sim,
  src: Source,
  target: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
): void {
  if (src.faction === FACTION.enemy) {
    if (sim.over || !Alive.v[target]) return
    if (sim.elapsedMs - Iframe.last[target]! < Iframe.ms[target]!) return
    Iframe.last[target] = sim.elapsedMs
    hurtMember(sim, target, damage, src.name)
    return
  }
  const chance = Math.min(0.5, src.crit)
  const crit = chance > 0 && sim.rng.next() < chance
  const dmg = crit ? Math.round(damage * CRIT_MUL) : damage
  applyDamage(sim, target, dmg, knockback * src.kb, srcX, srcY, src.slot, crit)
}
