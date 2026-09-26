import { query } from 'bitecs'
import { Dormant, PrevPos, Proj, Radius, SweptHit, Transform, Uid, ENEMY_SET } from '../components'
import { applyAbilityEffects } from './shared/effects'
import { boltSource } from '../utils/source'
import { hit } from './shared/damage'
import { cullProjectile } from './shared/projectile'
import { enemyDef, projHitUids, projOnHit } from '../store'
import type { Sim } from '../sim'

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

export function hitSweptProjectiles(sim: Sim): void {
  const projs = query(sim.world, [SweptHit, Proj, PrevPos, Transform])
  if (projs.length === 0) return
  const enemies = query(sim.world, ENEMY_SET)
  for (const eid of [...projs]) {
    const sx = PrevPos.x[eid]!
    const sy = PrevPos.y[eid]!
    const bx = Transform.x[eid]!
    const by = Transform.y[eid]!
    const struck = projHitUids[eid]!
    const pr = Proj.radius[eid]!
    const found: { enemy: number; t: number; d2: number }[] = []
    const segX = bx - sx
    const segY = by - sy
    const segLen2 = segX * segX + segY * segY
    for (const en of enemies) {
      if (enemyDef[en] === undefined || Dormant.v[en] || struck.has(Uid.v[en]!)) continue
      const rr = pr + Radius.v[en]!
      const w = sim.hooks.worldDelta(sim, sx, sy, Transform.x[en]!, Transform.y[en]!)
      const tx2 = sx + w.x
      const ty2 = sy + w.y
      if (segDistSq(tx2, ty2, sx, sy, bx, by) > rr * rr) continue
      const proj = segLen2 > 0 ? Math.max(0, Math.min(1, (w.x * segX + w.y * segY) / segLen2)) : 0
      found.push({ enemy: en, t: proj, d2: w.x * w.x + w.y * w.y })
    }
    found.sort((p, q) => p.t - q.t)
    const f = found[0]
    if (f === undefined) continue
    struck.add(Uid.v[f.enemy]!)
    const hx = Transform.x[f.enemy]!
    const hy = Transform.y[f.enemy]!
    const src = boltSource(Proj.srcSlot[eid]!)
    hit(sim, src, f.enemy, Proj.damage[eid]!, { knockback: Proj.kb[eid]!, from: { x: sx, y: sy } })
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
