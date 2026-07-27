import type { Cue } from './cues'
import type { FieldPickupDef } from '../types/battlefield'

// 出站信箱：仿真只写、场景侧每帧排空的视觉事件。
//
// 这五个队列在仿真内部一次也没被读过——它们不是状态，是往外发的信。从前它们与
// elapsedMs、battleFx 这些真状态平铺在 Sim 的同一层，读者无从分辨哪些字段这一帧
// 会被系统读回去；现在收成一个盒子，「只写」这件事从形状上就看得出来。
//
// 排空一律走 drain：每个队列从前各写各的 `q.length = 0`，而 cues 那条把清空
// 甩给了 drawCues，于是「特效层还没建好」的分支上队列只增不减、静静地涨。

/** 敌人受伤飘字(死亡点/命中点 + 数值;暴击金色放大) */
export interface DamageNumber {
  x: number
  y: number
  amount: number
  crit: boolean
}

/** 粒子爆点(kind 选发射器:death 紫爆 / coin 金爆 / puff 灰烟) */
export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | 'puff'
}

/** 冲击波圈(自爆群伤示警) */
export interface Ring {
  x: number
  y: number
  radius: number
}

export interface Outbox {
  /** 一次性战斗特效(能力系统只入队;走 war/abilities/cues 绘制) */
  cues: Cue[]
  /** 粒子爆点(死亡/拾币;按 kind 分发发射器) */
  bursts: Burst[]
  /** 敌人受伤飘字 */
  damageNumbers: DamageNumber[]
  /** 冲击波圈(走 blastRing) */
  rings: Ring[]
  /** 本帧到手的战场拾取(广播「到手横幅」事件) */
  collects: FieldPickupDef[]
}

export function newOutbox(): Outbox {
  return { cues: [], bursts: [], damageNumbers: [], rings: [], collects: [] }
}

/** 排空一个出站队列。**f 做没做事都清空**——收信人没准备好不是留着信的理由 */
export function drain<T>(q: T[], f: (items: readonly T[]) => void): void {
  if (q.length === 0) return
  f(q)
  q.length = 0
}
