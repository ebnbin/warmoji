import { addComponents, addEntity, query, removeEntity } from 'bitecs'
import { BATTLE_FX_IDENTITY } from '../../data/battlefield'
import { foldBattleEffects } from '../../war/battleFx'
import { Lifetime, Modifier } from '../components'
import { modDef } from '../store'
import type { BattleEffects, FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'

// 战场限时层实体：捡到一枚战场拾取就在场上多一层限时乘区，到期即散。
//
// 从前是 sim.battleMods 这个数组，每帧 filter 出没到期的再重折。可它跟地面毒圈
// （早就是 Zone 实体）是同一个概念——「战场上一件限时生效的东西」——却一半是实体、
// 一半是数组。现在同一套：到期时刻走 Lifetime（与毒圈、待拾物同一个字段）。
//
// 乘区仍是每帧折一次的派生值（sim.battleFx）：折不掉，多层本来就要合成。
// 只是「有哪些层」的真相从数组换成了查询。

/** 施加一层（同 id 只刷新计时不叠加：先散掉旧的那层，再挂一层新的） */
export function spawnModifier(sim: Sim, def: FieldPickupDef): number {
  for (const e of [...query(sim.world, [Modifier])]) {
    if (modDef[e]?.id === def.id) removeEntity(sim.world, e)
  }
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Modifier, Lifetime)
  Modifier.totalMs[eid] = def.durationMs
  Lifetime.until[eid] = sim.elapsedMs + def.durationMs
  modDef[eid] = def
  return eid
}

/** 在场的限时层，**按施加先后排序**。
 *
 * 排序不是装饰：折乘区是逐层相乘、HUD 按这个次序摆图标，而查询集的次序是
 * swap-remove 之后的物理次序——散掉中间一层就会把最后一层换到它的位置上，
 * 于是图标无端跳位、浮点尾数也跟着变。施加时刻（until - totalMs）才是稳定的序。 */
export function activeMods(sim: Sim): number[] {
  const born = (e: number): number => Lifetime.until[e]! - Modifier.totalMs[e]!
  return [...query(sim.world, [Modifier, Lifetime])].sort((a, b) => born(a) - born(b) || a - b)
}

/** 把在场各层折成本帧乘区 */
export function foldMods(sim: Sim): BattleEffects {
  const live = activeMods(sim)
  if (live.length === 0) return { ...BATTLE_FX_IDENTITY }
  return foldBattleEffects(live.map((e) => modDef[e]!.fx))
}
