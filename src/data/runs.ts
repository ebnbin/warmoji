import runsJson from '../assets/runs.json'
import { CURVE } from './enemies'
import { fromJson } from './json'
import { planOf } from './rounds'
import { keysOf } from '../util/record'
import type { FightDef, LegacyPhaseDef, RunDef, RunId } from '../types/runs'
import type { DifficultyCurve } from '../types/waves'

export const RUNS = fromJson<Record<RunId, RunDef>>(runsJson)

export const RUN_IDS: readonly RunId[] = keysOf(RUNS)

/** 一局里写的各场战斗，按先后；重复里的每一场只算一次 */
export function fightsOf(def: RunDef): FightDef[] {
  return def.steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : s.kind === 'repeat' ? s.steps.flatMap((b) => (b.kind === 'fight' ? [b.fight] : [])) : []))
}

/** 一局一共要打几场：重复的按轮展开算，一直重复的是 Infinity */
export function fightCount(def: RunDef): number {
  if (def.steps.some((s) => s.kind === 'repeat' && s.times === undefined)) return Infinity
  return planOf(def, 0).filter((s) => s.kind === 'fight').length
}

/** 这一局的难度曲线：没写就按默认的 */
export function curveOf(def: RunDef): DifficultyCurve {
  return def.curve ?? CURVE
}

/** 一场的各个阶段，按先后；旧写法的一场自己就是唯一的阶段 */
export function phasesOf(f: FightDef): readonly LegacyPhaseDef[] {
  return f.phases === undefined ? [f] : f.phases
}

/** 这一阶段的时限：撑到它就结束；没有时限是 undefined */
export function timeLimitMs(p: LegacyPhaseDef): number | undefined {
  for (const e of p.ends) if (e.kind === 'time') return e.ms
  return undefined
}
