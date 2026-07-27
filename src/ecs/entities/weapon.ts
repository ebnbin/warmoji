import { addComponent, addComponents, addEntity } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import type { HeldVisual } from '../../types/abilityDefs'
import type { OutlineKind } from '../../emoji/svg'
import { attachDrawable } from './drawable'
import { Boss, Depth, Elite, FACTION, Held, Quad, Sprite, Tint, Transform, Weapon } from '../components'
import type { Sim } from '../sim'

// 武器实体 = **一件握在手里、看得见的东西**。它只负责「有形体」这一件事：
// Weapon + Held + 绘制包，如此而已。能力不在这里挂——是 ops/equip.ts 的 equipAbility
// 决定把能力组件挂到这颗身体上，还是直接挂到施放者自己身上（徒手能力）。
//
// 为什么徒手能力不需要这颗实体：能力所需的一切（参数、冷却、瞄准、各 kind 的状态）
// 现在都在「这一种能力」自己的组件里，一个宿主同时挂治疗与飞针互不干扰。
// 从前冷却挂在共享组件上，一格装不下两份，才被迫每条能力造一颗实体。
//
// 那什么时候还需要它：① 有外形要画、要摆位（各 place*Body 系统查 Held）；
// ② 同一个人身上要挂两条**同种**能力——牛仔的左右两把枪都是 projectile，
// 组件按 eid 只有一格，只能靠两颗实体各装一份。这两件事在数据里恰好总是同时成立。

/** 造一件武器的身体，挂到持有者名下。返回 eid——能力由调用方挂到它身上 */
export function spawnWeaponBody(sim: Sim, holderEid: number, held: HeldVisual, faction: number): number {
  const world = sim.world
  const e = addEntity(world)
  addComponent(world, e, Weapon)
  // 描边随持有者阵营（敌械与我方武器用不同外圈）
  const outline: OutlineKind =
    faction === FACTION.enemy ? (Elite.v[holderEid] || Boss.v[holderEid] ? 'elite' : 'enemy') : 'player'
  attachDrawable(world, e, sim.frames, {
    id: held.emoji,
    outline,
    x: Transform.x[holderEid]!,
    y: Transform.y[holderEid]!,
    size: held.size,
    z: 13,
  })
  addComponent(world, e, Held)
  Held.restOffset[e] = held.restOffset
  Held.rotOffset[e] = held.rotationOffsetDeg * DEG2RAD
  Held.side[e] = held.mountSide ?? 0
  Held.gap[e] = held.mountGap ?? 0
  Held.size[e] = held.size
  return e
}

/** 掷出去的一枚武器副本（双子镖）：与本体同外形同变体，只在飞行期存在，接住即离场。
 * 它不带能力、不属于谁的装备，只是那把武器的一个分身。
 * 外形全照本体的组件取——能掷出去的武器必然有身体 */
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
