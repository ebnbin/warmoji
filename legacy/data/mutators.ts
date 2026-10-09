import mutatorsJson from '../assets/mutators.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { MutatorDef, MutatorId } from '../types/runs'

export const MUTATORS = fromJson<Record<MutatorId, MutatorDef>>(mutatorsJson)

export const MUTATOR_IDS: readonly MutatorId[] = keysOf(MUTATORS)

/** 这些词缀加起来的热度 */
export function heatOf(ids: readonly MutatorId[]): number {
  return ids.reduce((sum, id) => sum + MUTATORS[id].heat, 0)
}
