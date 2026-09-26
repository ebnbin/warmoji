import { waveAt } from '../../data/waves'
import { sandboxFireRate } from '../sandbox/knobs'
import { Anchor, AtkSlow, DmgBuff, DmgMul, Slot, Transform, VisOff } from '../components'
import { Amp, FACTION, Faction, Owner } from '../components'
import type { Sim } from '../sim'

/** 能力从宿主的画面位置出手：身体位置加视觉偏移 */
export function ownerX(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.x[a]! + VisOff.x[a]!
}

export function ownerY(e: number): number {
  const a = Anchor.eid[e]!
  return Transform.y[a]! + VisOff.y[a]!
}

/** 伤害倍率 = 宿主的常驻倍率 × 宿主的限时增益 × 能力自身倍率 × 战场增益 */
export function damageMul(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  const buff = sim.elapsedMs < DmgBuff.until[o]! ? DmgBuff.mul[o]! : 1
  return DmgMul.v[o]! * buff * Amp.dmg[e]! * (Amp.battle[e] ? sim.battleFx.teamDamageMul : 1)
}

export function cooldownMul(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  const atk = AtkSlow.until[o]! > sim.elapsedMs ? AtkSlow.mul[o]! : 1
  const sandboxMul = sim.sandbox && Amp.battle[e] ? 1 / sandboxFireRate() : 1
  return Amp.cd[e]! * (Amp.battle[e] ? sim.battleFx.teamCooldownMul : 1) * atk * sandboxMul
}

export function waveScale(sim: Sim): number {
  if (sim.sandbox) return 1
  return waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
}

export function attributionSlot(e: number): number {
  return Faction.v[e] === FACTION.enemy ? -1 : Slot.v[Owner.eid[e]!]!
}
