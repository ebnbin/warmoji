import { addComponents, addEntity, query, removeEntity } from 'bitecs'
import { BATTLE_FX_IDENTITY } from '../../data/battlefield'
import { foldBattleEffects } from '../utils/battleFx'
import { Lifetime, Modifier } from '../components'
import { modDef } from '../store'
import type { BattleEffects, FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'


/** 同 id 只刷新计时不叠加 */
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

/** 按施加先后排序：查询集的物理次序不稳定 */
export function activeMods(sim: Sim): number[] {
  const born = (e: number): number => Lifetime.until[e]! - Modifier.totalMs[e]!
  return [...query(sim.world, [Modifier, Lifetime])].sort((a, b) => born(a) - born(b) || a - b)
}

export function foldMods(sim: Sim): BattleEffects {
  const live = activeMods(sim)
  if (live.length === 0) return { ...BATTLE_FX_IDENTITY }
  return foldBattleEffects(live.map((e) => modDef[e]!.fx))
}
