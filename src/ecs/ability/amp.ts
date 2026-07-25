import { CRIT_MUL } from '../../data/items'
import { waveAt } from '../../data/waves'
import { labFireRate } from '../../run/lab'
import { DmgMul, MAtkSlow, Slot, Transform } from '../components'
import { applyDamage } from '../combat'
import { Amp, FACTION, Faction, Owner } from './components'
import type { Sim } from '../sim'

// 出手乘区与施伤：所有能力的伤害/冷却/暴击/击退在此收口，各 kind 的施放系统只管
// 「打谁、打几下」，不各自重算一遍乘区。装备期定死的那部分在 Amp 上，随局面变的
// （战场限时层、技能增伤、黏滞攻速罚、精英体质）在此现算。

/** 持有者当前位置 */
export function ownerX(e: number): number {
  return Transform.x[Owner.eid[e]!]!
}

export function ownerY(e: number): number {
  return Transform.y[Owner.eid[e]!]!
}

/** 本次出手的伤害乘区 */
export function damageMul(sim: Sim, e: number): number {
  if (Faction.v[e] === FACTION.enemy) return DmgMul.v[Owner.eid[e]!]!
  return Amp.dmg[e]! * (Amp.battle[e] ? sim.battleFx.teamDamageMul : 1) * sim.skillDamageMul
}

/** 本次出手的冷却乘区（敌方无冷却加成；队伍侧叠战场层、黏滞攻速罚与试炼场攻速旋钮） */
export function cooldownMul(sim: Sim, e: number): number {
  if (Faction.v[e] === FACTION.enemy) return 1
  const o = Owner.eid[e]!
  const atk = MAtkSlow.until[o]! > sim.elapsedMs ? MAtkSlow.mul[o]! : 1
  const lab = sim.testMode && Amp.battle[e] ? 1 / labFireRate() : 1
  return Amp.cd[e]! * sim.battleFx.teamCooldownMul * atk * lab
}

/** 波次威胁倍率（随敌人成长缩放的效果用）。试炼场里常规出手不吃波次成长——
 * 那边的强度由场内旋钮定；队长技能载荷不受旋钮管辖，照常吃曲线 */
export function waveScale(sim: Sim, e: number): number {
  if (sim.testMode && Amp.battle[e]) return 1
  return waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
}

/** 伤害归属槽位（结算页按槽位分账）；非队员来源为 -1 */
export function attributionSlot(e: number): number {
  return Faction.v[e] === FACTION.enemy ? -1 : Slot.v[Owner.eid[e]!]!
}

/** 队伍侧能力对敌人施伤：暴击掷点与击退倍率在此统一生效 */
export function damageEnemy(
  sim: Sim,
  e: number,
  targetEid: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
): void {
  const chance = Math.min(0.5, Amp.crit[e]! + (Amp.battle[e] ? sim.battleFx.critAdd : 0))
  const crit = chance > 0 && sim.rng.next() < chance
  const dmg = crit ? Math.round(damage * CRIT_MUL) : damage
  applyDamage(sim, targetEid, dmg, knockback * Amp.kb[e]!, srcX, srcY, attributionSlot(e), crit)
}
