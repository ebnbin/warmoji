import runsJson from '../assets/runs.json'
import { CURVE } from './enemies'
import { fromJson } from './json'
import { planOf } from './rounds'
import { keysOf } from '../util/record'
import type { MapId } from '../types/maps'
import type { FightDef, LegacyPhaseDef, RepeatDef, RunDef, RunId, StepDef } from '../types/runs'
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

/** 一章：同一张地图上连着打的几场，连同它们前面的招募与商店；index 是步骤在一局里的序号 */
export interface Chapter {
  readonly map: MapId
  readonly steps: readonly { readonly step: StepDef | RepeatDef; readonly index: number }[]
}

/** 这一步在哪张地图上打：一场看它自己，重复的一段看它的第一场，招募与商店不算 */
function stepMap(step: StepDef | RepeatDef): MapId | undefined {
  if (step.kind === 'fight') return step.fight.map
  if (step.kind === 'repeat') return step.steps.flatMap((b) => (b.kind === 'fight' ? [b.fight.map] : []))[0]
  return undefined
}

/** 各场都写了地图的一局按地图分章：招募与商店归到后面那一场的章，最后一场之后的归到最后一章，重复的一段按它的第一场归章 */
export function chaptersOf(def: RunDef): Chapter[] {
  const out: { map: MapId; steps: { step: StepDef | RepeatDef; index: number }[] }[] = []
  let pending: { step: StepDef | RepeatDef; index: number }[] = []
  def.steps.forEach((step, index) => {
    const map = stepMap(step)
    if (map === undefined) {
      pending.push({ step, index })
      return
    }
    const last = out[out.length - 1]
    if (last && last.map === map) last.steps.push(...pending, { step, index })
    else out.push({ map, steps: [...pending, { step, index }] })
    pending = []
  })
  out[out.length - 1]?.steps.push(...pending)
  return out
}
