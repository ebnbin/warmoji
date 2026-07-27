import { addComponent, addComponents, addEntity, hasComponent } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import {
  Bolt, Depth, FACTION, Faction, Pierce, PrevPos, Proj, Projectile, Quad, Shoot,
  Sprite, SweptHit, Tint, Transform, Vel, ViewCull, WallStop, WorldCull,
} from '../components'
import { abilityOnHit, projHitEids, projOnHit, projSrcName } from '../store'
import type { Sim } from '../sim'

// 抛射物实体：**我方弹与敌弹是同一种实体**。打哪一侧由 Faction 决定（索敌与施伤都经
// 阵营中立的 targetsOf / damageTarget），行为差异全在几个可选组件上：
//
//   SweptHit  线段扫掠命中（高速弹不穿模）—— 敌弹慢，不挂，走圆-圆
//   WallStop  撞墙即销毁（残垣图）—— 敌弹不判
//   ViewCull  出视野即回收 —— 与 Proj.dieAt 二选一（环面按寿命）
//   WorldCull 世界钩子回收（有界图出图即灭）
//
// 从前这是两种实体（Projectile/EnemyProj + Proj/EProj + 两套查询集 + 两个更新系统），
// 而那四条差异没有一条是「阵营」造成的。

/** 两侧共用的弹体骨架：位姿 + 速度 + 外形 + 归属，返回 eid */
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

/** 发射一枚我方弹。弹的外形与飞行参数全在**开火那条能力**的 Bolt/Shoot/Pierce 组件上,
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
  // 环面上子弹永远飞不出屏,只能按寿命回收；其余图按视野
  const life = sim.hooks.projectileLifeMs(sim)
  Proj.dieAt[eid] = life > 0 ? sim.elapsedMs + life : 0
  if (life <= 0) addComponent(sim.world, eid, ViewCull)
  Depth.z[eid] = 8
  projOnHit[eid] = abilityOnHit[src]
  projHitEids[eid] = new Set()
  projSrcName[eid] = undefined
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

/** 发射一枚敌弹(伤害已含 dmgMul,不再二次乘) */
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
  Proj.srcSlot[eid] = -1 // 敌方来源不分账到槽位，按名字归属
  Proj.pierce[eid] = 0
  Proj.spin[eid] = 0
  Proj.dieAt[eid] = sim.elapsedMs + spec.lifeMs
  Depth.z[eid] = 6
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  projSrcName[eid] = spec.srcName
}
