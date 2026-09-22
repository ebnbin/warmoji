import type { Sim } from '../../sim'

// 每步声明它必须排在谁之后；没有真实依赖就不写 after。校验在 order.test.ts

export interface Step {
  readonly name: string
  run(sim: Sim): void
  /** 必须排在这些步之后；省略即无约束 */
  readonly after?: readonly string[]
  /** 写不出理由的依赖多半是想出来的 */
  readonly why?: string
}

export function runPipeline(pipeline: readonly Step[], sim: Sim): void {
  for (const step of pipeline) step.run(sim)
}
