import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { DEG2RAD, UNIT } from '../util/units'
import { playSfx } from '../audio/sfx'
import type { ProjectileDef } from '../types/abilityDefs'
import {
  Alive,
  Depth,
  ENEMY_SET,
  EnemyProj,
  EProj,
  EPROJ_SET,
  Hurt,
  Iframe,
  Proj,
  PROJ_SET,
  Projectile,
  Quad,
  Radius,
  Sprite,
  Tint,
  Transform,
  Vel,
} from './components'
import { applyAbilityEffects } from './ability/effects'
import { boltSource } from './ability/source'
import { applyDamage, hurtMember } from './combat'
import { enemyDef, eprojSrcName, projHitEids, projOnHit } from './store'
import type { Sim } from './sim'
import type { FrameIndex } from './frames'

// 抛射物:装配 + 逐帧线段扫掠命中(pierce + 击退 + onHit 效果链),按视野/寿命回收。
// 敌弹另走圆-圆命中队员(吃无敌帧),回收条件由世界钩子补充。

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
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx
  const cy = ay + t * dy
  return (px - cx) * (px - cx) + (py - cy) * (py - cy)
}

/** 逐帧推进抛射物 + 线段扫掠命中 + 出界回收 */
export function updateProjectiles(sim: Sim, delta: number): void {
  const projs = query(sim.world, PROJ_SET as unknown as object[])
  if (projs.length === 0) return
  const dt = delta / 1000
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  // 回收按相机视野(镜像 cullProjectiles):无界世界没有地图边可依,视野才是通用口径
  const slack = 4 * UNIT
  const view = sim.view
  for (const eid of projs) {
    const ax = Transform.x[eid]!
    const ay = Transform.y[eid]!
    let bx = ax + Vel.x[eid]! * dt
    let by = ay + Vel.y[eid]! * dt
    // 环面回绕:回绕帧把扫掠线段起点一并挪过去,否则线段横贯全图产生假命中
    const wrapped = sim.hooks.wrap(sim, bx, by)
    const seamJump = wrapped.x !== bx || wrapped.y !== by
    bx = wrapped.x
    by = wrapped.y
    Transform.x[eid] = bx
    Transform.y[eid] = by
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt

    // 线段扫掠命中:收集命中(按段上距离排序),依次施伤直到贯穿耗尽。
    // 回绕帧线段退化为一点(起点即落点),本帧不判命中
    const sx = seamJump ? bx : ax
    const sy = seamJump ? by : ay
    const hit = projHitEids[eid]!
    const pr = Proj.radius[eid]!
    // t = 目标在线段上的投影参数(排序键,镜像 sweepFirstHitIndex);d2 = 到起点的中心距²(撞墙比较用)
    const found: { enemy: number; t: number; d2: number }[] = []
    const segX = bx - sx
    const segY = by - sy
    const segLen2 = segX * segX + segY * segY
    for (const en of enemies) {
      if (hit.has(en)) continue
      const rr = pr + Radius.v[en]!
      // 目标位置取相对线段起点的最近镜像(环面:隔缝命中也成立)
      const w = sim.hooks.worldDelta(sim, sx, sy, Transform.x[en]!, Transform.y[en]!)
      const tx2 = sx + w.x
      const ty2 = sy + w.y
      if (segDistSq(tx2, ty2, sx, sy, bx, by) > rr * rr) continue
      const proj = segLen2 > 0 ? Math.max(0, Math.min(1, (w.x * segX + w.y * segY) / segLen2)) : 0
      found.push({ enemy: en, t: proj, d2: w.x * w.x + w.y * w.y })
    }
    found.sort((p, q) => p.t - q.t)
    // 残垣图:子弹撞墙即销毁(墙比最近命中点更近时,本帧命中作废)——无墙图 wallHit 恒 null
    const wall = sim.hooks.wallHit(sim, sx, sy, bx, by)
    if (wall !== null) {
      const dw = (wall.x - sx) ** 2 + (wall.y - sy) ** 2
      const first = found[0]
      if (!first || dw <= first.d2) {
        cull(sim, eid)
        continue
      }
    }
    let dead = false
    const onHit = projOnHit[eid]
    // 每帧只结算首个命中(镜像旧实现:命中一个即收尾,贯穿弹靠下一帧继续推进)
    const f = found[0]
    if (f !== undefined && enemyDef[f.enemy] !== undefined) {
      hit.add(f.enemy)
      const hx = Transform.x[f.enemy]!
      const hy = Transform.y[f.enemy]!
      applyDamage(sim, f.enemy, Proj.damage[eid]!, Proj.kb[eid]!, sx, sy, Proj.srcSlot[eid]!)
      // 命中效果链(溅射/减速/毒/变羊…):主目标排除出溅射圈。
      // 归属随弹丸走——子弹常比发射者活得久,故来源是一份值而非能力实体
      if (onHit && onHit.length > 0) {
        applyAbilityEffects(sim, boltSource(Proj.srcSlot[eid]!), onHit, {
          x: hx,
          y: hy,
          baseDamage: Proj.damage[eid]!,
          targets: [f.enemy],
          exclude: new Set([f.enemy]),
        })
      }
      if (Proj.pierce[eid]! <= 0) dead = true
      else Proj.pierce[eid] = Proj.pierce[eid]! - 1
    }
    if (dead) {
      cull(sim, eid)
      continue
    }
    // 寿命制(环面)优先;否则飞出视野一段即灭
    if (Proj.dieAt[eid] !== 0) {
      if (sim.elapsedMs >= Proj.dieAt[eid]!) cull(sim, eid)
    } else if (bx < view.x - slack || bx > view.right + slack || by < view.y - slack || by > view.bottom + slack) {
      cull(sim, eid)
    }
  }
}

function cull(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  removeEntity(sim.world, eid)
}

// ── 敌弹(P3e):物理 overlap 命中队员 + 按寿命/出界回收(镜像 spawnEnemyProjectile)──

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
export function updateEnemyProjectiles(sim: Sim, delta: number): void {
  const shots = query(sim.world, EPROJ_SET as unknown as object[])
  if (shots.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  for (const eid of shots) {
    const moved = sim.hooks.wrap(sim, Transform.x[eid]! + Vel.x[eid]! * dt, Transform.y[eid]! + Vel.y[eid]! * dt)
    const x = moved.x
    const y = moved.y
    Transform.x[eid] = x
    Transform.y[eid] = y
    // 命中队员:圆-圆(敌弹半径 + 队员受击半径),吃无敌帧节流
    let hitMember = false
    const pr = EProj.radius[eid]!
    if (!sim.over) {
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        const rr = pr + Hurt.radius[m]!
        const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
        if (d.x * d.x + d.y * d.y > rr * rr) continue
        if (now - Iframe.last[m]! < Iframe.ms[m]!) {
          hitMember = true // 命中但被无敌帧挡下:敌弹照常销毁
          break
        }
        Iframe.last[m] = now
        hurtMember(sim, m, EProj.damage[eid]!, eprojSrcName[eid])
        hitMember = true
        break
      }
    }
    if (hitMember) {
      removeEntity(sim.world, eid)
      continue
    }
    // 寿命回收 + 世界钩子的额外回收(有界图出地图即灭;无界只按寿命)
    if (now >= EProj.dieAt[eid]! || sim.hooks.cullEnemyProjectile(sim, x, y)) removeEntity(sim.world, eid)
  }
}
