import type { Sim } from '../../sim'
import { defineDevFlag } from '../../../devtools'

const profiling = defineDevFlag({ id: 'ecs.profile', group: '战斗', label: '流水线剖析', desc: '逐 system 计时，结果在战斗页签' })
const acc = new Map<string, { ms: number; calls: number }>()
let profiledFrames = 0

export type System = (sim: Sim) => void
export type Step = System | { readonly run: System; readonly after: readonly System[] }

export function pipeline(steps: readonly Step[]): readonly System[] {
  const runs = steps.map((s) => (typeof s === 'function' ? s : s.run))
  steps.forEach((s, i) => {
    if (typeof s === 'function') return
    for (const dep of s.after) {
      const j = runs.indexOf(dep)
      if (j < 0 || j >= i) throw new Error(`流水线次序错误：${s.run.name} 须排在 ${dep.name} 之后`)
    }
  })
  return runs
}

export function runPipeline(systems: readonly System[], sim: Sim): void {
  if (!profiling()) {
    for (const run of systems) run(sim)
    return
  }
  profiledFrames++
  for (const run of systems) {
    const t0 = performance.now()
    run(sim)
    const e = acc.get(run.name) ?? { ms: 0, calls: 0 }
    e.ms += performance.now() - t0
    e.calls++
    acc.set(run.name, e)
  }
}

/** 嵌套流水线的外层 system 含内层耗时 */
export function pipelineProfile(): { frames: number; rows: { name: string; avgMs: number; totalMs: number }[] } {
  const rows = [...acc].map(([name, e]) => ({ name, avgMs: e.ms / Math.max(1, profiledFrames), totalMs: e.ms }))
  rows.sort((a, b) => b.avgMs - a.avgMs)
  return { frames: profiledFrames, rows }
}

export function resetPipelineProfile(): void {
  acc.clear()
  profiledFrames = 0
}
