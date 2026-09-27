import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Alive, Casting, Clock, Ctl, Depth, Drive, Faction, Grow, Hp, Idle, Leech, Lethal, Mark, Motion, MotionHit, Phys, Radius, Sprite, Stamina, Tint, Transform, VisOff } from '../components'
import { attachStats } from '../utils/stats'
import type { StatBase } from '../../types/stats'
import type { EcsWorld } from '../world'

interface BodySpec {
  readonly faction: number
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 属性表的基础值：生命上限、移速等 */
  readonly stats: StatBase
  readonly drag: number
  readonly mass: number
  readonly grip: number
  /** 走自己的钟就不受时停 */
  readonly ownClock: boolean
}

/** 一个身体：有位置、阵营、体积、属性表、力学和标记，能施法、能被画；角色和敌人都从这里出生，再各自加上身份；出生满血 */
export function spawnBody(world: EcsWorld, spec: BodySpec): number {
  const eid = newEntity(world)
  addComponents(world, eid, Alive, Hp, Mark, Phys, Drive, Clock, Faction, Radius, Motion, MotionHit, Ctl, Stamina, Casting, Transform, Sprite, Tint, Depth, VisOff, Lethal, Leech, Grow, Idle)
  Alive.v[eid] = 1
  Phys.drag[eid] = spec.drag
  Phys.mass[eid] = spec.mass
  Phys.grip[eid] = spec.grip
  Clock.v[eid] = spec.ownClock ? 1 : 0
  Faction.v[eid] = spec.faction
  Radius.v[eid] = spec.radius
  Grow.r0[eid] = spec.radius
  Grow.v[eid] = 1
  Stamina.v[eid] = 1
  Stamina.restMs[eid] = 0
  MotionHit.stamp[eid] = -1
  Ctl.move[eid] = 1
  Ctl.act[eid] = 1
  Ctl.cast[eid] = 1
  Ctl.dash[eid] = 1
  Transform.x[eid] = spec.x
  Transform.y[eid] = spec.y
  Tint.color[eid] = 0xffffff
  Tint.alpha[eid] = 1
  attachStats(world, eid, spec.stats)
  Hp.v[eid] = Hp.max[eid]!
  return eid
}
