import { query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { ENEMY_SET, Proj, PROJ_SET, Radius, Transform, Vel } from '../components'
import { applyAbilityEffects } from './shared/effects'
import { boltSource } from '../utils/source'
import { applyDamage } from './shared/combat'
import { enemyDef, projHitEids, projOnHit } from '../store'
import type { Sim } from '../sim'

// 我方弹体(P3):线段扫掠命中(高速弹不穿模)+ 贯穿去重 + 出视野/寿命回收。

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

function cull(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 逐帧推进抛射物 + 线段扫掠命中 + 出界回收 */
export function updateProjectiles(sim: Sim): void {
  const delta = sim.wdtMs
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
