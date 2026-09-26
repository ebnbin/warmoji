import { query } from 'bitecs'
import { Ability, Casting, Disarmed, Frozen, LOCK_AT, Owner, Windup, WindupState } from '../components'
import { sourceOf } from '../utils/source'
import { aimAt, fireAbility } from './shared/fire'
import type { Shot } from './shared/fire'
import type { Sim } from '../sim'

/** 蓄力到点就出手：方向按 lockAt 沿用蓄力时的或重新瞄准；宿主倒下、被冻结或缴械则作废 */
export function tickWindups(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Ability, Windup, WindupState, Owner])]) {
    if (WindupState.until[e] === 0) continue
    const o = Owner.eid[e]!
    if (Frozen.v[e] || Disarmed.v[e]) {
      WindupState.until[e] = 0
      Casting.until[o] = 0
      continue
    }
    if (now < WindupState.until[e]!) continue
    WindupState.until[e] = 0
    Casting.until[o] = 0
    let shot: Shot = { angle: WindupState.angle[e]!, target: null }
    if (Windup.lockAt[e] === LOCK_AT.end) shot = aimAt(sim, e, sourceOf(sim, e)) ?? shot
    fireAbility(sim, e, shot)
  }
}
