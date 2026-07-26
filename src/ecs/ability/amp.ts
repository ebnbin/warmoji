import { CRIT_MUL } from '../../data/items'
import { waveAt } from '../../data/waves'
import { labFireRate } from '../../run/lab'
import { Alive, Anchor, DmgMul, Iframe, MAtkSlow, Slot, Transform } from '../components'
import { applyDamage, hurtMember } from '../combat'
import { Amp, FACTION, Faction, Owner } from '../components'
import type { Source } from './source'
import type { Sim } from '../sim'

// 出手乘区与施伤：所有能力的伤害/冷却/暴击/击退在此收口，各 kind 的施放系统只管
// 「打谁、打几下」，不各自重算一遍乘区。装备期定死的那部分在 Amp 上，随局面变的
// （战场限时层、技能增伤、黏滞攻速罚、精英体质）在此现算。

/** 施放锚点的当前位置：武器取持有者，自持能力的弩塔取它自己 */
export function ownerX(e: number): number {
  return Transform.x[Anchor.eid[e]!]!
}

export function ownerY(e: number): number {
  return Transform.y[Anchor.eid[e]!]!
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

/** 施伤的唯一入口：阵营决定落点——队伍侧打敌人（暴击掷点 + 击退倍率在此生效），
 * 敌方侧打队员（吃无敌帧节流；队员无击退机制，击退参数忽略） */
export function damageTarget(
  sim: Sim,
  src: Source,
  target: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
): void {
  if (src.faction === FACTION.enemy) {
    if (sim.over || !Alive.v[target]) return
    if (sim.elapsedMs - Iframe.last[target]! < Iframe.ms[target]!) return
    Iframe.last[target] = sim.elapsedMs
    hurtMember(sim, target, damage, src.name)
    return
  }
  const chance = Math.min(0.5, src.crit)
  const crit = chance > 0 && sim.rng.next() < chance
  const dmg = crit ? Math.round(damage * CRIT_MUL) : damage
  applyDamage(sim, target, dmg, knockback * src.kb, srcX, srcY, src.slot, crit)
}
