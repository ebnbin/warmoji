import { addComponents, addEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { CHARACTERS } from '../../data/characters'
import { formationPosts } from '../../data/formation'
import { TEAM } from '../../data/characters'
import { currentFormation, guardOrder, hasCenter } from '../../run/state'
import type { RunState } from '../../run/state'
import type { FormationId } from '../../types/formation'
import type { EcsAtlas } from '../atlas'
import { spawnCharacter } from './character'
import { Alive, Captain, DanceWindow, Magnet, MoveSpeed, Slot, TeamDamage, Transform } from '../components'
import type { EcsWorld } from '../world'

// 队长实体：本局的行为主体与队伍锚点（位置即队伍中心）。
// 它没有碰撞箱、没有受击箱、也不绘制——但移速与拾取半径这些属性属于它，
// 队员绕着它编队，无本体的能力（队长技能载荷）以它为持有者。
// 旧框架里「一实体一 GameObject」，不可绘制的东西只能做成抽象概念；
// ECS 里它就是一个普通实体，只是挂的组件少。

/** 建队长实体。moveSpeed / magnetRadius 已含道具与卡牌乘区 */
export function spawnCaptain(
  world: EcsWorld,
  x: number,
  y: number,
  moveSpeed: number,
  magnetRadius: number,
): number {
  const eid = addEntity(world)
  addComponents(world, eid, Captain, Transform, Slot, Alive, MoveSpeed, Magnet, TeamDamage, DanceWindow)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Slot.v[eid] = -1 // 非队员来源：伤害不分账到任何槽位
  Alive.v[eid] = 1
  MoveSpeed.v[eid] = moveSpeed
  Magnet.radius[eid] = magnetRadius
  return eid
}

/** 队伍编队的派生结果：实体清单 + 供 Sim 用的编队参数 */
export interface TeamLayout {
  characters: number[]
  count: number
  formation: FormationId
  postBySlot: number[]
  lineupOrbit: number[]
}

/** 队长按阵型摆开自己的队伍：算出每个角色的岗位与坐标，逐个 spawnCharacter。
 *
 * 「谁站哪」是队长的知识，不是角色的——角色只被告知坐标与岗位。
 * 队伍绕着队长成环，故中心直接取队长实体的位置。 */
export function formTeam(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  testMode: boolean,
  captainEid: number,
): TeamLayout {
  const cx = Transform.x[captainEid]!
  const cy = Transform.y[captainEid]!
  const rosterIds = run.roster
  const count = rosterIds.length
  const formation = testMode ? 'ring' : currentFormation(run)
  // N 保 1：护卫序把某个角色排到中心岗位，故 slot ≠ post
  const order = testMode || !hasCenter(run) ? null : guardOrder(run)
  const postBySlot = rosterIds.map((id, slot) => {
    if (!order) return slot
    const post = order.indexOf(id)
    return post >= 0 ? post : slot
  })
  const posts = formationPosts(formation, count, 0)
  const characters: number[] = []
  for (let slot = 0; slot < count; slot++) {
    const post = postBySlot[slot] ?? slot
    const off = posts[post] ?? { x: 0, y: 0 }
    characters.push(
      spawnCharacter(world, atlas, run, testMode, {
        slot,
        post,
        x: cx + off.x,
        y: cy + off.y,
        depthOffsetY: off.y / UNIT,
        // 被保护的中心位受击圆减半，更难被敌人/敌弹摸到
        hurtRadiusMul: formation === 'guard' && post === 0 ? TEAM.guardCenterHurtboxMul : 1,
      }),
    )
  }
  return { characters, count, formation, postBySlot, lineupOrbit: rosterIds.map((id) => CHARACTERS[id].orbit) }
}
