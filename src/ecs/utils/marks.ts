import { Alive, MARK, MARK_SLOTS, Mark, Motion, MOTION, TAG } from '../components'
import { STATUSES, STATUS_IDS } from '../../data/statuses'
import { isSameEntity } from './identity'
import type { StatusAction, StatusDef, StatusId, StatusMerge } from '../../types/statuses'
import type { Sim } from '../sim'

const DEFS: readonly (StatusDef | undefined)[] = [undefined, ...STATUS_IDS.map((id) => STATUSES[id])]

/** 这种标记的规则，空槽没有 */
export function statusDef(kind: number): StatusDef | undefined {
  return DEFS[kind]
}

const kindsWhere = (p: (d: StatusDef) => boolean): ReadonlySet<number> => new Set(STATUS_IDS.filter((id) => p(STATUSES[id])).map((id) => MARK[id]))

const KEYED = kindsWhere((d) => d.keyed === true)
const MERGE: readonly (StatusMerge | undefined)[] = DEFS.map((d) => d?.merge)
const PINNED = kindsWhere((d) => d.pinned === true)
const HIDDEN = kindsWhere((d) => d.hidden === true)
const REVEALS = kindsWhere((d) => d.reveals === true)
const UNTARGETABLE = kindsWhere((d) => d.untargetable === true)
const UNTOUCHABLE = kindsWhere((d) => d.untouchable === true)
const INVULNERABLE = kindsWhere((d) => d.invulnerable === true)
const STEADFAST = kindsWhere((d) => d.steadfast === true)
const TURNCOAT = kindsWhere((d) => d.turncoat === true)
const HALTS = kindsWhere((d) => d.halts === true)

/** 控制：霸体挡它们，施加霸体时解掉它们 */
export const CC_MARKS: readonly number[] = [...kindsWhere((d) => d.cc === true)]

/** 净化解掉的：控制与可净化的 */
export const CLEANSED: readonly number[] = [...kindsWhere((d) => d.cc === true || d.cleansable === true)]

/** 状态封住的动作，按位记 */
export const BLOCK: Readonly<Record<StatusAction, number>> = { move: 1, act: 2, cast: 4, dash: 8, touch: 16 }

const BLOCKS: readonly number[] = DEFS.map((d) => (d?.blocks ?? []).reduce((bits, a) => bits | BLOCK[a], 0))

/** 带强制行为的状态，按先后排好 */
export const FORCING: readonly { readonly kind: number; readonly force: NonNullable<StatusDef['forces']> }[] = STATUS_IDS.flatMap((id) => {
  const force = STATUSES[id].forces
  return force ? [{ kind: MARK[id], force }] : []
}).sort((a, b) => a.force.priority - b.force.priority)

/** 身上的底色，按轻重排 */
export const TINTED: readonly { readonly kind: number; readonly color: number }[] = STATUS_IDS.flatMap((id) => {
  const tint = STATUSES[id].tint
  return tint ? [{ kind: MARK[id], color: tint.color, rank: tint.rank }] : []
}).sort((a, b) => a.rank - b.rank)

/** 身上有没有一条还在生效、属于这几种的标记 */
function anyOf(sim: Sim, eid: number, kinds: ReadonlySet<number>): boolean {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (kinds.has(Mark.kind[s]!) && Mark.until[s]! > now) return true
  }
  return false
}

/** 身上生效的状态一共封住了哪些动作，按位 */
export function blockedBits(sim: Sim, eid: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  let bits = 0
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.until[s]! > now) bits |= BLOCKS[Mark.kind[s]!] ?? 0
  }
  return bits
}

/** 某个动作被身上的状态封住了没有 */
export function blocks(sim: Sim, eid: number, action: StatusAction): boolean {
  return (blockedBits(sim, eid) & BLOCK[action]) !== 0
}

/** 慢速乱逛的速度倍率，不乱逛是 0 */
export function wanderPace(sim: Sim, eid: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    const w = DEFS[Mark.kind[s]!]?.wander
    if (w !== undefined && Mark.until[s]! > now) return w
  }
  return 0
}

/** 按名字查身上有没有这种状态 */
export function hasStatus(sim: Sim, eid: number, id: StatusId): boolean {
  return hasMark(sim, eid, MARK[id])
}

/** 已有的这一格算不算同一条：按来源分开记的看 ref 与定义号 b，按施加者分格的看 ref，分强弱的看强度 */
function sameEntry(s: number, kind: number, a: number, b: number, ref: number): boolean {
  if (KEYED.has(kind)) return Mark.ref[s] === ref && Mark.b[s] === b
  switch (MERGE[kind]) {
    case 'bySource':
      return Mark.ref[s] === ref
    case 'high':
    case 'low':
      return Mark.a[s] === Math.fround(a)
    case 'rate':
      return Mark.a[s] === Math.fround(a) && Mark.b[s] === Math.fround(b)
    default:
      return true
  }
}

/** 按状态表的并法，s 这一条是不是比 t 那一条强；不分强弱的谁也不比谁强 */
function stronger(merge: StatusMerge | undefined, s: number, t: number): boolean {
  switch (merge) {
    case 'high':
      return Mark.a[s]! > Mark.a[t]!
    case 'low':
      return Mark.a[s]! < Mark.a[t]!
    case 'rate':
      return Mark.a[s]! / Mark.b[s]! > Mark.a[t]! / Mark.b[t]!
    default:
      return false
  }
}

/**
 * 加一条标记，返回槽位下标，加不上返回 -1：同一条已存在则刷新，时长只延长不缩短；分强弱的参数不动，其余参数取新值。
 * 同一条怎么算见 sameEntry 与状态表的并法；槽位满了顶掉最先到期的一条，变形的两条不顶（顶掉就没有到期反应）。
 * a/b/c 的含义：slow/speed/guard/dmg/cd/grow 是倍率；poison 是跳伤、节拍、下次跳的时刻；taunt/fear/charm 是施加者的 eid 与最后见到它的位置；
 * morph 是是否曾锚定；sleep 是醒来那一下的倍率；spellShield 是剩余次数；frontGuard 是朝向与半角；stack 是层数与定义号；fuse/deathMark/parry/empower 是定义号；
 * store 是已存的伤害与定义号；undead 是每秒流失；ref 是所引用身体的 Uid 或所在界的编号
 */
export function addMark(eid: number, kind: number, tag: number, until: number, a = 0, b = 0, c = 0, ref = 0): number {
  const base = eid * MARK_SLOTS
  const keyed = KEYED.has(kind)
  let free = -1
  let soonest = -1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    const k = Mark.kind[s]!
    if (k === MARK.none) {
      if (free < 0) free = i
      continue
    }
    if (k === kind && Mark.tag[s] === tag && sameEntry(s, kind, a, b, ref)) {
      Mark.until[s] = Math.max(Mark.until[s]!, until)
      if (!keyed && MERGE[kind] !== 'bySource' && MERGE[kind] !== undefined) return s
      Mark.a[s] = a
      Mark.b[s] = b
      Mark.c[s] = c
      Mark.ref[s] = ref
      return s
    }
    if (PINNED.has(k)) continue
    if (soonest < 0 || Mark.until[s]! < Mark.until[base + soonest]!) soonest = i
  }
  if (free < 0 && soonest < 0) return -1
  const s = base + (free >= 0 ? free : soonest)
  Mark.kind[s] = kind
  Mark.tag[s] = tag
  Mark.until[s] = until
  Mark.a[s] = a
  Mark.b[s] = b
  Mark.c[s] = c
  Mark.ref[s] = ref
  return s
}

/** 第一条还在生效的某种标记的槽位，没有则 -1；给了 ref 就只认这个来源的，给了 def 就只认这个定义号的 */
export function markSlot(sim: Sim, eid: number, kind: number, ref = 0, def = -1): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === kind && Mark.until[s]! > now && (ref === 0 || Mark.ref[s] === ref) && (def < 0 || Mark.b[s] === def)) return s
  }
  return -1
}

export function hasMark(sim: Sim, eid: number, kind: number): boolean {
  return markSlot(sim, eid, kind) >= 0
}

/** 身上这种状态生效的各条里最强的一条的槽位，没有则 -1；不分强弱的取第一条 */
export function strongestSlot(sim: Sim, eid: number, kind: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  const merge = MERGE[kind]
  let best = -1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] !== kind || Mark.until[s]! <= now) continue
    if (best < 0 || stronger(merge, s, best)) best = s
  }
  return best
}

/** 同种同类的另一条生效的更强，一样强时下标小的算数：属性只认最强的那一条 */
export function outranked(sim: Sim, eid: number, s: number): boolean {
  const kind = Mark.kind[s]!
  const merge = MERGE[kind]
  if (merge !== 'high' && merge !== 'low' && merge !== 'rate') return false
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const t = base + i
    if (t === s || Mark.kind[t] !== kind || Mark.tag[t] !== Mark.tag[s] || Mark.until[t]! <= now) continue
    if (stronger(merge, t, s) || (!stronger(merge, s, t) && t < s)) return true
  }
  return false
}

/** 加一条控制：霸体的身体不吃 */
export function addCc(sim: Sim, t: number, kind: number, until: number, a = 0, b = 0, c = 0, ref = 0): boolean {
  if (isSteadfast(sim, t)) return false
  return addMark(t, kind, TAG.effect, until, a, b, c, ref) >= 0
}

/** 清掉某几种标记，不触发到期反应 */
export function clearMarks(eid: number, kinds: readonly number[]): void {
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (kinds.includes(Mark.kind[s]!)) Mark.kind[s] = MARK.none
  }
}

/** 身上最强的一条减速，没被减速是 1 */
export function slowFactor(sim: Sim, eid: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  let mul = 1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === MARK.slow && Mark.until[s]! > now) mul = Math.min(mul, Mark.a[s]!)
  }
  return mul
}

/** 这一格的施加者（嘲讽者、恐惧与魅惑的施加者），已倒下或编号已被复用则 -1 */
function casterAt(sim: Sim, s: number): number {
  const by = Mark.a[s]!
  return isSameEntity(sim.world, by, Mark.ref[s]!) && Alive.v[by] ? by : -1
}

/** 牵着这个身体走的那一格（嘲讽、恐惧、魅惑按施加者分格）：施加者还在的里面最晚到期的，都不在了取最晚到期的；没有则 -1 */
export function leadSlot(sim: Sim, eid: number, kind: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  let best = -1
  let bestLive = false
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] !== kind || Mark.until[s]! <= now) continue
    const live = casterAt(sim, s) >= 0
    if (best < 0 || (live && !bestLive) || (live === bestLive && Mark.until[s]! > Mark.until[best]!)) {
      best = s
      bestLive = live
    }
  }
  return best
}

/** 牵着这个身体走的施加者，已倒下或编号已被复用则 -1 */
export function markedBy(sim: Sim, eid: number, kind: number): number {
  const s = leadSlot(sim, eid, kind)
  return s < 0 ? -1 : casterAt(sim, s)
}

/** 被谁嘲讽着，没有则 -1 */
export function tauntedBy(sim: Sim, eid: number): number {
  return markedBy(sim, eid, MARK.taunt)
}

/** 被别人抛到空中：被摆布的弧线位移中 */
export function isAirborne(eid: number): boolean {
  return Motion.kind[eid] === MOTION.arc && Motion.self[eid] === 0
}

/** 看不见：带着隐身的状态，且没被揭示 */
export function isHidden(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, HIDDEN) && !anyOf(sim, eid, REVEALS)
}

/** 穿行中：没有实体，谁也碰不到它，它也碰不到谁 */
export function inTransit(eid: number): boolean {
  return Motion.kind[eid] === MOTION.transit
}

/** 碰不到：带着选不中的状态，或穿行中 */
export function isUntargetable(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, UNTARGETABLE) || inTransit(eid)
}

/** 什么都落不到身上，持续伤害也不行 */
export function isUntouchable(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, UNTOUCHABLE)
}

/** 带伤害的一下落不到身上 */
export function isInvulnerable(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, INVULNERABLE)
}

/** 霸体：控制、被摆布、打断都不吃 */
export function isSteadfast(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, STEADFAST)
}

/** 倒戈：把自己人当敌人 */
export function isTurncoat(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, TURNCOAT)
}

/** 停摆：姿态与产出都停住 */
export function isHalted(sim: Sim, eid: number): boolean {
  return anyOf(sim, eid, HALTS)
}

/** 所在的界，0 是大家共处的世界 */
export function realmOf(sim: Sim, eid: number): number {
  const s = markSlot(sim, eid, MARK.realm)
  return s < 0 ? 0 : Mark.ref[s]!
}
