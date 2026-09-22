import { describe, expect, it } from 'vitest'
import { ABILITY_PIPELINE } from './abilities'
import { FRAME_PIPELINE } from './frame'
import { SIM_PIPELINE } from './sim'
import type { Step } from './step'

// 守卫：流水线次序即语义，打乱它不会有任何检查变红

const PIPELINES: readonly { name: string; steps: readonly Step[] }[] = [
  { name: '帧', steps: FRAME_PIPELINE },
  { name: '仿真', steps: SIM_PIPELINE },
  { name: '能力', steps: ABILITY_PIPELINE },
]

describe.each(PIPELINES)('$name 流水线的次序', ({ steps }) => {
  const order = new Map(steps.map((s, i) => [s.name, i]))

  it('每一步都排在它声明的 after 之后', () => {
    const broken = steps.flatMap((s) =>
      (s.after ?? [])
        .filter((dep) => order.get(dep)! > order.get(s.name)!)
        .map((dep) => `${s.name} 必须排在 ${dep} 之后${s.why ? `（${s.why}）` : ''}`),
    )
    expect(broken, broken.join('\n')).toEqual([])
  })

  it('after 里不留悬空引用', () => {
    const dangling = steps.flatMap((s) =>
      (s.after ?? []).filter((dep) => !order.has(dep)).map((dep) => `${s.name}.after 指向不存在的步 ${dep}`),
    )
    expect(dangling, dangling.join('\n')).toEqual([])
  })

  it('步名不重复（重名会让 after 指向哪一个变得不确定）', () => {
    const dup = steps.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
    expect(dup, `重名：${dup.join(', ')}`).toEqual([])
  })
})
