import { hasComponent } from 'bitecs'
import { AbilityClass, Anchor, FACTION, Faction, Owner, Slot, Stats, Transform, VisOff } from '../components'
import { summonerOf } from './stats'
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

/** 冷却倍率取所有者属性表：技能吃技能急速，普通出手吃攻速 */
export function cooldownMul(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  if (!hasComponent(sim.world, o, Stats)) return 1
  return AbilityClass.skill[e] ? Stats.skillCooldown[o]! : Stats.cooldown[o]!
}

/** 身体造成的伤害记在哪个角色名下：角色记自己，召唤物记还在的召唤者，其余不记 */
export function creditSlot(sim: Sim, body: number): number {
  if (hasComponent(sim.world, body, Slot)) return Slot.v[body]!
  const by = summonerOf(sim.world, body)
  return by >= 0 && hasComponent(sim.world, by, Slot) ? Slot.v[by]! : -1
}

/** 能力造成的伤害记在哪个角色名下：只有我方的记 */
export function attributionSlot(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.team ? creditSlot(sim, Owner.eid[e]!) : -1
}
