import { addComponent, addComponents, addEntity } from 'bitecs'
import { abilityPiercesWalls } from '../../war/abilityRules'
import type { AbilityDef } from '../../types/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { attachDrawable } from '../drawable'
import { Ability, AbilityRef, Aim, Amp, Blink, Boss, Cooldown, Disarmed, Elite, FACTION, Faction, Followup, Frozen, Manual, Owner, Pulse, Radial, Shots, Swing, Transform, WallBlocked, Weapon } from '../components'
import type { AmpInit } from '../ability/equip'
import { internAbilityDef } from '../ability/defs'
import { KIND_TAG } from '../ability/tags'
import type { Sim } from '../sim'

// 武器实体：**一件武器就是一颗实体**，能力是挂在它身上的组件
//（AbilityRef 是哪条能力、Cooldown 还有多久出手、Aim 朝哪、Amp 吃哪些乘区、kind tag 归谁管）。
//
// 有外形的（def.held）自带 Transform/Sprite/Tint/Depth，就是场上握在手里的那个 emoji，
// 各 kind 的施放系统直接写它自己的位姿——不再有「能力实体 + 持有物子实体」两层。
// 徒手能力（无 held）是同一种实体，只是没有身体，不进批绘。
//
// 为什么武器必须是实体而不是角色身上的组件：牛仔左右两把枪要各带一份冷却/瞄准/出手计数，
// 军医的战地医疗与飞针同理——组件按 eid 索引，一个实体只有一格，装不下两份。
//
// Owner.eid 指持有者（角色 / 敌人 / 队长）；反过来，武器造出来的子实体
//（召唤物、坠物、双子镖）的归属指回武器实体。

/** 把一条能力定义物化成一件武器，挂到持有者名下。返回 eid
 *（未登记 tag 的 kind 返回 -1，不建实体——gen 校验保证不会走到这里） */
export function spawnWeapon(
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
  addComponents(world, e, Weapon, Ability, AbilityRef, Owner, Faction, Cooldown, Amp, Frozen, Disarmed, Followup, WallBlocked, Aim, Swing, Shots, Radial, Blink, Pulse, tag)
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
  // 有外形才长身体：描边随持有者阵营（精英/Boss 走金边）
  if ('held' in def && def.held) {
    const outline: OutlineKind =
      faction === FACTION.enemy ? (Elite.v[ownerEid] || Boss.v[ownerEid] ? 'elite' : 'enemy') : 'player'
    attachDrawable(world, e, sim.frames, {
      id: def.held.emoji,
      outline,
      x: Transform.x[ownerEid]!,
      y: Transform.y[ownerEid]!,
      size: def.held.size,
      z: 13,
    })
  }
  return e
}
