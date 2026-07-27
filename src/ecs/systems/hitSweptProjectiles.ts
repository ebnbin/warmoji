import { query } from 'bitecs'
import { PrevPos, Proj, Radius, SweptHit, Transform, ENEMY_SET } from '../components'
import { applyAbilityEffects } from './shared/effects'
import { boltSource } from '../utils/source'
import { damageTarget } from './shared/damage'
import { cullProjectile } from './shared/projectile'
import { enemyDef, projHitEids, projOnHit } from '../store'
import type { Sim } from '../sim'

// 线段扫掠命中（高速弹不穿模）：收集本帧线段扫到的目标，按段上距离排序，只结算首个；
// 贯穿弹靠下一帧继续推进。撞墙即销毁（残垣图，WallStop）。

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

/** 扫掠命中 + 撞墙销毁 */
export function hitSweptProjectiles(sim: Sim): void {
  const projs = query(sim.world, [SweptHit, Proj, PrevPos, Transform])
  if (projs.length === 0) return
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  for (const eid of [...projs]) {
    const sx = PrevPos.x[eid]!
    const sy = PrevPos.y[eid]!
    const bx = Transform.x[eid]!
    const by = Transform.y[eid]!
    const hit = projHitEids[eid]!
    const pr = Proj.radius[eid]!
    // t = 目标在线段上的投影参数(排序键);d2 = 到起点的中心距²(撞墙比较用)
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
        cullProjectile(sim, eid)
        continue
      }
    }
    // 每帧只结算首个命中(命中一个即收尾,贯穿弹靠下一帧继续推进)
    const f = found[0]
    if (f === undefined || enemyDef[f.enemy] === undefined) continue
    hit.add(f.enemy)
    const hx = Transform.x[f.enemy]!
    const hy = Transform.y[f.enemy]!
    // 归属随弹丸走——子弹常比发射者活得久,故来源是一份值而非能力实体
    const src = boltSource(Proj.srcSlot[eid]!)
    damageTarget(sim, src, f.enemy, Proj.damage[eid]!, Proj.kb[eid]!, sx, sy)
    // 命中效果链(溅射/减速/毒/变羊…):主目标排除出溅射圈
    const onHit = projOnHit[eid]
    if (onHit && onHit.length > 0) {
      applyAbilityEffects(sim, src, onHit, {
        x: hx,
        y: hy,
        baseDamage: Proj.damage[eid]!,
        targets: [f.enemy],
        exclude: new Set([f.enemy]),
      })
    }
    if (Proj.pierce[eid]! <= 0) cullProjectile(sim, eid)
    else Proj.pierce[eid] = Proj.pierce[eid]! - 1
  }
}
