import { hasComponent } from 'bitecs'
import { Hp, Owner, Res, Spend, Transform } from '../../components'
import { abilityBoost, resDef } from '../../store'
import { applyAbilityEffects } from './effects'
import { selfSource } from '../../utils/source'
import type { Effect } from '../../../types/abilityDefs'
import type { Sim } from '../../sim'

/** 给身体加减资源：攒满时施加 full 的效果，锁住耗资源的能力并按需清零 */
export function gainRes(sim: Sim, eid: number, amount: number): void {
  const def = resDef[eid]
  if (!def || amount === 0 || !hasComponent(sim.world, eid, Res)) return
  const before = Res.v[eid]!
  Res.v[eid] = Math.max(0, Math.min(Res.max[eid]!, before + amount))
  if (amount > 0) Res.lastGain[eid] = sim.elapsedMs
  if (before >= Res.max[eid]! || Res.v[eid]! < Res.max[eid]!) return
  const full = def.full
  if (!full) return
  if (full.lockMs) Res.lock[eid] = sim.elapsedMs + full.lockMs
  if (full.reset) Res.v[eid] = 0
  if (full.effects) applyAbilityEffects(sim, selfSource(sim, eid), full.effects, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
}

/** 能力这一下付不付得起：资源够、没被锁（过热），以血施法时生命够 */
export function affordable(sim: Sim, e: number): boolean {
  const o = Owner.eid[e]!
  const cost = Spend.cost[e]!
  const uses = cost > 0 || Spend.gain[e]! > 0
  if (uses && hasComponent(sim.world, o, Res)) {
    if (sim.elapsedMs < Res.lock[o]!) return false
    if (Res.v[o]! < cost) return false
  }
  const hp = Spend.hp[e]!
  return hp <= 0 || Hp.v[o]! > hp + 1
}

/** 出手付账：扣资源、涨资源、扣生命 */
export function payRes(sim: Sim, e: number): void {
  const o = Owner.eid[e]!
  if (Spend.cost[e]! > 0) gainRes(sim, o, -Spend.cost[e]!)
  if (Spend.gain[e]! > 0) gainRes(sim, o, Spend.gain[e]!)
  if (Spend.hp[e]! > 0) Hp.v[o] = Math.max(1, Hp.v[o]! - Spend.hp[e]!)
}

/** 资源强化：够了就消耗并返回这一下的伤害倍率与附加效果 */
export function takeBoost(sim: Sim, e: number): { readonly damageMul: number; readonly onHit?: readonly Effect[] } | null {
  const boost = abilityBoost[e]
  const o = Owner.eid[e]!
  if (!boost || !hasComponent(sim.world, o, Res) || Res.v[o]! < boost.at) return null
  Res.v[o] = Res.v[o]! - boost.spend
  return { damageMul: boost.damageMul ?? 1, onHit: boost.onHit }
}
