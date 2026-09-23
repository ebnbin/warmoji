import { } from '../../data/items'
import { waveAt } from '../../data/waves'
import { sandboxFireRate } from '../../run/sandbox'
import { Anchor, DmgMul, CharAtkSlow, Slot, Transform } from '../components'
import { Amp, FACTION, Faction, Owner } from '../components'
import type { } from './source'
import type { Sim } from '../sim'
import { teamDamageMul } from './team'

// 乘区收口：装备期定死的在 Amp 上，随局面变的在此现算

export function ownerX(e: number): number {
  return Transform.x[Anchor.eid[e]!]!
}

export function ownerY(e: number): number {
  return Transform.y[Anchor.eid[e]!]!
}

export function damageMul(sim: Sim, e: number): number {
  if (Faction.v[e] === FACTION.enemy) return DmgMul.v[Owner.eid[e]!]!
  return Amp.dmg[e]! * (Amp.battle[e] ? sim.battleFx.teamDamageMul : 1) * teamDamageMul(sim)
}

/** 敌方无冷却加成 */
export function cooldownMul(sim: Sim, e: number): number {
  if (Faction.v[e] === FACTION.enemy) return 1
  const o = Owner.eid[e]!
  const atk = CharAtkSlow.until[o]! > sim.elapsedMs ? CharAtkSlow.mul[o]! : 1
  const lab = sim.sandbox && Amp.battle[e] ? 1 / sandboxFireRate() : 1
  return Amp.cd[e]! * sim.battleFx.teamCooldownMul * atk * lab
}

/** 试炼场恒 1 */
export function waveScale(sim: Sim): number {
  if (sim.sandbox) return 1
  return waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
}

/** 非队员来源为 -1 */
export function attributionSlot(e: number): number {
  return Faction.v[e] === FACTION.enemy ? -1 : Slot.v[Owner.eid[e]!]!
}

