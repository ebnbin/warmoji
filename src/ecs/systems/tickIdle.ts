import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { Alive, Dormant, Idle, Phys, Transform } from '../components'
import { bodyRules } from '../store'
import { applyAbilityEffects } from './shared/effects'
import { selfSource } from '../utils/source'
import type { Sim } from '../sim'

const STILL = 0.3 * UNIT

/** 闲着的规则：ms 内没出手（要求静止的还得没动）就施于自身一次，出手或走动后重新计 */
export function tickIdle(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Idle])) {
    const rule = bodyRules[eid]?.onIdle
    if (!rule || !Alive.v[eid] || Dormant.v[eid]) continue
    if (rule.still && Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) > STILL) {
      Idle.since[eid] = now
      Idle.done[eid] = 0
    }
    if (Idle.done[eid] || now - Idle.since[eid]! < rule.ms) continue
    Idle.done[eid] = 1
    applyAbilityEffects(sim, selfSource(sim, eid), rule.effects, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
  }
}
