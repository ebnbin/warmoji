import { hasComponent } from 'bitecs'
import { Anchor, FACTION, Faction, Owner, Slot, Stats, Transform, VisOff } from '../components'
import type { Sim } from '../sim'

/** 能力从宿主的画面位置出手：身体位置加视觉偏移 */
export function anchorX(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.x[a]! + VisOff.x[a]!
}

export function anchorY(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.y[a]! + VisOff.y[a]!
}

/** 冷却倍率取所有者属性表里的攻速 */
export function cooldownMul(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  return hasComponent(sim.world, o, Stats) ? Stats.cooldown[o]! : 1
}

/** 伤害记在哪个角色名下：宿主是角色才记，敌人与召唤出的身体不记 */
export function attributionSlot(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  return Faction.v[e] === FACTION.team && hasComponent(sim.world, o, Slot) ? Slot.v[o]! : -1
}
