import { addComponent, addComponents, addEntity } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import type { AbilityDef } from '../../types/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { attachDrawable } from './drawable'
import { Boss, Depth, Elite, FACTION, Held, Quad, Sprite, Tint, Transform, Weapon } from '../components'
import { attachAbility } from '../ops/equip'
import type { AmpInit } from '../ops/equip'
import type { Sim } from '../sim'

// 武器实体：**一件武器就是一颗实体**，能力是挂在它身上的组件
//（AbilityRef 是哪条能力、Cooldown 还有多久出手、Aim 朝哪、Amp 吃哪些乘区、kind tag 归谁管）。
//
// 有外形的自带 Held + Transform/Sprite/Tint/Depth，就是场上握在手里的那个 emoji，
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
  // 有外形才长身体：Held 一挂，各 kind 的摆位系统就扫得到它（描边随持有者阵营）
  if ('held' in def && def.held) {
    const h = def.held
    const outline: OutlineKind =
      faction === FACTION.enemy ? (Elite.v[ownerEid] || Boss.v[ownerEid] ? 'elite' : 'enemy') : 'player'
    attachDrawable(world, e, sim.frames, {
      id: h.emoji,
      outline,
      x: Transform.x[ownerEid]!,
      y: Transform.y[ownerEid]!,
      size: h.size,
      z: 13,
    })
    addComponent(world, e, Held)
    Held.restOffset[e] = h.restOffset
    Held.rotOffset[e] = h.rotationOffsetDeg * DEG2RAD
    Held.side[e] = h.mountSide ?? 0
    Held.gap[e] = h.mountGap ?? 0
    Held.size[e] = h.size
  }
  return e
}

/** 掷出去的一枚武器副本（双子镖）：与本体同外形同变体，只在飞行期存在，接住即离场。
 * 它不是一件武器（不带能力、不属于谁的装备），只是那把武器的一个分身。
 * 外形全照本体的组件取——本体必然带 Held（能掷出去的武器都有外形） */
export function spawnWeaponCopy(sim: Sim, weaponEid: number): number {
  const t = addEntity(sim.world)
  addComponents(sim.world, t, Transform, Sprite, Tint, Depth, Quad)
  const size = Held.size[weaponEid]!
  Transform.x[t] = Transform.x[weaponEid]!
  Transform.y[t] = Transform.y[weaponEid]!
  Transform.rot[t] = Transform.rot[weaponEid]!
  Transform.w[t] = size
  Transform.h[t] = size
  Sprite.frame[t] = Sprite.frame[weaponEid]! // 同一 atlas 变体（描边已随持有者定好）
  Sprite.flipX[t] = 0
  Tint.color[t] = 0xffffff
  Tint.effect[t] = 0
  Tint.alpha[t] = 1
  Depth.z[t] = 13
  Quad.v[t] = 0
  return t
}
