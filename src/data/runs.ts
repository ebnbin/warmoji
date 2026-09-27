import runsJson from '../assets/runs.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { FightDef, RunDef, RunId } from '../types/runs'

export const RUNS = fromJson<Record<RunId, RunDef>>(runsJson)

export const RUN_IDS: readonly RunId[] = keysOf(RUNS)

/** 一局里的各场战斗，按出场顺序 */
export function fightsOf(def: RunDef): FightDef[] {
  return def.steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
}
