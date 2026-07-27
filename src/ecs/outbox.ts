import type { FieldPickupDef } from '../types/battlefield'

// 出站信箱：仿真只写、场景侧每帧排空的视觉事件。
//
// 这几个队列在仿真内部一次也没被读过——它们不是状态，是往外发的信。从前它们与
// elapsedMs、battleFx 这些真状态平铺在 Sim 的同一层，读者无从分辨哪些字段这一帧
// 会被系统读回去；现在收成一个盒子，「只写」这件事从形状上就看得出来。
//
// 排空一律走 drain：每个队列从前各写各的 `q.length = 0`，漏一条就是只增不减地涨。
// 只剩两个队列 + 一个字段了——特效、飘字、冲击环都已是实体，不再需要往外发信。

/** 粒子爆点(kind 选发射器:death 紫爆 / coin 金爆 / puff 灰烟) */
export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | 'puff'
}

export interface Outbox {
  /** 全屏白闪(天罚全域打击):一块盖满视口的定屏矩形淡出。
   * 它是**唯一没能变成实体的特效**——屏幕固定,根本不在世界坐标里。
   * 一次只有一发,后来者覆盖前者,故是一个字段而不是队列 */
  flash: { color: number; alpha: number; durationMs: number } | null
  /** 粒子爆点(死亡/拾币;按 kind 分发发射器) */
  bursts: Burst[]
  /** 本帧到手的战场拾取(广播「到手横幅」事件) */
  collects: FieldPickupDef[]
}

export function newOutbox(): Outbox {
  return { flash: null, bursts: [], collects: [] }
}

/** 排空一个出站队列。**f 做没做事都清空**——收信人没准备好不是留着信的理由 */
export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
