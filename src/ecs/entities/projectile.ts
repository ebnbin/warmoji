import { addComponents, hasComponent } from 'bitecs'
import { newEntity } from './entity'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import {
  Bolt, Depth, FACTION, Faction, Pierce, PrevPos, Proj, Projectile, Quad, Shoot,
  Sprite, Tint, Transform, Vel, VisOff,
} from '../components'
import { abilityOnHit, projHitUids, projOnHit, projSrcEnemy } from '../store'
import type { EnemyKind } from '../../types/enemies'
import type { Sim } from '../sim'


function spawnBolt(
  sim: Sim,
  x: number,
  y: number,
  angle: number,
  faction: number,
  art: { frame: number; size: number; speed: number; rot: number },
): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Projectile, Transform, Vel, Proj, PrevPos, Faction, Sprite, Tint, Depth, VisOff)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = art.rot
  Transform.w[eid] = art.size
  Transform.h[eid] = art.size
  PrevPos.x[eid] = x
  PrevPos.y[eid] = y
  Vel.x[eid] = Math.cos(angle) * art.speed
  Vel.y[eid] = Math.sin(angle) * art.speed
  Faction.v[eid] = faction
  Sprite.frame[eid] = art.frame
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Quad.v[eid] = 0
  return eid
}

export function spawnProjectile(
  sim: Sim,
  src: number,
  x: number,
  y: number,
  angle: number,
  damage: number,
  srcSlot: number,
): void {
  const rotOffset = Bolt.rotOffset[src]!
  const eid = spawnBolt(sim, x, y, angle, FACTION.team, {
    frame: Bolt.frame[src]!,
    size: Bolt.size[src]!,
    speed: Bolt.speed[src]!,
    rot: angle + rotOffset * DEG2RAD,
  })
  Proj.damage[eid] = damage
  Proj.radius[eid] = Bolt.radius[src]!
  Proj.kb[eid] = Shoot.knockback[src]!
  Proj.srcSlot[eid] = srcSlot
  Proj.pierce[eid] = hasComponent(sim.world, src, Pierce) ? Pierce.n[src]! : 0
  Proj.spin[eid] = rotOffset === 0 ? 9 : 0
  const mapLife = sim.hooks.projectileLifeMs(sim)
  const life = mapLife > 0 ? Math.min(mapLife, Shoot.lifeMs[src]!) : Shoot.lifeMs[src]!
  Proj.dieAt[eid] = sim.elapsedMs + life
  Depth.z[eid] = 8
  projOnHit[eid] = abilityOnHit[src]
  projHitUids[eid] = new Set()
  projSrcEnemy[eid] = undefined
  playSfx('shoot')
}

export interface EnemyShotSpec {
  frame: number
  size: number
  radius: number
  speed: number
  damage: number
  lifeMs: number
  srcEnemy?: EnemyKind
}

export function spawnEnemyProjectile(
  sim: Sim,
  x: number,
  y: number,
  angle: number,
  spec: EnemyShotSpec,
): void {
  const eid = spawnBolt(sim, x, y, angle, FACTION.enemy, {
    frame: spec.frame,
    size: spec.size,
    speed: spec.speed,
    rot: 0,
  })
  Proj.damage[eid] = Math.round(spec.damage)
  Proj.radius[eid] = spec.radius
  Proj.kb[eid] = 0
  Proj.srcSlot[eid] = -1
  Proj.pierce[eid] = 0
  Proj.spin[eid] = 0
  Proj.dieAt[eid] = sim.elapsedMs + spec.lifeMs
  Depth.z[eid] = 6
  projOnHit[eid] = undefined
  projHitUids[eid] = new Set()
  projSrcEnemy[eid] = spec.srcEnemy
}
