import { addComponent, addComponents, addEntity, hasComponent } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import {
  Bolt, Depth, FACTION, Faction, Pierce, PrevPos, Proj, Projectile, Quad, Shoot,
  Sprite, SweptHit, Tint, Transform, Vel, ViewCull, WallStop, WorldCull,
} from '../components'
import { abilityOnHit, projHitEids, projOnHit, projSrcName } from '../store'
import type { Sim } from '../sim'


function spawnBolt(
  sim: Sim,
  x: number,
  y: number,
  angle: number,
  faction: number,
  art: { frame: number; size: number; speed: number; rotOffsetDeg: number },
): number {
  const eid = addEntity(sim.world)
  // prettier-ignore
  addComponents(sim.world, eid, Projectile, Transform, Vel, Proj, PrevPos, Faction, Sprite, Tint, Depth)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = angle + art.rotOffsetDeg * DEG2RAD
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

/** 外形与飞行参数取自开火那条能力的组件 */
export function spawnProjectileEcs(
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
    rotOffsetDeg: rotOffset,
  })
  addComponents(sim.world, eid, SweptHit, WallStop)
  Proj.damage[eid] = damage
  Proj.radius[eid] = Bolt.radius[src]!
  Proj.kb[eid] = Shoot.knockback[src]!
  Proj.srcSlot[eid] = srcSlot
  Proj.pierce[eid] = hasComponent(sim.world, src, Pierce) ? Pierce.n[src]! : 0
  Proj.spin[eid] = rotOffset === 0 ? 9 : 0
  const life = sim.hooks.projectileLifeMs(sim)
  Proj.dieAt[eid] = life > 0 ? sim.elapsedMs + life : 0
  if (life <= 0) addComponent(sim.world, eid, ViewCull)
  Depth.z[eid] = 8
  projOnHit[eid] = abilityOnHit[src]
  projHitEids[eid] = new Set()
  projSrcName[eid] = undefined
  playSfx('shoot')
}

export interface EnemyShotSpec {
  frame: number
  size: number
  radius: number
  speed: number
  damage: number
  lifeMs: number
  /** 结算页按敌人名归属 */
  srcName?: string
}

/** 伤害已含 dmgMul */
export function spawnEnemyProjectileEcs(
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
    rotOffsetDeg: 0,
  })
  addComponent(sim.world, eid, WorldCull)
  Proj.damage[eid] = Math.round(spec.damage)
  Proj.radius[eid] = spec.radius
  Proj.kb[eid] = 0 // 队员没有击退机制
  Proj.srcSlot[eid] = -1 // 按名字归属
  Proj.pierce[eid] = 0
  Proj.spin[eid] = 0
  Proj.dieAt[eid] = sim.elapsedMs + spec.lifeMs
  Depth.z[eid] = 6
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  projSrcName[eid] = spec.srcName
}
