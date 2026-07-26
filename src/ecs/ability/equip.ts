import { addComponent, query, removeEntity } from 'bitecs'

import { Ability, CastRequest, Cooldown, Drop, Flyer, Manual, Minion, Owner, Weapon } from '../components'

import type { Sim } from '../sim'

// 装备 = 把定义物化成一件武器实体（见 entities/weapon.ts）。此后「谁有哪些能力」
// 就是世界里挂在他名下的一批武器，不再是某个对象持有的数组。

/** 装备期定死的乘区（队伍侧由道具/等级/团队卡折算；中立方全 1） */
export interface AmpInit {
  dmg: number
  cd: number
  crit: number
  kb: number
  /** 是否吃战场限时层的队伍乘区 */
  battle: boolean
}

export const NEUTRAL_AMP: AmpInit = { dmg: 1, cd: 1, crit: 0, kb: 1, battle: false }

/** 收走某持有者名下的全部武器与它们造出来的子实体（召唤物、坠物、在途双子镖）。
 * 持有者离场时调——eid 会被回收再分配，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const doomed: number[] = []
  for (const e of query(world, [Weapon, Owner])) if (Owner.eid[e] === ownerEid) doomed.push(e)
  if (doomed.length === 0) return
  for (const d of query(world, [Drop, Owner])) if (doomed.includes(Owner.eid[d]!)) removeEntity(world, d)
  for (const m of query(world, [Minion, Owner])) if (doomed.includes(Owner.eid[m]!)) removeEntity(world, m)
  // 双子镖是武器的临时副本（主镖就是武器自己，随下面一并回收）
  for (const f of [...query(world, [Flyer])]) {
    if (f !== Flyer.of[f] && doomed.includes(Flyer.of[f]!)) removeEntity(world, f)
  }
  for (const e of doomed) removeEntity(world, e)
}

export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
}

/** 把某持有者名下的能力冷却至少推迟 ms（变形复形后的缓冲，避免复形瞬间齐射） */
export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const e of query(sim.world, [Ability, Cooldown])) {
    if (Owner.eid[e] === ownerEid) Cooldown.left[e] = Math.max(Cooldown.left[e]!, ms)
  }
}
