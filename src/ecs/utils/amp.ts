import { waveAt } from '../../data/waves'
import { sandboxFireRate } from '../sandbox/knobs'
import { Anchor, Slot, Transform, VisOff } from '../components'
import { Amp, FACTION, Faction, Owner } from '../components'
import { cdMul, dmgMul } from './marks'
import type { Sim } from '../sim'

/** 能力从宿主的画面位置出手：身体位置加视觉偏移 */
export function anchorX(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.x[a]! + VisOff.x[a]!
}

export function anchorY(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.y[a]! + VisOff.y[a]!
}

/** 伤害倍率 = 宿主身上伤害标记的乘积 × 能力自身倍率 × 战场增益 */
export function damageMul(sim: Sim, e: number): number {
  return dmgMul(sim, Owner.eid[e]!) * Amp.dmg[e]! * (Amp.battle[e] ? sim.battleFx.teamDamageMul : 1)
}

/** 冷却倍率 = 能力自身倍率 × 战场增益 × 宿主身上冷却标记的乘积 */
export function cooldownMul(sim: Sim, e: number): number {
  const sandboxMul = sim.sandbox && Amp.battle[e] ? 1 / sandboxFireRate() : 1
  return Amp.cd[e]! * (Amp.battle[e] ? sim.battleFx.teamCooldownMul : 1) * cdMul(sim, Owner.eid[e]!) * sandboxMul
}

export function waveScale(sim: Sim): number {
  if (sim.sandbox) return 1
  return waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
}

export function attributionSlot(e: number): number {
  return Faction.v[e] === FACTION.enemy ? -1 : Slot.v[Owner.eid[e]!]!
}
