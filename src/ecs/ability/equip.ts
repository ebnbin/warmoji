import { addComponent, addComponents, addEntity, query, removeEntity } from 'bitecs'
import { abilityPiercesWalls } from '../../data/abilityDefs'
import type { AbilityDef, HeldVisual } from '../../data/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { Alive, Boss, Elite, Slot, Transform } from '../components'
import { spawnSprite } from '../entities'
import {
  Ability,
  AbilityRef,
  Aim,
  Amp,
  AnchorCenter,
  Blink,
  CastRequest,
  Cooldown,
  Disarmed,
  Drop,
  FACTION,
  Faction,
  Followup,
  Frozen,
  Gear,
  Pulse,
  Radial,
  Shots,
  Manual,
  Minion,
  Owner,
  Swing,
  WallBlocked,
} from './components'
import { internAbilityDef } from './defs'
import { KIND_TAG } from './tags'
import type { Sim } from '../sim'

// 装备 = 把定义物化成实体。此后「谁有哪些能力」就是世界里的一批实体，
// 不再是某个对象持有的数组。

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

/** 把一条定义物化成能力实体，挂到持有者名下。返回 eid（未登记 tag 的 kind 返回 -1，
 * 不建实体——gen 校验保证不会走到这里） */
export function equipAbility(
  sim: Sim,
  ownerEid: number,
  def: AbilityDef,
  faction: number,
  initialCooldownMs: number,
  amp: AmpInit,
  manual = false,
): number {
  const tag = KIND_TAG[def.kind]
  if (!tag) return -1
  const world = sim.world
  const e = addEntity(world)
  // prettier-ignore
  addComponents(world, e, Ability, AbilityRef, Owner, Faction, Cooldown, Amp, Frozen, Disarmed, Followup, WallBlocked, Aim, Swing, Gear, Shots, Radial, Blink, Pulse, tag)
  if (manual) addComponent(world, e, Manual)
  AbilityRef.def[e] = internAbilityDef(def)
  Owner.eid[e] = ownerEid
  Faction.v[e] = faction
  Cooldown.left[e] = initialCooldownMs
  Amp.dmg[e] = amp.dmg
  Amp.cd[e] = amp.cd
  Amp.crit[e] = amp.crit
  Amp.kb[e] = amp.kb
  Amp.battle[e] = amp.battle ? 1 : 0
  Frozen.v[e] = 0
  Disarmed.v[e] = 0
  Followup.left[e] = 0
  Followup.damage[e] = 0
  WallBlocked.v[e] = abilityPiercesWalls(def) ? 0 : 1
  Aim.rad[e] = 0
  Shots.n[e] = 0
  Radial.left[e] = 0
  Pulse.dps[e] = 0
  Pulse.freeze[e] = 0
  Blink.x[e] = 0
  Blink.y[e] = 0
  Swing.startMs[e] = 0
  Swing.durMs[e] = 0
  Gear.eid[e] = 'held' in def && def.held ? spawnGear(sim, ownerEid, faction, def.held) : 0
  return e
}

/** 持有物子实体：挂在角色身上的能力 emoji，进批绘而非游离 GameObject */
function spawnGear(sim: Sim, ownerEid: number, faction: number, held: HeldVisual): number {
  const outline: OutlineKind =
    faction === FACTION.enemy ? (Elite.v[ownerEid] || Boss.v[ownerEid] ? 'elite' : 'enemy') : 'player'
  return spawnSprite(sim.world, sim.frames, {
    id: held.emoji,
    outline,
    x: Transform.x[ownerEid]!,
    y: Transform.y[ownerEid]!,
    size: held.size,
    z: 13,
  })
}

/** 收走某持有者名下的全部能力实体与它们的子实体（持有物、在途坠物）。
 * 持有者离场时调——eid 会被回收再分配，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const doomed: number[] = []
  for (const e of query(world, [Ability, Owner])) if (Owner.eid[e] === ownerEid) doomed.push(e)
  if (doomed.length === 0) return
  for (const d of query(world, [Drop, Owner])) if (doomed.includes(Owner.eid[d]!)) removeEntity(world, d)
  for (const m of query(world, [Minion, Owner])) if (doomed.includes(Owner.eid[m]!)) removeEntity(world, m)
  for (const e of doomed) {
    if (Gear.eid[e]) removeEntity(world, Gear.eid[e]!)
    removeEntity(world, e)
  }
}

/** 建一个队伍锚点实体：位置由 followTeamCenter 每帧同步到队伍中心。
 * 无本体的能力（队长技能载荷）以它为行为主体，于是「持有者位置」这一条对所有能力同构 */
export function spawnTeamAnchor(sim: Sim): number {
  const world = sim.world
  const eid = addEntity(world)
  addComponents(world, eid, AnchorCenter, Transform, Slot, Alive)
  Transform.x[eid] = sim.center.x
  Transform.y[eid] = sim.center.y
  Slot.v[eid] = -1 // 非队员来源：伤害不分账到任何槽位
  Alive.v[eid] = 1
  return eid
}

/** 手动施放：给某持有者名下的手动能力打上本帧施放请求（队长技能通道） */
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
