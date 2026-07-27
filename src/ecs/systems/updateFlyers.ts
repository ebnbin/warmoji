import { hasComponent, query } from 'bitecs'
import { catchFlyer } from '../entities/weapon'
import { DEG2RAD } from '../../util/units'
import { Boomerang, CoinMagnet, Flyer, Frozen, Thrown, Transform } from '../components'
import { flyerHits } from '../store'
import { cooldownMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { sourceOf } from '../utils/source'
import { targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 推进：自旋 + 去程缓动 / 回程追人 + 途中判伤 + 磁力吸币 */
export function updateFlyers(sim: Sim): void {
  const dt = sim.wdtMs
  for (const f of [...query(sim.world, [Flyer, Transform])]) {
    const e = Flyer.of[f]!
    if (Frozen.v[e]) {
      // 持有者倒下：在途的镖一并作废，冷却按裸值重置
      catchFlyer(sim, e, f)
      Boomerang.cdLeft[e] = Boomerang.cdBase[e]!
      continue
    }
    Transform.rot[f] = Transform.rot[f]! + (Boomerang.spinDegPerSec[e]! * DEG2RAD * dt) / 1000
    if (Flyer.phase[f] === 0) {
      Flyer.t[f] = Math.min(1, Flyer.t[f]! + dt / Boomerang.outMs[e]!)
      const ease = Math.sin((Flyer.t[f]! * Math.PI) / 2)
      Transform.x[f] = Flyer.launchX[f]! + (Flyer.destX[f]! - Flyer.launchX[f]!) * ease
      Transform.y[f] = Flyer.launchY[f]! + (Flyer.destY[f]! - Flyer.launchY[f]!) * ease
      if (Flyer.t[f]! >= 1) {
        Flyer.phase[f] = 1
        flyerHits[f]!.clear()
      }
    } else {
      const dx = ownerX(e) - Transform.x[f]!
      const dy = ownerY(e) - Transform.y[f]!
      const dist = Math.hypot(dx, dy)
      const step = (Boomerang.returnSpeed[e]! * dt) / 1000
      if (dist <= Math.max(step, 20)) {
        catchFlyer(sim, e, f)
        if (Thrown.n[e] === 0) Boomerang.cdLeft[e] = Boomerang.cdBase[e]! * cooldownMul(sim, e)
        continue
      }
      Transform.x[f] = Transform.x[f]! + (dx / dist) * step
      Transform.y[f] = Transform.y[f]! + (dy / dist) * step
    }
    if (hasComponent(sim.world, e, CoinMagnet)) {
      const r = CoinMagnet.radius[e]!
      sim.frameAttractors.push({ x: Transform.x[f]!, y: Transform.y[f]!, r2: r * r })
    }
    const hits = flyerHits[f]!
    const src = sourceOf(sim, e)
    for (const t of targetsOf(sim, src)) {
      if (hits.has(t.eid)) continue
      const dx = t.x - Transform.x[f]!
      const dy = t.y - Transform.y[f]!
      const rr = Boomerang.hitRadius[e]! + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      hits.add(t.eid)
      damageTarget(sim, src, t.eid, Flyer.damage[f]!, Boomerang.knockback[e]!, Transform.x[f]!, Transform.y[f]!)
    }
  }
}
