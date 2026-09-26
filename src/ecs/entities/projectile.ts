import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { DEG2RAD } from '../../util/units'
import { Depth, Faction, PrevPos, Proj, Projectile, Quad, Sprite, Tint, Transform, Vel, VisOff } from '../components'
import { projHitUids, projOnHit, projSrcEnemy } from '../store'
import type { Effect } from '../../types/abilityDefs'
import type { EnemyKind } from '../../types/enemies'
import type { Sim } from '../sim'

export interface BoltSpec {
  readonly faction: number
  readonly frame: number
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly rotOffsetDeg: number
  readonly lifeMs: number
  readonly pierce: number
  readonly damage: number
  readonly knockback: number
  readonly srcSlot: number
  readonly srcEnemy?: EnemyKind
  readonly onHit?: readonly Effect[]
}

/** 弹体：直线飞行、一帧扫掠一段的飞行物，敌我同一种；无朝向的弹体自转 */
export function spawnBolt(sim: Sim, x: number, y: number, angle: number, spec: BoltSpec): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Projectile, Transform, Vel, Proj, PrevPos, Faction, Sprite, Tint, Depth, VisOff)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = spec.rotOffsetDeg === 0 ? 0 : angle + spec.rotOffsetDeg * DEG2RAD
  Transform.w[eid] = spec.size
  Transform.h[eid] = spec.size
  PrevPos.x[eid] = x
  PrevPos.y[eid] = y
  Vel.x[eid] = Math.cos(angle) * spec.speed
  Vel.y[eid] = Math.sin(angle) * spec.speed
  Faction.v[eid] = spec.faction
  Sprite.frame[eid] = spec.frame
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Quad.v[eid] = 0
  Proj.damage[eid] = Math.round(spec.damage)
  Proj.radius[eid] = spec.radius
  Proj.kb[eid] = spec.knockback
  Proj.srcSlot[eid] = spec.srcSlot
  Proj.pierce[eid] = spec.pierce
  Proj.spin[eid] = spec.rotOffsetDeg === 0 ? 9 : 0
  const mapLife = sim.hooks.projectileLifeMs(sim)
  Proj.dieAt[eid] = sim.elapsedMs + (mapLife > 0 ? Math.min(mapLife, spec.lifeMs) : spec.lifeMs)
  Depth.z[eid] = 8
  projOnHit[eid] = spec.onHit
  projHitUids[eid] = new Set()
  projSrcEnemy[eid] = spec.srcEnemy
  return eid
}
