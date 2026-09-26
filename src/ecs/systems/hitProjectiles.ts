import { query } from 'bitecs'
import { FACTION, Faction, PrevPos, Proj, PROJ_SET, Transform, Uid } from '../components'
import { applyAbilityEffects } from './shared/effects'
import { boltSource, enemySource, WORLD_SOURCE } from '../utils/source'
import type { Source } from '../utils/source'
import { eachTarget } from '../utils/targets'
import { hit } from './shared/damage'
import { cullProjectile } from './shared/projectile'
import { projHitUids, projOnHit, projSrcEnemy } from '../store'
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

function projSource(eid: number): Source {
  if (Faction.v[eid] === FACTION.team) return boltSource(Proj.srcSlot[eid]!)
  const kind = projSrcEnemy[eid]
  return kind ? enemySource(kind, 1) : WORLD_SOURCE
}

/** 弹体这一帧扫过的线段碰到来源阵营的敌人即命中，沿线最先碰到的先算；每个身体只吃一次；敌我同一条 */
export function hitProjectiles(sim: Sim): void {
  if (sim.over) return
  for (const eid of [...query(sim.world, PROJ_SET)]) {
    const sx = PrevPos.x[eid]!
    const sy = PrevPos.y[eid]!
    const bx = Transform.x[eid]!
    const by = Transform.y[eid]!
    const struck = projHitUids[eid]!
    const pr = Proj.radius[eid]!
    const src = projSource(eid)
    const segX = bx - sx
    const segY = by - sy
    const segLen2 = segX * segX + segY * segY
    const found: { eid: number; t: number; x: number; y: number }[] = []
    eachTarget(sim, src, sx, sy, Math.sqrt(segLen2) + pr, (t, x, y, radius) => {
      if (struck.has(Uid.v[t]!)) return
      const rr = pr + radius
      if (segDistSq(x, y, sx, sy, bx, by) > rr * rr) return
      const along = segLen2 > 0 ? Math.max(0, Math.min(1, ((x - sx) * segX + (y - sy) * segY) / segLen2)) : 0
      found.push({ eid: t, t: along, x, y })
    })
    if (found.length === 0) continue
    found.sort((p, q) => p.t - q.t)
    const f = found[0]!
    struck.add(Uid.v[f.eid]!)
    const damage = Proj.damage[eid]!
    if (hit(sim, src, f.eid, damage, { knockback: Proj.kb[eid]!, from: { x: sx, y: sy } })) {
      const onHit = projOnHit[eid]
      if (onHit && onHit.length > 0) {
        applyAbilityEffects(sim, src, onHit, { x: f.x, y: f.y, baseDamage: damage, targets: [f.eid], exclude: new Set([f.eid]) })
      }
    }
    if (Proj.pierce[eid]! <= 0) cullProjectile(sim, eid)
    else Proj.pierce[eid] = Proj.pierce[eid]! - 1
  }
}
