import { addComponent, addEntity, hasComponent } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { Bolt, Depth, EProj, EnemyProj, Pierce, Proj, Projectile, Quad, Shoot, Sprite, Tint, Transform, Vel } from '../components'
import { abilityOnHit, eprojSrcName, projHitEids, projOnHit } from '../store'
import type { Sim } from '../sim'

// 抛射物实体的生成:我方弹与敌弹各一个工厂。
// 逐帧线段扫掠命中 / 圆-圆命中 / 回收在 ../projectile.ts。

/** 发射一枚玩家弹。弹的外形与飞行参数全在**开火那条能力**的 Bolt/Shoot/Pierce 组件上,
 * 装备那一刻就抄好了(见 registries/abilityKinds.ts) */
export function spawnProjectileEcs(
  sim: Sim,
  src: number,
  x: number,
  y: number,
  angle: number,
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
  const rotOffset = Bolt.rotOffset[src]!
  const size = Bolt.size[src]!
  const speed = Bolt.speed[src]!
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = angle + rotOffset * DEG2RAD
  Transform.w[eid] = size
  Transform.h[eid] = size
  Vel.x[eid] = Math.cos(angle) * speed
  Vel.y[eid] = Math.sin(angle) * speed
  Proj.damage[eid] = damage
  Proj.radius[eid] = Bolt.radius[src]!
  Proj.kb[eid] = Shoot.knockback[src]!
  Proj.srcSlot[eid] = srcSlot
  Proj.pierce[eid] = hasComponent(sim.world, src, Pierce) ? Pierce.n[src]! : 0
  Proj.spin[eid] = rotOffset === 0 ? 9 : 0
  // 环面上子弹永远飞不出屏,只能按寿命回收(其余图恒 0 = 按视野回收)
  const life = sim.hooks.projectileLifeMs(sim)
  Proj.dieAt[eid] = life > 0 ? sim.elapsedMs + life : 0
  Sprite.frame[eid] = Bolt.frame[src]!
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 8
  Quad.v[eid] = 0
  projOnHit[eid] = abilityOnHit[src]
  projHitEids[eid] = new Set()
  playSfx('shoot')
}

/** 敌弹描述(能力侧 spawnProjectile 归约后的基本载荷;外形已解析成 frame) */
export interface EnemyShotSpec {
  frame: number
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
  Sprite.frame[eid] = spec.frame
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 6
  Quad.v[eid] = 0
  eprojSrcName[eid] = spec.srcName
}

/** 逐帧推进敌弹 + 与队员圆-圆命中(吃无敌帧)+ 寿命/出界回收 */
