import { describe, expect, it } from 'vitest'
import { PIPELINE } from './run'

// 系统次序守卫。
//
// 钉的是这样一个缺陷：**能力流水线的次序即语义，破坏它却什么都不会红**。
// 把 turret 挪到 projectile 之前，弩塔的拉弓动画晚一帧；把 gates 挪到施放之后，
// 死人还能再出一次手——编译过、lint 过、e2e 过，画面也「看着差不多」。
// 唯一能拦住的，是把「谁必须在谁之后」写下来并逐条校验。

const order = new Map(PIPELINE.map((s, i) => [s.name, i]))

describe('能力流水线的次序', () => {
  it('每一步都排在它声明的 after 之后', () => {
    const broken = PIPELINE.flatMap((s) =>
      (s.after ?? [])
        .filter((dep) => order.get(dep)! > order.get(s.name)!)
        .map((dep) => `${s.name} 必须排在 ${dep} 之后${s.why ? `（${s.why}）` : ''}`),
    )
    expect(broken, broken.join('\n')).toEqual([])
  })

  it('after 里不留悬空引用', () => {
    const dangling = PIPELINE.flatMap((s) =>
      (s.after ?? []).filter((dep) => !order.has(dep)).map((dep) => `${s.name}.after 指向不存在的步 ${dep}`),
    )
    expect(dangling, dangling.join('\n')).toEqual([])
  })

  it('步名不重复（重名会让 after 指向哪一个变得不确定）', () => {
    const dup = PIPELINE.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
    expect(dup, `重名：${dup.join(', ')}`).toEqual([])
  })
})
