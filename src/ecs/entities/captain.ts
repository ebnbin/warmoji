import { addComponents, addEntity } from 'bitecs'
import { Alive, Captain, Magnet, MoveSpeed, Slot, Transform } from '../components'
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
  addComponents(world, eid, Captain, Transform, Slot, Alive, MoveSpeed, Magnet)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Slot.v[eid] = -1 // 非队员来源：伤害不分账到任何槽位
  Alive.v[eid] = 1
  MoveSpeed.v[eid] = moveSpeed
  Magnet.radius[eid] = magnetRadius
  return eid
}
