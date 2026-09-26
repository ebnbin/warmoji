import { hasComponent } from 'bitecs'
import { CRIT_MUL } from '../../../data/items'
import { norm } from '../../../util/vec'
import { playSfx } from '../../../audio/sfx'
import { Alive, CharFlash, Dormant, FACTION, Faction, Flash, Hp, Lethal, MARK, MARK_SLOTS, Mark, Mount, Slot, Tint, Transform } from '../../components'
import { guardMul, hasMark, isUntargetable, markSlot } from '../../utils/marks'
import { facingAngle } from '../../utils/facing'
import { bodyRules, resDef } from '../../store'
import { gainRes } from './resource'
import { selfSource } from '../../utils/source'
import { applyAbilityEffects, casterOf, PARRY_FX } from './effects'
import { displace, FORCED } from './displace'
import { die } from './combat'
import { feedGut } from './gut'
import { applyForm } from '../../entities/form'
import { spawnDamageNumber, spawnFxCircle } from '../../entities/fx'
import type { Point } from '../../../util/vec'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

interface HitOpts {
  readonly knockback?: number
  readonly from?: Point
  /** 持续伤害与场地危害：不看也不消耗无敌帧 */
  readonly tick?: boolean
}

function record(sim: Sim, src: Source, target: number, dmg: number): void {
  const st = sim.run.stats
  if (Faction.v[target] === FACTION.team) {
    const slot = Slot.v[target]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + dmg
    if (src.enemy) st.enemyDamage[src.enemy] = (st.enemyDamage[src.enemy] ?? 0) + dmg
    if (src.hazard) st.hazardDamage[src.hazard] = (st.hazardDamage[src.hazard] ?? 0) + dmg
    return
  }
  if (src.slot >= 0 && src.slot < st.damage.length) {
    st.damage[src.slot] = (st.damage[src.slot] ?? 0) + Math.min(dmg, Math.max(0, Hp.v[target]!))
  }
}

function blockFx(sim: Sim, target: number, color: number): void {
  spawnFxCircle(sim, Transform.x[target]!, Transform.y[target]!, 18, { fill: color, fillAlpha: 0.45, stroke: 0xffffff, lineWidth: 3, lineAlpha: 0.9, fromScale: 0.6, toScale: 1.6, durationMs: 220, depth: 14 })
}

/** 挡下这一下：法术护盾扣一次，招架反制出手的身体，正面格挡挡住从前方来的 */
function blocked(sim: Sim, src: Source, target: number, o: HitOpts): boolean {
  const shield = markSlot(sim, target, MARK.spellShield)
  if (shield >= 0) {
    Mark.a[shield] = Mark.a[shield]! - 1
    if (Mark.a[shield]! <= 0) Mark.kind[shield] = MARK.none
    blockFx(sim, target, 0xb388ff)
    return true
  }
  const parry = markSlot(sim, target, MARK.parry)
  if (parry >= 0) {
    const then = PARRY_FX.get(Mark.b[parry]!)
    const by = casterOf(sim, src)
    if (then && by >= 0) applyAbilityEffects(sim, selfSource(sim, target), then, { x: Transform.x[by]!, y: Transform.y[by]!, baseDamage: 0, targets: [by] })
    blockFx(sim, target, 0xffffff)
    return true
  }
  const guard = markSlot(sim, target, MARK.frontGuard)
  if (guard >= 0 && o.from) {
    const d = sim.hooks.worldDelta(sim, Transform.x[target]!, Transform.y[target]!, o.from.x, o.from.y)
    const off = Math.atan2(d.y, d.x) - facingAngle(sim, target)
    if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= Mark.b[guard]!) {
      blockFx(sim, target, 0x90caf9)
      return true
    }
  }
  return false
}

/** 资源随命中涨：出手的涨 onHit，挨打的涨 onHurt */
function fuel(sim: Sim, src: Source, target: number): void {
  const by = casterOf(sim, src)
  const give = by >= 0 ? resDef[by]?.onHit : undefined
  if (give) gainRes(sim, by, give)
  const take = resDef[target]?.onHurt
  if (take) gainRes(sim, target, take)
}

/** 存伤的身体记下这一下 */
function store(target: number, dmg: number): void {
  const base = target * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) if (Mark.kind[base + i] === MARK.store) Mark.a[base + i] = Mark.a[base + i]! + dmg
}

function selfAt(target: number): { x: number; y: number; baseDamage: number; targets: number[] } {
  return { x: Transform.x[target]!, y: Transform.y[target]!, baseDamage: 0, targets: [target] }
}

/** 致命一击：本条命第一次生命归零时不死，改施加身体的致命规则 */
function lethal(sim: Sim, target: number): boolean {
  const fx = bodyRules[target]?.onLethal
  if (!fx || Lethal.used[target]) return false
  Lethal.used[target] = 1
  Hp.v[target] = 1
  applyAbilityEffects(sim, selfSource(sim, target), fx, selfAt(target))
  return true
}

/** 残血：本条命第一次生命低于比例时施加一次 */
function lowHp(sim: Sim, target: number): void {
  const rule = bodyRules[target]?.onLowHp
  if (!rule || Lethal.low[target] || Hp.v[target]! >= Hp.max[target]! * rule.ratio) return
  Lethal.low[target] = 1
  applyAbilityEffects(sim, selfSource(sim, target), rule.effects, selfAt(target))
}

/** 坐骑先扣：扣光就换成下马的形态，这一下不伤本体 */
function mounted(sim: Sim, target: number, dmg: number): boolean {
  if (Mount.hp[target]! <= 0) return false
  Mount.hp[target] = Math.max(0, Mount.hp[target]! - dmg)
  if (Mount.hp[target] === 0) applyForm(sim, target, Mount.form[target]!)
  return true
}

/** 唯一的伤害入口：静止与碰不到、无敌、挡格、睡眠惊醒、护盾倍率、暴击、存伤、吞噬者吐人、扣血（坐骑先扣）、不死、致命与残血规则、死亡、受击反馈、击退冲量，敌我同一条；持续伤害不暴击、不看也不消耗无敌与挡格；返回是否命中 */
export function hit(sim: Sim, src: Source, target: number, damage: number, o: HitOpts = {}): boolean {
  if (sim.over || !hasComponent(sim.world, target, Hp) || Dormant.v[target] || Alive.v[target] === 0) return false
  if (hasMark(sim, target, MARK.stasis) || (!o.tick && isUntargetable(sim, target))) return false
  const now = sim.elapsedMs
  if (!o.tick && (hasMark(sim, target, MARK.invuln) || blocked(sim, src, target, o))) return false
  let dmg = damage
  const sleep = markSlot(sim, target, MARK.sleep)
  if (sleep >= 0) {
    dmg = Math.round(dmg * Mark.a[sleep]!)
    Mark.kind[sleep] = MARK.none
  }
  const guard = guardMul(sim, target)
  if (guard !== 1) dmg = Math.max(1, Math.round(dmg * guard))
  const crit = !o.tick && src.crit > 0 && sim.rng.next() < Math.min(0.5, src.crit)
  if (crit) dmg = Math.round(dmg * CRIT_MUL)
  const team = Faction.v[target] === FACTION.team
  if (!team) spawnDamageNumber(sim, Transform.x[target]!, Transform.y[target]!, dmg, crit)
  record(sim, src, target, dmg)
  store(target, dmg)
  feedGut(sim, target, dmg)
  if (!o.tick) fuel(sim, src, target)
  // 被命中反应先于扣血：无敌帧从这一下起算
  const back = o.tick ? undefined : bodyRules[target]?.onHurt
  if (back) applyAbilityEffects(sim, selfSource(sim, target), back, { x: Transform.x[target]!, y: Transform.y[target]!, baseDamage: dmg, targets: [target] })
  if (team) sim.characterHitCount++
  let jx = 0
  let jy = 0
  const kb = (o.knockback ?? 0) * src.kb
  if (kb > 0 && o.from) {
    const d = sim.hooks.worldDelta(sim, o.from.x, o.from.y, Transform.x[target]!, Transform.y[target]!)
    const dir = norm(d.x, d.y)
    jx = dir.x * kb
    jy = dir.y * kb
  }
  let hp = mounted(sim, target, dmg) ? Hp.v[target]! : Hp.v[target]! - dmg
  if (hp <= 0 && hasMark(sim, target, MARK.undying)) hp = 1
  if (hp <= 0 && lethal(sim, target)) hp = Hp.v[target]!
  if (hp <= 0) {
    die(sim, target, src, jx, jy)
    return true
  }
  Hp.v[target] = hp
  lowHp(sim, target)
  if (team) {
    playSfx('hurt')
    CharFlash.until[target] = sim.fxMs + 120
    Tint.color[target] = src.tint ?? 0xff7777
    Tint.effect[target] = 0
  } else {
    playSfx('hit')
    Flash.until[target] = now + 70
    Tint.effect[target] = 1
    Tint.color[target] = 0xffffff
  }
  if (jx !== 0 || jy !== 0) displace(sim, target, { kind: 'push', x: jx, y: jy }, FORCED)
  return true
}
