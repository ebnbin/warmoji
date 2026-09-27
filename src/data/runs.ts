import runsJson from '../assets/runs.json'
import { fromJson } from './json'
import { keysOf } from '../util/record'
import type { MapId } from '../types/maps'
import type { FightDef, RunDef, RunId, StepDef } from '../types/runs'

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

/** 一章：同一张地图上连着打的几场，连同它们前面的招募与商店；index 是步骤在一局里的序号 */
export interface Chapter {
  readonly map: MapId
  readonly steps: readonly { readonly step: StepDef; readonly index: number }[]
}

/** 各场都写了地图的一局按地图分章：招募与商店归到后面那一场的章，最后一场之后的归到最后一章 */
export function chaptersOf(def: RunDef): Chapter[] {
  const out: { map: MapId; steps: { step: StepDef; index: number }[] }[] = []
  let pending: { step: StepDef; index: number }[] = []
  def.steps.forEach((step, index) => {
    if (step.kind !== 'fight' || step.fight.map === undefined) {
      pending.push({ step, index })
      return
    }
    const last = out[out.length - 1]
    if (last && last.map === step.fight.map) last.steps.push(...pending, { step, index })
    else out.push({ map: step.fight.map, steps: [...pending, { step, index }] })
    pending = []
  })
  out[out.length - 1]?.steps.push(...pending)
  return out
}
