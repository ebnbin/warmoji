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

/** 这一场的时限：撑到它就结束；没有时限是 undefined */
export function timeLimitMs(f: FightDef): number | undefined {
  for (const e of f.ends) if (e.kind === 'time') return e.ms
  return undefined
}
