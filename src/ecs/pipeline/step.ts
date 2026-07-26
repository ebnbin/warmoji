import type { Sim } from '../sim'

// 流水线的一步。**次序即语义，而次序天然只存在于源码行序里**——挪一行不报错、
// 不警告，跑起来也「看着差不多」。所以每条流水线都不是一串裸调用，而是一张
// 声明了依赖的表：每一步写清它必须排在谁之后、为什么。
//
// 没有 after 的步 = 与其他步互不相干，怎么排都行。**宁可不声明也不要编一个理由**：
// 自我印证的依赖（「它排在前面所以它必须排在前面」）比没有依赖更糟，测试会一直绿。
//
// 校验在 order.test.ts：实际次序满足全部声明、不留悬空引用、步名不重复。

export interface Step {
  /** 依赖引用用的名字 */
  readonly name: string
  run(sim: Sim): void
  /** 必须排在这些步之后；省略即无约束 */
  readonly after?: readonly string[]
  /** 为什么——写不出理由的依赖多半是想出来的 */
  readonly why?: string
}

/** 按序跑完一条流水线 */
export function runPipeline(pipeline: readonly Step[], sim: Sim): void {
  for (const step of pipeline) step.run(sim)
}
