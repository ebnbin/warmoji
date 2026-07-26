import { addComponent, addEntity } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import type { ProjectileDef } from '../../types/abilityDefs'
import { Depth, EnemyProj, EProj, Proj, Projectile, Quad, Sprite, Tint, Transform, Vel } from '../components'
import { eprojSrcName, projHitEids, projOnHit } from '../store'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'

// 抛射物实体的生成:我方弹与敌弹各一个工厂。
// 逐帧线段扫掠命中 / 圆-圆命中 / 回收在 ../projectile.ts。

/** 发射一枚玩家弹(镜像 spawnProjectile) */
export function spawnProjectileEcs(
  sim: Sim,
  atlas: FrameIndex,
  x: number,
  y: number,
  angle: number,
  def: ProjectileDef,
  damage: number,
  srcSlot: number,
): void {
  const eid = addEntity(sim.world)
  addComponent(sim.world, eid, Projectile)
  addComponent(sim.world, eid, Transform)
  addComponent(sim.world, eid, Vel)
  addComponent(sim.world, eid, Proj)
  addComponent(sim.world, eid, Sprite)
  addComponent(sim.world, eid, Tint)
  addComponent(sim.world, eid, Depth)
  const p = def.projectile
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = angle + p.rotationOffsetDeg * DEG2RAD
  Transform.w[eid] = p.size
  Transform.h[eid] = p.size
  Vel.x[eid] = Math.cos(angle) * p.speed
  Vel.y[eid] = Math.sin(angle) * p.speed
  Proj.damage[eid] = damage
  Proj.radius[eid] = p.radius
  Proj.kb[eid] = def.knockback
  Proj.srcSlot[eid] = srcSlot
  Proj.pierce[eid] = def.pierce ?? 0
  Proj.spin[eid] = p.rotationOffsetDeg === 0 ? 9 : 0
  // 环面上子弹永远飞不出屏,只能按寿命回收(其余图恒 0 = 按视野回收)
  const life = sim.hooks.projectileLifeMs(sim)
  Proj.dieAt[eid] = life > 0 ? sim.elapsedMs + life : 0
  Sprite.frame[eid] = atlas.index(p.emoji, 'player')
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 8
  Quad.v[eid] = 0
  projOnHit[eid] = def.onHit
  projHitEids[eid] = new Set()
  playSfx('shoot')
}

/** 点到线段的距离平方 */

/** 敌弹描述(能力侧 spawnProjectile 归约后的基本载荷) */
export interface EnemyShotSpec {
  emoji: string
  size: number
  radius: number
  speed: number
  damage: number
  lifeMs: number
  /** 伤害来源名(结算页敌情明细按敌人名归属) */
  srcName?: string
}

/** 发射一枚敌弹(镜像 spawnEnemyProjectile;伤害已含 dmgMul,不再二次乘) */
export function spawnEnemyProjectileEcs(
  sim: Sim,
  atlas: FrameIndex,
  x: number,
  y: number,
  angle: number,
  spec: EnemyShotSpec,
): void {
  const eid = addEntity(sim.world)
  addComponent(sim.world, eid, EnemyProj)
  addComponent(sim.world, eid, Transform)
  addComponent(sim.world, eid, Vel)
  addComponent(sim.world, eid, EProj)
  addComponent(sim.world, eid, Sprite)
  addComponent(sim.world, eid, Tint)
  addComponent(sim.world, eid, Depth)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Transform.w[eid] = spec.size
  Transform.h[eid] = spec.size
  Vel.x[eid] = Math.cos(angle) * spec.speed
  Vel.y[eid] = Math.sin(angle) * spec.speed
  EProj.damage[eid] = Math.round(spec.damage)
  EProj.radius[eid] = spec.radius
  EProj.dieAt[eid] = sim.elapsedMs + spec.lifeMs
  Sprite.frame[eid] = atlas.index(spec.emoji, 'enemyProjectile')
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 6
  Quad.v[eid] = 0
  eprojSrcName[eid] = spec.srcName
}

/** 逐帧推进敌弹 + 与队员圆-圆命中(吃无敌帧)+ 寿命/出界回收 */
