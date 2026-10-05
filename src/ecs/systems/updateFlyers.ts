import { query } from 'bitecs'
import { catchFlyer } from '../entities/weapon'
import { DEG2RAD } from '../../util/units'
import { Flyer, FlyerShape, Frozen, Payload, Transform, Uid } from '../components'
import { abilityOnHit, flyerHits } from '../store'
import { anchorX, anchorY } from '../utils/ability'
import { hit } from './shared/damage'
import { applyOnHit, struckOf } from './shared/effects'
import { sourceOf, sweep } from '../utils/source'
import { targetsWithin } from '../utils/targets'
import { impactAt, reachBlock } from '../utils/pass'
import type { Sim } from '../sim'

/** 飞返体：去程沿直线缓动到射程尽头（撞上障碍就提早折回），回程沿最近的直路追着持有者；去程越过传送门的门线就从另一扇门那边接着飞，回程穿过去离持有者更近才穿；去程回程各打每个身体一次，只打得到占着持有者那几层的 */
export function updateFlyers(sim: Sim): void {
  const dt = sim.wdtMs
  for (const f of [...query(sim.world, [Flyer, Transform])]) {
    const e = Flyer.of[f]!
    if (Frozen.v[e]) {
      catchFlyer(sim, e, f)
      continue
    }
    Transform.rot[f] = Transform.rot[f]! + (FlyerShape.spinDegPerSec[e]! * DEG2RAD * dt) / 1000
    const src = sourceOf(sim, e)
    if (Flyer.phase[f] === 0) {
      Flyer.t[f] = Math.min(1, Flyer.t[f]! + dt / FlyerShape.outMs[e]!)
      const ease = Math.sin((Flyer.t[f]! * Math.PI) / 2)
      let x0 = Transform.x[f]!
      let y0 = Transform.y[f]!
      let x1 = Flyer.launchX[f]! + (Flyer.destX[f]! - Flyer.launchX[f]!) * ease
      let y1 = Flyer.launchY[f]! + (Flyer.destY[f]! - Flyer.launchY[f]!) * ease
      // 越过传送门的门线：整段去程平移到另一扇门那边，撞障碍从门那边算起
      const hop = sim.hooks.portal?.(sim, f, x0, y0, x1, y1)
      if (hop) {
        Flyer.launchX[f] = Flyer.launchX[f]! + hop.dx
        Flyer.launchY[f] = Flyer.launchY[f]! + hop.dy
        Flyer.destX[f] = Flyer.destX[f]! + hop.dx
        Flyer.destY[f] = Flyer.destY[f]! + hop.dy
        x0 += (x1 - x0) * hop.t + hop.dx
        y0 += (y1 - y0) * hop.t + hop.dy
        x1 += hop.dx
        y1 += hop.dy
      }
      Transform.x[f] = x1
      Transform.y[f] = y1
      // 去程撞上障碍就从那里往回飞
      const wall = src.blocked ? reachBlock(sim, x0, y0, Transform.x[f]!, Transform.y[f]!) : null
      if (wall) {
        Transform.x[f] = x0 + (wall.x - x0) * 0.9
        Transform.y[f] = y0 + (wall.y - y0) * 0.9
        impactAt(sim, wall)
      }
      if (wall || Flyer.t[f]! >= 1) {
        Flyer.phase[f] = 1
        flyerHits[f]!.clear()
      }
    } else {
      const x0 = Transform.x[f]!
      const y0 = Transform.y[f]!
      const ox = anchorX(e)
      const oy = anchorY(e)
      const near = sim.hooks.worldDelta(sim, x0, y0, ox, oy)
      const step = (FlyerShape.returnSpeed[e]! * dt) / 1000
      if (Math.hypot(near.x, near.y) <= Math.max(step, 20)) {
        catchFlyer(sim, e, f)
        continue
      }
      // 沿最近的直路飞回去，穿门近就穿门；只在穿过去离持有者更近时穿，不会在两扇门之间绕个没完
      const d = sim.hooks.towards?.(sim, x0, y0, ox, oy) ?? near
      const dist = Math.hypot(d.x, d.y)
      const p = sim.hooks.wrap(sim, x0 + (d.x / dist) * step, y0 + (d.y / dist) * step)
      let hop = sim.hooks.portal?.(sim, -1, x0, y0, p.x, p.y) ?? null
      if (hop && Math.hypot(ox - p.x - hop.dx, oy - p.y - hop.dy) >= Math.hypot(ox - p.x, oy - p.y)) hop = null
      if (hop) sim.hooks.portal!(sim, f, x0, y0, p.x, p.y)
      Transform.x[f] = p.x + (hop?.dx ?? 0)
      Transform.y[f] = p.y + (hop?.dy ?? 0)
    }
    const magnet = FlyerShape.coinMagnet[e]!
    if (magnet > 0) sim.frameAttractors.push({ x: Transform.x[f]!, y: Transform.y[f]!, r2: magnet * magnet })
    const struck = flyerHits[f]!
    const radius = FlyerShape.radius[e]!
    for (const t of targetsWithin(sim, sweep(sim, e, src), Transform.x[f]!, Transform.y[f]!, radius)) {
      if (struck.has(Uid.v[t.eid]!)) continue
      const dx = t.x - Transform.x[f]!
      const dy = t.y - Transform.y[f]!
      const rr = radius + t.radius
      if (dx * dx + dy * dy > rr * rr) continue
      struck.add(Uid.v[t.eid]!)
      const fx = Transform.x[f]!
      const fy = Transform.y[f]!
      const damage = Flyer.damage[f]!
      const s = struckOf(t.eid)
      if (hit(sim, src, t.eid, damage, { knockback: Payload.knockback[e]!, from: { x: fx, y: fy } })) applyOnHit(sim, src, abilityOnHit[e], fx, fy, damage, [s])
    }
  }
}
