import { Alive, MARK, MARK_SLOTS, Mark, Motion, MOTION, TAG } from '../components'
import { isSameEntity } from './identity'
import type { Sim } from '../sim'

/** 按来源分开记的标记：同一种、来源或定义不同的各占一格（叠层、引信、存伤、死亡印记） */
const KEYED: ReadonlySet<number> = new Set([MARK.stack, MARK.fuse, MARK.store, MARK.deathMark])

/** 控制：霸体挡它们，净化解它们 */
export const CC_MARKS: readonly number[] = [
  MARK.stun,
  MARK.root,
  MARK.silence,
  MARK.disarm,
  MARK.ground,
  MARK.sleep,
  MARK.fear,
  MARK.charm,
  MARK.berserk,
  MARK.taunt,
  MARK.morph,
]

/**
 * 加一条标记，返回槽位下标，加不上返回 -1：同种同源的已存在则刷新，时长只延长不缩短、参数取新值；按来源分开记的还要同一个 ref 与定义号 b；
 * 槽位满了顶掉最先到期的一条，变形的两条不顶（顶掉就没有到期反应）。
 * a/b/c 的含义：slow/speed/guard/dmg/cd 是倍率；poison 是跳伤、节拍、下次跳的时刻；regen 是每秒回复；taunt/fear/charm 是施加者的 eid 与最后见到它的位置；
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
    if (k === kind && Mark.tag[s] === tag && (!keyed || (Mark.ref[s] === ref && Mark.b[s] === b))) {
      Mark.until[s] = Math.max(Mark.until[s]!, until)
      Mark.a[s] = a
      Mark.b[s] = b
      Mark.c[s] = c
      Mark.ref[s] = ref
      return s
    }
    if (k === MARK.morph || k === MARK.morphImmune) continue
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

/** 加一条控制：霸体的身体不吃 */
export function addCc(sim: Sim, t: number, kind: number, until: number, a = 0, b = 0, c = 0, ref = 0): boolean {
  if (hasMark(sim, t, MARK.unstoppable)) return false
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

/** 清掉某种标记里带某个来源标签的，不触发到期反应 */
export function clearMarksTagged(eid: number, kind: number, tag: number): void {
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === kind && Mark.tag[s] === tag) Mark.kind[s] = MARK.none
  }
}

/** 某种倍率标记的乘积 */
function product(sim: Sim, eid: number, kind: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  let mul = 1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === kind && Mark.until[s]! > now) mul *= Mark.a[s]!
  }
  return mul
}

/** 减速取最强的一条 */
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

/** 速度的有效倍率 = 最强减速 × 固有倍率的乘积 */
export function speedMul(sim: Sim, eid: number): number {
  return slowFactor(sim, eid) * product(sim, eid, MARK.speed)
}

export function guardMul(sim: Sim, eid: number): number {
  return product(sim, eid, MARK.guard)
}

export function dmgMul(sim: Sim, eid: number): number {
  return product(sim, eid, MARK.dmg)
}

export function cdMul(sim: Sim, eid: number): number {
  return product(sim, eid, MARK.cd)
}

/** 标记指向的那个身体（嘲讽者、恐惧与魅惑的施加者），已倒下或编号已被复用则 -1 */
export function markedBy(sim: Sim, eid: number, kind: number): number {
  const s = markSlot(sim, eid, kind)
  if (s < 0) return -1
  const by = Mark.a[s]!
  return isSameEntity(sim.world, by, Mark.ref[s]!) && Alive.v[by] ? by : -1
}

/** 被谁嘲讽着，没有则 -1 */
export function tauntedBy(sim: Sim, eid: number): number {
  return markedBy(sim, eid, MARK.taunt)
}

/** 被别人抛到空中：被摆布的弧线位移中 */
export function isAirborne(eid: number): boolean {
  return Motion.kind[eid] === MOTION.arc && Motion.self[eid] === 0
}

/** 看不见：隐匿或潜行，且没被揭示 */
export function isHidden(sim: Sim, eid: number): boolean {
  return (hasMark(sim, eid, MARK.hide) || hasMark(sim, eid, MARK.stealth)) && !hasMark(sim, eid, MARK.reveal)
}

/** 碰不到：静止、不可选中、被吞进肚子 */
export function isUntargetable(sim: Sim, eid: number): boolean {
  return hasMark(sim, eid, MARK.stasis) || hasMark(sim, eid, MARK.untargetable) || hasMark(sim, eid, MARK.devoured)
}

/** 所在的界，0 是大家共处的世界 */
export function realmOf(sim: Sim, eid: number): number {
  const s = markSlot(sim, eid, MARK.realm)
  return s < 0 ? 0 : Mark.ref[s]!
}
