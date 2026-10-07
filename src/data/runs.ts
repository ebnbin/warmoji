import runsJson from '../assets/runs.json'
import { CURVE } from './enemies'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { FightDef, PhaseDef, RunDef, RunId } from '../types/runs'
import type { DifficultyCurve } from '../types/waves'

export const RUNS = fromJson<Record<RunId, RunDef>>(runsJson)

export const RUN_IDS: readonly RunId[] = keysOf(RUNS)

/** 一局里写的各场战斗，按先后 */
export function fightsOf(def: RunDef): FightDef[] {
  return def.steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
}

/** 一局一共要打几场 */
export function fightCount(def: RunDef): number {
  return fightsOf(def).length
}

/** 这一局的难度曲线：没写就按默认的 */
export function curveOf(def: RunDef): DifficultyCurve {
  return def.curve ?? CURVE
}

/** 这一阶段的时限：撑到它就结束；没有时限是 undefined */
export function timeLimitMs(p: PhaseDef): number | undefined {
  for (const e of p.ends) if (e.kind === 'time') return e.ms
  return undefined
}
