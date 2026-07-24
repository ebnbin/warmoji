import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { DEG2RAD, UNIT } from '../core/units'
import { playSfx } from '../audio/sfx'
import type { ProjectileDef } from '../abilities/defs'
import {
  Depth,
  ENEMY_SET,
  Hp,
  Proj,
  Projectile,
  PROJ_SET,
  Radius,
  Sprite,
  Tint,
  Transform,
  Vel,
} from './components'
import { applyEffects } from '../abilities/effects'
import type { TargetInfo } from '../abilities/types'
import { applyDamage } from './combat'
import { enemyRef, projHitEids, projOnHit } from './store'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'

// 玩家抛射物(P3c):装配 + 逐帧线段扫掠命中(pierce + 击退),出界回收。
// onHit 命中效果链(溅射/毒/变羊)在 P3d 追加;敌弹在后续增量。

/** 发射一枚玩家弹(镜像 spawnProjectile) */
export function spawnProjectileEcs(
  sim: Sim,
  atlas: EcsAtlas,
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
  Proj.dieAt[eid] = 0
  Sprite.frame[eid] = atlas.index(p.emoji, 'player')
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 8
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
  const slack = 4 * UNIT
  for (const eid of projs) {
    const ax = Transform.x[eid]!
    const ay = Transform.y[eid]!
    const bx = ax + Vel.x[eid]! * dt
    const by = ay + Vel.y[eid]! * dt
    Transform.x[eid] = bx
    Transform.y[eid] = by
    if (Proj.spin[eid] !== 0) Transform.rot[eid] = Transform.rot[eid]! + Proj.spin[eid]! * dt

    // 线段扫掠命中:收集命中(按段上距离排序),依次施伤直到贯穿耗尽
    const hit = projHitEids[eid]!
    const pr = Proj.radius[eid]!
    const found: { enemy: number; t: number }[] = []
    for (const en of enemies) {
      if (hit.has(en)) continue
      const rr = pr + Radius.v[en]!
      if (segDistSq(Transform.x[en]!, Transform.y[en]!, ax, ay, bx, by) > rr * rr) continue
      const dpx = Transform.x[en]! - ax
      const dpy = Transform.y[en]! - ay
      found.push({ enemy: en, t: dpx * dpx + dpy * dpy })
    }
    found.sort((p, q) => p.t - q.t)
    let dead = false
    const onHit = projOnHit[eid]
    for (const f of found) {
      if (Hp.v[f.enemy] === undefined) continue
      hit.add(f.enemy)
      const hx = Transform.x[f.enemy]!
      const hy = Transform.y[f.enemy]!
      applyDamage(sim, f.enemy, Proj.damage[eid]!, Proj.kb[eid]!, ax, ay)
      // 命中效果链(溅射/减速/毒/变羊…):复用 applyEffects,主目标排除出溅射圈
      if (onHit && onHit.length > 0 && sim.effectCtx) {
        const ref = enemyRef[f.enemy] as TargetInfo['ref'] | undefined
        applyEffects(sim.effectCtx, onHit, {
          center: { x: hx, y: hy },
          baseDamage: Proj.damage[eid]!,
          targets: ref ? [ref] : [],
          exclude: ref ? new Set([ref]) : undefined,
        })
      }
      if (Proj.pierce[eid]! <= 0) {
        dead = true
        break
      }
      Proj.pierce[eid] = Proj.pierce[eid]! - 1
    }
    if (dead) {
      cull(sim, eid)
      continue
    }
    // 出界回收(有界图:出地图 + slack)
    if (bx < -slack || bx > sim.mapW + slack || by < -slack || by > sim.mapH + slack) {
      cull(sim, eid)
      continue
    }
    if (Proj.dieAt[eid] !== 0 && sim.elapsedMs >= Proj.dieAt[eid]!) cull(sim, eid)
  }
}

function cull(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  removeEntity(sim.world, eid)
}
