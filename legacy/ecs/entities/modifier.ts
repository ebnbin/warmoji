import { addComponents, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { foldBattleEffects } from '../utils/battleFx'
import { Lifetime, Modifier } from '../components'
import { modDef } from '../store'
import type { BattleEffects, FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'


export function spawnModifier(sim: Sim, def: FieldPickupDef): number {
  for (const e of [...query(sim.world, [Modifier])]) {
    if (modDef[e]?.id === def.id) removeEntity(sim.world, e)
  }
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Modifier, Lifetime)
  Modifier.totalMs[eid] = def.durationMs
  Lifetime.until[eid] = sim.elapsedMs + def.durationMs
  modDef[eid] = def
  return eid
}

export function activeMods(sim: Sim): number[] {
  const born = (e: number): number => Lifetime.until[e]! - Modifier.totalMs[e]!
  return [...query(sim.world, [Modifier, Lifetime])].sort((a, b) => born(a) - born(b) || a - b)
}

export function foldMods(sim: Sim): BattleEffects {
  return foldBattleEffects(activeMods(sim).map((e) => modDef[e]!.fx))
}
