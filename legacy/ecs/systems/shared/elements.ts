import { hasComponent, query } from 'bitecs'
import { Alive, Faction, Lifetime, MARK, MARK_SLOTS, Mark, Radius, TAG, Transform, Uid, Zone } from '../../components'
import { BURN, CHILL, CONDUCT, EL, IGNITE, POISON, REACTIONS, reactionIndex, SHOCK, WET_MS } from '../../../data/elements'
import { TENACITY } from '../../../data/enemies'
import { addCc, addMark, clearMarks, hasMark, isSteadfast, markSlot, realmOf } from '../../utils/marks'
import { burnProof, coldProof, isBurning, isChilled, isFrozen, isWet, poisonProof, shockProof } from '../../utils/element'
import { eachAlly, targetsWithin } from '../../utils/targets'
import { HIT } from '../../utils/hitTags'
import { markSrcs, zoneSrc } from '../../store'
import { spawnFxCircle } from '../../entities/fx'
import { hit } from './damage'
import { interrupt } from './ability'
import { bumpTenacity } from './tenacity'
import type { ReactionId } from '../../../types/elements'
import type { Point } from '../../../util/vec'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

/** 元素反应：在发生处闪一圈、迸出这种反应的粒子、飘出它的名字 */
export function reacted(sim: Sim, at: Point, id: ReactionId): void {
  const i = reactionIndex(id)
  const r = REACTIONS[i]!
  spawnFxCircle(sim, at.x, at.y, 34, { fill: r.color, fillAlpha: 0.45, stroke: r.color, lineWidth: 5, lineAlpha: 0.95, fromScale: 0.4, toScale: 2.2, durationMs: 380, depth: 14 })
  sim.out.bursts.push({ x: at.x, y: at.y, count: 14, kind: r.burst })
  sim.out.events.push({ kind: 'react', x: at.x, y: at.y, reaction: i, fxAt: sim.fxMs })
}

function remember(t: number, s: number, src: Source): void {
  const list = (markSrcs[t] ??= [])
  list[s - t * MARK_SLOTS] = src
}

/** 点燃：已经在烧的跳伤取大的、时间只延长，节拍照旧 */
function setBurn(sim: Sim, src: Source, t: number, tick: number, until: number): void {
  const s = markSlot(sim, t, MARK.burn)
  if (s >= 0) {
    Mark.a[s] = Math.max(Mark.a[s]!, tick)
    Mark.until[s] = Math.max(Mark.until[s]!, until)
    remember(t, s, src)
    return
  }
  const now = sim.elapsedMs
  const added = addMark(t, MARK.burn, TAG.effect, until, tick, BURN.tickMs, now + BURN.tickMs)
  if (added >= 0) remember(t, added, src)
}

/** 烧着的跳一下就烧到贴着的同伴：没在烧、点得着、不湿、没冻住的才着，烧过去的只烧剩下的时间 */
export function spreadBurn(sim: Sim, eid: number, s: number): void {
  const src = markSrcs[eid]?.[s - eid * MARK_SLOTS]
  if (!src) return
  const tick = Mark.a[s]!
  const until = Mark.until[s]!
  eachAlly(sim, Faction.v[eid]!, Transform.x[eid]!, Transform.y[eid]!, Radius.v[eid]! + BURN.spread, false, (o) => {
    if (o === eid || !hasComponent(sim.world, o, Mark) || isBurning(sim, o) || burnProof(sim, o) || isWet(sim, o) || isFrozen(sim, o)) return
    setBurn(sim, src, o, tick, until)
  }, realmOf(sim, eid))
}

/** 中毒：没中毒的上一层；已经中毒的，叠层的加一层（叠满了就比平均一层强时顶掉平均的一层），不叠层的跳伤取大的；节拍照旧；本身是毒的不中毒 */
export function addPoison(sim: Sim, src: Source, t: number, tick: number, tickMs: number, durationMs: number, stack: boolean): void {
  if (poisonProof(sim, t)) return
  const now = sim.elapsedMs
  const until = now + durationMs
  const s = markSlot(sim, t, MARK.poison)
  if (s < 0) {
    const added = addMark(t, MARK.poison, TAG.effect, until, tick, tickMs, now + tickMs, stack ? 1 : 0)
    if (added >= 0) remember(t, added, src)
    return
  }
  if (!stack) Mark.a[s] = Math.max(Mark.a[s]!, tick)
  else if (Mark.ref[s]! < POISON.stacks) {
    Mark.a[s] = Mark.a[s]! + tick
    Mark.ref[s] = Mark.ref[s]! + 1
  } else if (tick > Mark.a[s]! / Mark.ref[s]!) Mark.a[s] = Mark.a[s]! - Mark.a[s]! / Mark.ref[s]! + tick
  Mark.until[s] = Math.max(Mark.until[s]!, until)
  remember(t, s, src)
}

/** 冻住：寒冷与湿都化进冰里；霸体的冻不住 */
function freeze(sim: Sim, t: number): void {
  clearMarks(t, [MARK.chill, MARK.wet])
  if (addCc(sim, t, MARK.frozen, sim.elapsedMs + CHILL.frozenMs)) interrupt(sim, t)
}

/** 冷一层：越来越慢，叠满就冻住 */
function chillOnce(sim: Sim, t: number): void {
  const now = sim.elapsedMs
  const s = markSlot(sim, t, MARK.chill)
  const n = (s >= 0 ? Mark.a[s]! : 0) + 1
  if (n >= CHILL.stacks) {
    freeze(sim, t)
    return
  }
  if (s >= 0) {
    Mark.a[s] = n
    Mark.until[s] = now + CHILL.ms
  } else addMark(t, MARK.chill, TAG.effect, now + CHILL.ms, n)
  addMark(t, MARK.slow, TAG.effect, now + CHILL.ms, CHILL.slow)
}

/** 带元素的一下落在身上（不是持续伤害的一跳）：按挨打的此刻的样子起反应，或者留下这种元素的状态；dealt 定燃烧与中毒每跳多少；返回起了的反应 */
export function elementLands(sim: Sim, src: Source, t: number, el: number, dealt: number): ReactionId | undefined {
  if (!hasComponent(sim.world, t, Mark)) return undefined
  const now = sim.elapsedMs
  switch (el) {
    case EL.fire:
      if (isFrozen(sim, t) || isChilled(sim, t)) {
        clearMarks(t, [MARK.frozen, MARK.chill])
        return 'thaw'
      }
      if (isWet(sim, t)) {
        // 本身是水、泡在水里的蒸不干，火照样点不着，只是不再起反应
        const dried = hasMark(sim, t, MARK.wet)
        clearMarks(t, [MARK.wet])
        return dried ? 'quench' : undefined
      }
      if (dealt > 0 && !burnProof(sim, t)) setBurn(sim, src, t, dealt * BURN.ratio, now + BURN.durationMs)
      return undefined
    case EL.ice:
      if (isBurning(sim, t)) {
        clearMarks(t, [MARK.burn])
        return 'quench'
      }
      if (coldProof(sim, t) || isFrozen(sim, t)) return undefined
      if (isWet(sim, t)) {
        freeze(sim, t)
        return 'flashFreeze'
      }
      chillOnce(sim, t)
      return undefined
    case EL.water: {
      const burning = isBurning(sim, t)
      if (burning) clearMarks(t, [MARK.burn])
      addMark(t, MARK.wet, TAG.effect, now + WET_MS)
      return burning ? 'quench' : undefined
    }
    case EL.poison:
      addPoison(sim, src, t, dealt * POISON.ratio, POISON.tickMs, POISON.durationMs, true)
      return undefined
    default:
      return undefined
  }
}

/** 物理打在冻住的身上：冰碎了 */
export function shatter(sim: Sim, t: number, at: Point): void {
  clearMarks(t, [MARK.frozen])
  reacted(sim, at, 'shatter')
}

/**
 * 电：打断挨打的出手（霸体不吃，记进韧性），电流再往下传——挨打的是湿的就传给周围湿的敌人，一个都没有才跳到最近的另一个；
 * 本身是雷的不受传导；传过去的一下不再往下传
 */
export function shock(sim: Sim, src: Source, target: number, uid: number, damage: number, at: Point, wet: boolean): void {
  if (Alive.v[target] && Uid.v[target] === uid && !isSteadfast(sim, target) && interrupt(sim, target)) bumpTenacity(sim.world, target, TENACITY.interruptMs)
  const others = (radius: number) => targetsWithin(sim, src, at.x, at.y, radius).filter((f) => f.eid !== target && !shockProof(sim, f.eid))
  const wetOnes = wet ? others(CONDUCT.radius).filter((f) => isWet(sim, f.eid)) : []
  if (wetOnes.length > 0) {
    reacted(sim, at, 'conduct')
    for (const f of wetOnes) hit(sim, src, f.eid, damage * CONDUCT.ratio, { relay: true, tags: HIT.area, cue: { trace: at } })
    return
  }
  let best = -1
  let bestD = Infinity
  for (const f of others(SHOCK.radius)) {
    const d = (f.x - at.x) ** 2 + (f.y - at.y) ** 2
    if (d < bestD) {
      bestD = d
      best = f.eid
    }
  }
  if (best >= 0) hit(sim, src, best, damage * SHOCK.ratio, { relay: true, cue: { trace: at } })
}

/** 火打在毒云里：毒云炸开、就此散掉，云里出手一方的敌人各吃一下；炸开的这几下不再引爆别的毒云 */
export function igniteClouds(sim: Sim, src: Source, at: Point, damage: number): void {
  const now = sim.elapsedMs
  for (const z of [...query(sim.world, [Zone])]) {
    if (!Zone.on[z] || zoneSrc[z]?.element !== EL.poison) continue
    const until = Lifetime.until[z]!
    if (until > 0 && now >= until) continue
    const x = Transform.x[z]!
    const y = Transform.y[z]!
    const r = Zone.radius[z]!
    const d = sim.hooks.worldDelta(sim, x, y, at.x, at.y)
    if (d.x * d.x + d.y * d.y > r * r) continue
    Lifetime.until[z] = now
    const center = { x, y }
    reacted(sim, center, 'ignite')
    spawnFxCircle(sim, x, y, r, { fill: IGNITE.color, fillAlpha: 0.35, stroke: IGNITE.color, lineWidth: 5, lineAlpha: 0.95, fromScale: 0.4, toScale: 1.15, durationMs: 320, depth: 14 })
    for (const f of targetsWithin(sim, src, x, y, r)) hit(sim, src, f.eid, damage * IGNITE.ratio, { relay: true, tags: HIT.area, from: center, cue: 'shown' })
  }
}

/** 带元素的场每跳一次：场里的敌方按这一跳沾上元素；雷没有留在身上的状态，场里不起作用 */
export function zoneSoaks(sim: Sim, src: Source, t: number, damage: number): void {
  const el = src.element ?? 0
  if (el === 0 || el === EL.thunder) return
  const r = elementLands(sim, src, t, el, damage)
  if (r) reacted(sim, { x: Transform.x[t]!, y: Transform.y[t]! }, r)
}
