import { addComponents, addEntity } from 'bitecs'
import { attachDrawable } from './drawable'
import { Drop, FACTION, Faction, Owner } from '../components'
import type { Sim } from '../sim'

// 坠物：从目标正上方砸下来的一枚东西（天罚打击）。
//
// 它**不是召唤物**——起点、终点、砸谁，出生那一刻就全定死了，一路没有任何选择，
// 落地即结算走人。要归类的话它更接近弹丸：一次带下落动画的命中。
// 之所以还是自成一种实体而不是复用 Projectile，是因为它不走速度积分，
// 走的是「起止 Y + 时间进度」的插值，且命中目标是出生时锁定的那一个。
//
// Owner.eid 指回掷出它的武器实体（伤害归属与乘区顺着它走）。

export interface DropSpec {
  /** 外形（emoji + 尺寸；沿用手持视觉那套形状描述里的两项） */
  emoji: string
  size: number
  /** 锁定的目标实体 */
  target: number
  /** 落点（目标当前位置） */
  x: number
  y: number
  /** 起落高度差（px）：起点在落点正上方这么高处 */
  fromAbove: number
  /** 下落时长（ms，视觉钟） */
  dropMs: number
  /** 错峰延迟（ms）：同一轮的第 n 枚晚这么久起落 */
  delayMs: number
}

/** 掷一枚坠物：起点在目标正上方、透明，错峰延迟后开始下落 */
export function spawnDrop(sim: Sim, weaponEid: number, spec: DropSpec): number {
  const d = addEntity(sim.world)
  attachDrawable(sim.world, d, sim.frames, {
    id: spec.emoji,
    outline: Faction.v[weaponEid] === FACTION.enemy ? 'enemy' : 'player',
    x: spec.x,
    y: spec.y - spec.fromAbove,
    size: spec.size,
    alpha: 0,
    z: 30,
  })
  addComponents(sim.world, d, Drop, Owner)
  Owner.eid[d] = weaponEid
  Drop.startMs[d] = sim.fxMs + spec.delayMs
  Drop.durMs[d] = spec.dropMs
  Drop.fromY[d] = spec.y - spec.fromAbove
  Drop.toY[d] = spec.y
  Drop.target[d] = spec.target
  return d
}
