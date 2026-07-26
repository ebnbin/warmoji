import { addComponent, addEntity } from 'bitecs'
import type { AbilityDef, HeldVisual } from '../../types/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { attachDrawable } from '../drawable'
import { Boss, Elite, FACTION, Faction, Sprite, Transform, Weapon } from '../components'
import { attachAbility } from '../ability/equip'
import type { AmpInit } from '../ability/equip'
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
  const world = sim.world
  const e = addEntity(world)
  addComponent(world, e, Weapon)
  // 武器的施放锚点是持有者：枪口从人身上算起（弩塔那种自持能力的锚点是它自己）
  if (!attachAbility(sim, e, def, { owner: ownerEid, anchor: ownerEid, faction, cooldownMs: initialCooldownMs, amp, manual })) {
    return -1
  }
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

/** 掷出去的一枚武器副本（双子镖）：与本体同外形同变体，只在飞行期存在，接住即离场。
 * 它不是一件武器（不带能力、不属于谁的装备），只是那把武器的一个分身 */
export function spawnWeaponCopy(sim: Sim, weaponEid: number, held: HeldVisual): number {
  const t = addEntity(sim.world)
  attachDrawable(sim.world, t, sim.frames, {
    id: held.emoji,
    outline: Faction.v[weaponEid] === FACTION.enemy ? 'enemy' : 'player',
    x: Transform.x[weaponEid]!,
    y: Transform.y[weaponEid]!,
    size: held.size,
    z: 13,
  })
  Sprite.frame[t] = Sprite.frame[weaponEid]! // 与本体同一变体（描边随持有者）
  return t
}
