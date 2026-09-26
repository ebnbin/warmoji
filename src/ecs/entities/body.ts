import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Alive, Casting, Clock, Depth, Drive, Faction, Hp, Mark, Phys, Radius, Sprinting, SpeedMul, Sprite, Tint, Transform, VisOff } from '../components'
import type { EcsWorld } from '../world'

interface BodySpec {
  readonly faction: number
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly hp: number
  readonly thrust: number
  readonly drag: number
  readonly mass: number
  readonly grip: number
  /** 走自己的钟就不受时停 */
  readonly ownClock: boolean
}

/** 一个身体：有位置、阵营、体积、血量、力学和标记，能施法、能被画；角色和敌人都从这里出生，再各自加上身份 */
export function spawnBody(world: EcsWorld, spec: BodySpec): number {
  const eid = newEntity(world)
  addComponents(world, eid, Alive, Hp, Mark, Phys, Drive, Clock, Faction, Radius, Sprinting, SpeedMul, Casting, Transform, Sprite, Tint, Depth, VisOff)
  Alive.v[eid] = 1
  Hp.v[eid] = spec.hp
  Hp.max[eid] = spec.hp
  Phys.thrust[eid] = spec.thrust
  Phys.drag[eid] = spec.drag
  Phys.mass[eid] = spec.mass
  Phys.grip[eid] = spec.grip
  Clock.v[eid] = spec.ownClock ? 1 : 0
  Faction.v[eid] = spec.faction
  Radius.v[eid] = spec.radius
  SpeedMul.v[eid] = 1
  Transform.x[eid] = spec.x
  Transform.y[eid] = spec.y
  Tint.color[eid] = 0xffffff
  Tint.alpha[eid] = 1
  return eid
}
