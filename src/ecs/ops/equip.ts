import { addComponent, addComponents, query, removeEntity } from 'bitecs'

import { abilityPiercesWalls } from '../../war/abilityRules'
import { Ability, AbilityRef, Aim, Amp, Anchor, CastRequest, Cooldown, Disarmed, Drop, Faction, Flyer, Frozen, Manual, Minion, Owner, WallBlocked, Weapon, ZoneFollow } from '../components'
import { internAbilityDef } from '../abilityDefs'
import { KINDS } from '../registries/abilityKinds'

import type { AbilityDef } from '../../types/abilityDefs'
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

/** 挂一条能力所需的关系与初值 */
export interface AbilityInit {
  /** 施放者：伤害算谁的账、吃谁的乘区、随谁的死活开关闸门（武器=持有者，弩塔=建造者） */
  owner: number
  /** 施放锚点：从哪儿放这一下（武器=持有者，弩塔=它自己） */
  anchor: number
  faction: number
  /** 首发冷却（错峰用） */
  cooldownMs: number
  amp: AmpInit
  /** 只等施放请求，不进自动扫描（队长技能） */
  manual?: boolean
}

/** 给一个实体挂上「能带一条能力」的组件包——挂完它就进 castScan 的视野。
 *
 * **这不是实体类型**：武器带它（entities/weapon.ts），自主开火的召唤物也带它
 *（entities/minion.ts 的弩塔）。两者的差别只在 anchor：武器从持有者身上放，
 * 弩塔从它自己身上放。返回 false = 该 kind 未登记 tag（不挂，gen 校验保证不会发生） */
export function attachAbility(sim: Sim, eid: number, def: AbilityDef, init: AbilityInit): boolean {
  const spec = KINDS[def.kind]
  if (!spec) return false
  const world = sim.world
  // 通用部分：每条能力都要的
  // prettier-ignore
  addComponents(world, eid, Ability, AbilityRef, Owner, Anchor, Faction, Cooldown, Amp, Frozen, Disarmed, WallBlocked, Aim, spec.tag)
  // 该 kind 自己的状态组件：用得到才挂（见 tags.ts）
  for (const st of spec.state ?? []) {
    addComponent(world, eid, st.comp)
    st.reset(eid)
  }
  if (init.manual) addComponent(world, eid, Manual)
  AbilityRef.def[eid] = internAbilityDef(def)
  Owner.eid[eid] = init.owner
  Anchor.eid[eid] = init.anchor
  Faction.v[eid] = init.faction
  Cooldown.left[eid] = init.cooldownMs
  Amp.dmg[eid] = init.amp.dmg
  Amp.cd[eid] = init.amp.cd
  Amp.crit[eid] = init.amp.crit
  Amp.kb[eid] = init.amp.kb
  Amp.battle[eid] = init.amp.battle ? 1 : 0
  Frozen.v[eid] = 0
  Disarmed.v[eid] = 0
  WallBlocked.v[eid] = abilityPiercesWalls(def) ? 0 : 1
  Aim.rad[eid] = 0
  return true
}

/** 收走某持有者名下的全部武器与它们造出来的子实体（召唤物、坠物、在途双子镖）。
 * 持有者离场时调——eid 会被回收再分配，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const doomed: number[] = []
  for (const e of query(world, [Weapon, Owner])) if (Owner.eid[e] === ownerEid) doomed.push(e)
  if (doomed.length === 0) return
  for (const d of query(world, [Drop, Owner])) if (doomed.includes(Owner.eid[d]!)) removeEntity(world, d)
  // 跟随型区域(寒气光环)挂在武器名下;静止的地面区不挂 Owner——毒圈活过放它的人是常态
  for (const z of [...query(world, [ZoneFollow, Owner])]) if (doomed.includes(Owner.eid[z]!)) removeEntity(world, z)
  // 召唤物的 Owner 就是施放者本人（Built.by 才指母武器），故直接按持有者判
  for (const m of [...query(world, [Minion, Owner])]) if (Owner.eid[m] === ownerEid) removeEntity(world, m)
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
