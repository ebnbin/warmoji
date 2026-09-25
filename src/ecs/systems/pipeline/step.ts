import type { Sim } from '../../sim'

export type Step = (sim: Sim) => void

export function runPipeline(pipeline: readonly Step[], sim: Sim): void {
  for (const step of pipeline) step(sim)
}
