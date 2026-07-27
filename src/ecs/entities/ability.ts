import { addComponent, addComponents, hasComponent, query, removeEntity } from 'bitecs'

import { abilityPiercesWalls } from '../../war/abilityRules'
import { CHARACTERS, loadoutFor } from '../../data/characters'
import { CAPTAINS } from '../../data/captains'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'
import { aggregateTeamCards } from '../../data/cards'
import { toPx } from '../../war/px'
import { labLevel } from '../../run/lab'
import type { RunState } from '../../run/state'
import { Ability, Amp, Anchor, CastRequest, Disarmed, Drop, FACTION, Faction, Flyer, Frozen, Manual, Minion, Owner, WallBlocked, Weapon, ZoneFollow } from '../components'
import type { CdComp } from '../components'
import { ABILITY_COMPS, KINDS } from '../registries/abilityKinds'
import type { AttachCtx } from '../registries/abilityKinds'

import type { AbilityDef } from '../../types/abilityDefs'
import { spawnWeaponBody } from '../entities/weapon'
import type { EcsWorld } from '../world'
import type { Sim } from '../sim'

// 「一条能力」的工厂。
//
// 它不是一种实体，而是**一组可以挂在任何实体上的组件**：有外形的挂在自己的武器实体上
//（spawnWeaponBody 造的那颗），徒手的直接挂施放者自己。所以本文件与 weapon.ts 的分工是
// 「装什么」与「长什么样」，不是两种实体。
//
// 此后「谁有哪些能力」就是世界里挂着这组组件、且 Owner 指向他的那些实体
//（可能包括他自己），不再是某个对象持有的数组。

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
  /** 出手后的冷却重置间隔；0 = 这一种能力没有冷却概念，由它自己安排下一次 */
  baseMs: number
  /** 索敌/命中是否无视断壁遮挡 */
  piercesWalls?: boolean
}

/** 挂一条能力（参数由调用方自己写进组件）。弩塔的开火走这条——它的参数不来自
 * 任何 def，而是从建造它的那件武器的组件里抄 */
export function attachAbilityCore(
  sim: Sim,
  eid: number,
  comp: object & CdComp,
  state: readonly { comp: object; reset(eid: number): void }[],
  init: AbilityInit,
): void {
  const world = sim.world
  // 同一个宿主不能挂两份同种能力：组件按 eid 只有一格，第二份会**静默覆盖**第一份的
  // 参数与冷却，表现成「其中一条莫名其妙不出手」，不报错。真需要两份（牛仔的左右两把枪）
  // 就让其中一份住进自己的实体——系统查的是组件，宿主是谁它们并不关心。
  assertFree(world, eid, comp, 'kind 组件')
  for (const st of state) assertFree(world, eid, st.comp, '状态组件')
  // 通用部分：每条能力都要的。**这些全是每宿主一份**（阵营、乘区、闸门都由持有者决定），
  // 所以同一个宿主挂多条能力时它们重复写入同一格也无妨。每条能力各一份的东西
  //（冷却、瞄准、各 kind 的运行状态）一律不在这里——见 comp 与 state。
  // prettier-ignore
  addComponents(world, eid, Ability, Owner, Anchor, Faction, Amp, Frozen, Disarmed, WallBlocked, comp)
  // 该 kind 自己的状态组件：用得到才挂
  for (const st of state) {
    addComponent(world, eid, st.comp)
    st.reset(eid)
  }
  if (init.manual) addComponent(world, eid, Manual)
  Owner.eid[eid] = init.owner
  Anchor.eid[eid] = init.anchor
  Faction.v[eid] = init.faction
  comp.cdLeft[eid] = init.cooldownMs
  comp.cdBase[eid] = init.baseMs
  Amp.dmg[eid] = init.amp.dmg
  Amp.cd[eid] = init.amp.cd
  Amp.crit[eid] = init.amp.crit
  Amp.kb[eid] = init.amp.kb
  Amp.battle[eid] = init.amp.battle ? 1 : 0
  Frozen.v[eid] = 0
  Disarmed.v[eid] = 0
  WallBlocked.v[eid] = init.piercesWalls ? 0 : 1
}

/** 这一格已经有人住了 = 有人要挂第二份同种能力。硬抛：静默覆盖比崩溃难查得多 */
export function assertFree(world: EcsWorld, eid: number, comp: object, what: string): void {
  if (hasComponent(world, eid, comp)) {
    throw new Error(`实体 ${eid} 上已有这条能力的${what}：同一宿主不能挂两份同种能力，请让其中一份住进独立实体`)
  }
}

/** 装备一条来自 def 的能力：查登记表 → 挂通用包与该 kind 的组件 → 把参数抄进组件。
 * **这是 def.kind 在整个生命周期里被读的唯一一次**——此后 system 只认组件 */
export function attachAbility(sim: Sim, eid: number, def: AbilityDef, init: Omit<AbilityInit, 'baseMs' | 'piercesWalls'>): void {
  const spec = KINDS[def.kind]
  attachAbilityCore(sim, eid, spec.comp, spec.state ?? [], {
    ...init,
    baseMs: 'cooldownMs' in def ? def.cooldownMs : 0,
    piercesWalls: abilityPiercesWalls(def),
  })
  // 参数抄在最后——有些 attach 要按 Faction 挑外形（敌弹与我方弹的描边不同）
  ;(spec.attach as ((c: AttachCtx, e: number, d: AbilityDef) => void) | undefined)?.(
    { world: sim.world, frames: sim.frames },
    eid,
    def,
  )
}

/** 装备一条能力，返回承载它的 eid。
 *
 * **有外形的住进自己的武器实体，徒手的直接挂施放者身上。**
 * 差别仅此而已——两种都只是「谁身上挂着这组能力组件」，施放系统查的是组件，
 * 从不问宿主是什么。徒手能力（军医的战地医疗与飞针、敌人的弹幕与天罚、队长技能载荷）
 * 因此不再需要一颗有名无实的空武器实体。
 *
 * 无论挂在哪，owner 与 anchor 都指施放者本人：账算他的、闸门随他的死活、枪口从他身上算起。
 * 武器身体只是外形，从不参与判定（激光是从人身上射出去的，不是从手电筒尖）。 */
export function equipAbility(
  sim: Sim,
  host: number,
  def: AbilityDef,
  faction: number,
  cooldownMs: number,
  amp: AmpInit,
  manual = false,
): number {
  const carrier = 'held' in def && def.held ? spawnWeaponBody(sim, host, def.held, faction) : host
  attachAbility(sim, carrier, def, { owner: host, anchor: host, faction, cooldownMs, amp, manual })
  return carrier
}

/** 收走某持有者名下的全部武器与它们造出来的子实体（召唤物、坠物、在途双子镖）。
 * 持有者离场时调——eid 会被回收再分配，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const weapons: number[] = []
  for (const e of query(world, [Weapon, Owner])) if (Owner.eid[e] === ownerEid) weapons.push(e)
  // 子实体记的是「哪条能力放的我」，而徒手能力就挂在持有者自己身上——故归属要连本人一起查。
  // 少了这一条，寒气光环的区与天罚的坠物会活过放它们的人（那时 eid 已被回收再分配）
  const hosts = [...weapons, ownerEid]
  for (const d of query(world, [Drop, Owner])) if (hosts.includes(Owner.eid[d]!)) removeEntity(world, d)
  // 跟随型区域(寒气光环)挂在能力名下;静止的地面区不挂 Owner——毒圈活过放它的人是常态
  for (const z of [...query(world, [ZoneFollow, Owner])]) if (hosts.includes(Owner.eid[z]!)) removeEntity(world, z)
  // 召唤物的 Owner 就是施放者本人（Built.by 才指母武器），故直接按持有者判
  for (const m of [...query(world, [Minion, Owner])]) if (Owner.eid[m] === ownerEid) removeEntity(world, m)
  // 在途的镖是独立实体，随掷出它的武器一并回收
  for (const f of [...query(world, [Flyer])]) if (weapons.includes(Flyer.of[f]!)) removeEntity(world, f)
  // 持有者本人不在此删——调用方紧接着 removeEntity 它，挂在它身上的能力组件随之消失
  for (const e of weapons) removeEntity(world, e)
}

export function requestCast(sim: Sim, ownerEid: number): void {
  for (const e of query(sim.world, [Ability, Manual])) {
    if (Owner.eid[e] === ownerEid) addComponent(sim.world, e, CastRequest)
  }
}

/** 把某持有者名下的能力冷却至少推迟 ms（变形复形后的缓冲，避免复形瞬间齐射） */
export function postponeAbilities(sim: Sim, ownerEid: number, ms: number): void {
  for (const comp of ABILITY_COMPS) {
    for (const e of query(sim.world, [Ability, comp, Owner])) {
      if (Owner.eid[e] === ownerEid) comp.cdLeft[e] = Math.max(comp.cdLeft[e]!, ms)
    }
  }
}

// ── 开局装配 ─────────────────────────────────────────────────────────

// 开局装配：把配装解析成一条条能力。队伍在开局一次装齐；敌人首次被扫到时装配
// （lazy-arm，与旧实现的出生即装配等价，因为压制期照样推进冷却）。

/** 为全队装备能力：逐槽位按已持道具 + 专属等级解析生效能力（测试模式走场内等级旋钮） */
export function armTeam(sim: Sim, run: RunState, testMode: boolean): void {
  const teamFx = aggregateTeamCards(run.teamCards)
  for (let slot = 0; slot < run.roster.length; slot++) {
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const owned = testMode ? [] : (run.memberItems[slot] ?? [])
    const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
    const tiers = { u1: level >= 2, u2: level >= 3 }
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    // 装备期乘区（道具/等级/团队卡折算）：随局面变的那部分由 amp.ts 现算
    const amp = {
      dmg: fx.damageMul * teamFx.teamDamageMul,
      cd: fx.cooldownMul * teamFx.teamCooldownMul,
      crit: fx.critChance + teamFx.critAdd,
      kb: fx.knockbackMul,
      battle: true,
    }
    loadoutFor(def, tiers).forEach((w, i) => {
      equipAbility(sim, sim.members[slot]!, toPx(resolveAbilityDef(w, fx)), FACTION.team, 300 + slot * 120 + i * 230, amp)
    })
  }
}

/** 队长主动技能的载荷：效果本体是标准能力行，行为主体锚在队伍中心。
 * 不进自动扫描——只等 castSkill 的施放请求。返回锚点实体 */
export function armCaptain(sim: Sim, run: RunState): void {
  // 队长实体在 makeSim 里已建好（队伍中心即它的位置），这里只挂技能载荷
  for (const a of CAPTAINS[run.captainId].skill.abilities) {
    equipAbility(sim, sim.captain, toPx(a), FACTION.team, 0, NEUTRAL_AMP, true)
  }
}
