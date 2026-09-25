import type { Sim } from '../../sim'

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
  for (const run of systems) run(sim)
}
