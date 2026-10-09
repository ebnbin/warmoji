import { hasComponent } from 'bitecs'
import { ARMOR_HALF, LIFESTEAL_CAP_PER_SEC } from '../../../data/abilities'
import { norm } from '../../../util/vec'
import { Act, Alive, Boss, Elem, Elite, EnemyArm, FACTION, Faction, Hp, Leech, Lethal, MARK, MARK_SLOTS, Mark, Mount, Slot, Stats, Transform, Uid } from '../../components'
import { clearMarks, hasMark, inTransit, isInvulnerable, isUntargetable, isUntouchable, markSlot, strongestSlot } from '../../utils/marks'
import { facingAngle } from '../../utils/facing'
import { bodyRules, enemyDef, resDef } from '../../store'
import { nearestSummoned } from '../../entities/summon'
import { gainRes } from './resource'
import { attackOf, selfSource } from '../../utils/source'
import { HIT, hitTags } from '../../utils/hitTags'
import { isSameEntity } from '../../utils/identity'
import { mend } from './heal'
import { applyAbilityEffects, casterOf, PARRY_FX } from './effects'
import { displace, FORCED } from './displace'
import { die, grantIframe } from './combat'
import { feedGut } from './gut'
import { applyForm, bodyElement, npcAbilities, npcDrive, phaseStats, rearmNpcKeep } from '../../entities/form'
import { attachDrive, detachDrive } from '../../entities/enemy'
import { foldBody, setStatLayer } from '../../utils/stats'
import { gearDodged, gearHurt, gearLethal, gearLowHp, gearStruck } from './gear'
import { spawnFxCircle } from '../../entities/fx'
import { counterMul } from '../../../data/elements'
import { toPx } from '../../../data/px'
import { elementNow, touchElement } from '../../utils/element'
import type { ElementReaction } from '../../../types/elements'
import type { Point } from '../../../util/vec'
import type { Offense } from '../../utils/stats'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

interface HitOpts {
  readonly knockback?: number
  readonly from?: Point
  /** 持续伤害与场地危害：不看也不消耗无敌帧 */
  readonly tick?: boolean
  /** 出手处补上的伤害标签（见 hitTags）：范围，或替换来源的出手方式 */
  readonly tags?: number
  /** 近身打它的身体：反伤反给它，不写就是出手的身体 */
  readonly by?: number
}

function record(sim: Sim, src: Source, target: number, dmg: number): void {
  const st = sim.run.stats
  if (Faction.v[target] === FACTION.team) {
    const id = hasComponent(sim.world, target, Slot) ? sim.run.roster[Slot.v[target]!] : undefined
    if (id !== undefined) st.damageTaken[id] = (st.damageTaken[id] ?? 0) + dmg
    if (src.enemy) st.enemyDamage[src.enemy] = (st.enemyDamage[src.enemy] ?? 0) + dmg
    if (src.hazard) st.hazardDamage[src.hazard] = (st.hazardDamage[src.hazard] ?? 0) + dmg
    return
  }
  const by = src.slot >= 0 ? sim.run.roster[src.slot] : undefined
  if (by !== undefined) st.damage[by] = (st.damage[by] ?? 0) + Math.min(dmg, Math.max(0, Hp.v[target]!))
}

function blockFx(sim: Sim, target: number, color: number): void {
  spawnFxCircle(sim, Transform.x[target]!, Transform.y[target]!, 18, { fill: color, fillAlpha: 0.45, stroke: 0xffffff, lineWidth: 3, lineAlpha: 0.9, fromScale: 0.6, toScale: 1.6, durationMs: 220, depth: 14 })
}

/** 正在结算的招架反制：反制本身不会再被招架 */
let countering = false

/** 挡下这一下：法术护盾扣一次，招架反制出手的身体，正面格挡挡住从前方来的 */
function blocked(sim: Sim, src: Source, target: number, o: HitOpts): boolean {
  const shield = markSlot(sim, target, MARK.spellShield)
  if (shield >= 0) {
    Mark.a[shield] = Mark.a[shield]! - 1
    if (Mark.a[shield]! <= 0) Mark.kind[shield] = MARK.none
    blockFx(sim, target, 0xb388ff)
    return true
  }
  const parry = countering ? -1 : markSlot(sim, target, MARK.parry)
  if (parry >= 0) {
    const then = PARRY_FX.get(Mark.b[parry]!)
    const by = casterOf(sim, src)
    if (then && by >= 0) {
      countering = true
      applyAbilityEffects(sim, selfSource(sim, target), then, { x: Transform.x[by]!, y: Transform.y[by]!, baseDamage: 0, targets: [by] })
      countering = false
    }
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

const SHIELD_COLOR = 0x80cbc4

/** 护盾先挡：挡下的从护盾里扣，挡满就碎；返回剩下要扣血的 */
function soak(sim: Sim, target: number, dmg: number): number {
  const s = markSlot(sim, target, MARK.shield)
  if (s < 0) return dmg
  const left = Mark.a[s]! - dmg
  if (left > 0) {
    Mark.a[s] = left
    return 0
  }
  Mark.kind[s] = MARK.none
  return -left
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

/** 残血：本条命第一次生命低于每一条线时各施加一次，按位记哪几条已经施加过 */
function lowHp(sim: Sim, target: number): void {
  const rules = bodyRules[target]?.onLowHp
  if (!rules) return
  rules.forEach((rule, i) => {
    const bit = 1 << i
    if (Lethal.low[target]! & bit || Hp.v[target]! >= Hp.max[target]! * rule.ratio) return
    Lethal.low[target] = Lethal.low[target]! | bit
    applyAbilityEffects(sim, selfSource(sim, target), rule.effects, selfAt(target))
  })
}

/** 进入第 i 个头目阶段：属性换上这一段的，能力换了就重装（同一招保留冷却），走法跟上，再对自己施加进入效果 */
function enterPhase(sim: Sim, eid: number, i: number): void {
  const before = npcAbilities(sim, eid)
  Act.phase[eid] = i
  Elem.v[eid] = bodyElement(sim, eid)
  const stats = phaseStats(eid)
  setStatLayer(eid, 'phase', stats ? [stats] : undefined)
  foldBody(sim.world, sim, eid)
  if (EnemyArm.armed[eid] && npcAbilities(sim, eid) !== before) rearmNpcKeep(sim, eid)
  detachDrive(sim, eid)
  attachDrive(sim, eid, npcDrive(sim, eid))
  const fx = enemyDef[eid]!.phases![i]!.effects
  if (fx) applyAbilityEffects(sim, selfSource(sim, eid), fx, selfAt(eid))
}

/** 头目阶段：生命第一次低于下一段的线就进入，一下跨过几段就依次进入 */
function advancePhase(sim: Sim, target: number): void {
  const phases = enemyDef[target]?.phases
  if (!phases || !hasComponent(sim.world, target, Act)) return
  for (let next = Act.phase[target]! + 1; next < phases.length && Hp.v[target]! < Hp.max[target]! * phases[next]!.below; next++) enterPhase(sim, target, next)
}

/** 坐骑先扣：扣光就换成下马的形态，这一下不伤本体 */
function mounted(sim: Sim, target: number, dmg: number): boolean {
  if (Mount.hp[target]! <= 0) return false
  Mount.hp[target] = Math.max(0, Mount.hp[target]! - dmg)
  if (Mount.hp[target] === 0) applyForm(sim, target, Mount.form[target]!)
  return true
}

/** 依存无敌：自己召出的护卫还有活着的 */
function guarded(sim: Sim, target: number): boolean {
  const kind = enemyDef[target]?.guardedBy
  return kind !== undefined && nearestSummoned(sim, target, kind, Transform.x[target]!, Transform.y[target]!) >= 0
}

/** 这一下能不能落到目标身上：静止、穿行与碰不到、依存无敌、挡格；带伤害的还看无敌；持续伤害不看也不消耗无敌与挡格 */
function lands(sim: Sim, src: Source, target: number, o: HitOpts, harmful: boolean): boolean {
  if (sim.over || !hasComponent(sim.world, target, Hp) || Alive.v[target] === 0) return false
  if (isUntouchable(sim, target) || inTransit(target) || (!o.tick && isUntargetable(sim, target))) return false
  if (guarded(sim, target)) {
    if (!o.tick) blockFx(sim, target, 0x80d8ff)
    return false
  }
  return o.tick === true || !((harmful && isInvulnerable(sim, target)) || blocked(sim, src, target, o))
}

/** 不带伤害的一下：挡格与依存无敌照挡，无敌只挡伤害；返回是否碰到 */
export function touch(sim: Sim, src: Source, target: number, o: HitOpts = {}): boolean {
  return lands(sim, src, target, o, false)
}

/** 一下：带伤害的走 hit，不带的只碰 */
export function strike(sim: Sim, src: Source, target: number, damage: number, o: HitOpts = {}): boolean {
  return damage > 0 ? hit(sim, src, target, damage, o) : touch(sim, src, target, o)
}

/** 护甲的减伤：正护甲越叠越不划算，负护甲增伤 */
function armorTaken(armor: number): number {
  return armor >= 0 ? 1 / (1 + armor / ARMOR_HALF) : (ARMOR_HALF - 2 * armor) / (ARMOR_HALF - armor)
}

/** 出手方的伤害按这一下的标签逐项相乘 */
function tagMul(atk: Offense, tags: number): number {
  let m = atk.damage
  if (tags & HIT.melee) m *= atk.meleeDamage
  if (tags & HIT.ranged) m *= atk.rangedDamage
  if (tags & HIT.area) m *= atk.areaDamage
  if (tags & HIT.dot) m *= atk.dotDamage
  if (tags & HIT.summon) m *= atk.summonDamage
  return m
}

/** 闪避：范围与持续伤害躲不开 */
function dodged(sim: Sim, target: number, tags: number): boolean {
  const chance = Stats.dodge[target]!
  return chance > 0 && (tags & (HIT.area | HIT.dot)) === 0 && sim.rng.next() < chance
}

/** 吸血：出手的身体还在就按这一下的伤害回血，持续伤害不算，每秒回的有上限 */
function leech(sim: Sim, src: Source, atk: Offense, dmg: number, tags: number): void {
  const b = src.body
  if (atk.lifesteal <= 0 || tags & HIT.dot || b === undefined || !isSameEntity(sim.world, b, src.bodyUid ?? 0) || !hasComponent(sim.world, b, Leech)) return
  const now = sim.elapsedMs
  if (now - Leech.at[b]! >= 1000) {
    Leech.at[b] = now
    Leech.hp[b] = 0
  }
  const amount = Math.min(dmg * atk.lifesteal, Hp.max[b]! * LIFESTEAL_CAP_PER_SEC - Leech.hp[b]!)
  if (amount <= 0) return
  if (Alive.v[b]) mend(b, amount)
  Leech.hp[b] = Leech.hp[b]! + amount
}

/** 击退的冲量：出手处给的击退乘出手方的击退倍率，从出手处推向目标 */
function knockOf(sim: Sim, atk: Offense, target: number, o: HitOpts): Point {
  const kb = (o.knockback ?? 0) * atk.knockback
  if (kb <= 0 || !o.from) return { x: 0, y: 0 }
  const d = sim.hooks.worldDelta(sim, o.from.x, o.from.y, Transform.x[target]!, Transform.y[target]!)
  const dir = norm(d.x, d.y)
  return { x: dir.x * kb, y: dir.y * kb }
}

/** 这一场我方伤不了敌人：我方出手打在敌人身上 */
function harmless(sim: Sim, src: Source, target: number): boolean {
  return sim.fight.rules.harmless && src.faction === FACTION.team && Faction.v[target] === FACTION.enemy
}

/** 伤不了的一下：只闪一下、照样击退 */
function shove(sim: Sim, src: Source, target: number, o: HitOpts): void {
  sim.out.events.push({ kind: 'shrug', eid: target, uid: Uid.v[target]!, at: sim.elapsedMs })
  const j = knockOf(sim, attackOf(sim, src), target, o)
  if (j.x !== 0 || j.y !== 0) displace(sim, target, { kind: 'push', x: j.x, y: j.y }, FORCED)
}

/** 元素反应：在被打中处闪一圈，再由出手方施加反应的效果，效果不带元素；被打中的已经倒下就只施加不看目标的 */
function reacted(sim: Sim, src: Source, target: number, uid: number, r: ElementReaction, at: Point, dmg: number): void {
  spawnFxCircle(sim, at.x, at.y, 24, { fill: r.color, fillAlpha: 0.4, stroke: r.color, lineWidth: 4, lineAlpha: 0.9, fromScale: 0.5, toScale: 1.8, durationMs: 320, depth: 14 })
  const effects = toPx(r).effects
  if (!effects) return
  const alive = Alive.v[target] === 1 && Uid.v[target] === uid
  applyAbilityEffects(sim, { ...src, element: 0 }, effects, { x: at.x, y: at.y, baseDamage: dmg, targets: alive ? [target] : [] })
}

/** 反伤：带刺的身体被近战打中，反给近身打它的身体一下；持续伤害不算 */
function spikesOf(sim: Sim, src: Source, target: number, tags: number, o: HitOpts): (() => void) | null {
  if (o.tick || (tags & HIT.melee) === 0 || !hasComponent(sim.world, target, Stats)) return null
  const n = Stats.thorns[target]!
  const by = o.by ?? casterOf(sim, src)
  if (n <= 0 || by < 0 || by === target) return null
  const own = selfSource(sim, target)
  return () => void hit(sim, own, by, n)
}

/** 唯一的伤害入口，敌我同一条：damage 是能力给的伤害。先过 lands（我方伤不了敌人的一场到此只击退）与闪避，再乘出手方按标签的伤害与首领伤害、睡眠惊醒、承受方的护甲与受到伤害、元素克制与反应、暴击，只在最后取整，护盾先挡；然后吸血、存伤、吞噬者吐人、受击反应与无敌帧、扣血（坐骑先扣）、不死、致命与残血规则、死亡、受击反馈、击退冲量，最后是出手方道具的命中触发；持续伤害不暴击、不吃护甲；返回是否命中 */
export function hit(sim: Sim, src: Source, target: number, damage: number, o: HitOpts = {}): boolean {
  if (!lands(sim, src, target, o, true)) return false
  if (harmless(sim, src, target)) {
    shove(sim, src, target, o)
    return true
  }
  const tags = hitTags(src.tags ?? 0, o.tags ?? 0, o.tick === true)
  if (dodged(sim, target, tags)) {
    sim.out.events.push({ kind: 'dodge', x: Transform.x[target]!, y: Transform.y[target]!, fxAt: sim.fxMs })
    gearDodged(sim, src, target)
    return false
  }
  const now = sim.elapsedMs
  const spikes = spikesOf(sim, src, target, tags, o)
  const atk = attackOf(sim, src)
  let raw = damage * tagMul(atk, tags) * (Boss.v[target] || Elite.v[target] ? atk.bossDamage : 1)
  const sleep = strongestSlot(sim, target, MARK.sleep)
  if (sleep >= 0) {
    raw *= Mark.a[sleep]!
    clearMarks(target, [MARK.sleep])
  }
  if ((tags & HIT.dot) === 0) raw *= armorTaken(Stats.armor[target]!)
  raw *= Stats.taken[target]!
  const el = src.element ?? 0
  const react = el > 0 && !o.tick ? touchElement(sim, target, el) : undefined
  if (el > 0) raw *= counterMul(el, elementNow(sim, target)) * (react?.mul ?? 1)
  const crit = !o.tick && !src.noCrit && atk.crit > 0 && sim.rng.next() < atk.crit
  if (crit) raw *= atk.critDamage
  const dealt = Math.max(1, Math.round(raw))
  const dmg = soak(sim, target, dealt)
  if (dmg <= 0) {
    blockFx(sim, target, SHIELD_COLOR)
    if (react) reacted(sim, src, target, Uid.v[target]!, react, { x: Transform.x[target]!, y: Transform.y[target]! }, dealt)
    spikes?.()
    return true
  }
  const team = Faction.v[target] === FACTION.team
  sim.out.events.push({ kind: 'damage', x: Transform.x[target]!, y: Transform.y[target]!, amount: dmg, crit, team, fxAt: sim.fxMs })
  record(sim, src, target, dmg)
  leech(sim, src, atk, dmg, tags)
  store(target, dmg)
  feedGut(sim, target, dmg)
  // 被命中反应先于扣血：无敌帧从这一下起算
  if (!o.tick) {
    fuel(sim, src, target)
    const iframes = Stats.iframes[target]!
    if (iframes > 0) grantIframe(sim, target, iframes)
    const back = bodyRules[target]?.onHurt
    if (back) applyAbilityEffects(sim, selfSource(sim, target), back, { x: Transform.x[target]!, y: Transform.y[target]!, baseDamage: dmg, targets: [target] })
  }
  gearHurt(sim, src, target, dmg, o.tick === true)
  const { x: jx, y: jy } = knockOf(sim, atk, target, o)
  const at = { x: Transform.x[target]!, y: Transform.y[target]! }
  const uid = Uid.v[target]!
  let hp = mounted(sim, target, dmg) ? Hp.v[target]! : Hp.v[target]! - dmg
  if (hp <= 0 && hasMark(sim, target, MARK.undying)) hp = 1
  if (hp <= 0 && lethal(sim, target)) hp = Hp.v[target]!
  if (hp <= 0 && gearLethal(sim, target)) hp = Hp.v[target]!
  if (hp <= 0) {
    die(sim, target, src, jx, jy)
    gearStruck(sim, src, target, uid, at, damage, tags, crit)
    if (react) reacted(sim, src, target, uid, react, at, dmg)
    spikes?.()
    return true
  }
  Hp.v[target] = hp
  lowHp(sim, target)
  advancePhase(sim, target)
  gearLowHp(sim, target)
  sim.out.events.push({ kind: 'flinch', eid: target, uid: Uid.v[target]!, team, tint: src.tint, at: now, fxAt: sim.fxMs })
  if (jx !== 0 || jy !== 0) displace(sim, target, { kind: 'push', x: jx, y: jy }, FORCED)
  gearStruck(sim, src, target, uid, at, damage, tags, crit)
  if (react) reacted(sim, src, target, uid, react, at, dmg)
  spikes?.()
  return true
}
