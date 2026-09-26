import { Alive, MARK, MARK_SLOTS, Mark } from '../components'
import type { Sim } from '../sim'

/** 加一条标记：同种同源的已存在则刷新，时长只延长不缩短、参数取新值；槽位满了顶掉最先到期的一条。返回槽位下标 */
export function addMark(eid: number, kind: number, tag: number, until: number, a = 0, b = 0, c = 0): number {
  const base = eid * MARK_SLOTS
  let free = -1
  let soonest = -1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    const k = Mark.kind[s]!
    if (k === MARK.none) {
      if (free < 0) free = i
      continue
    }
    if (k === kind && Mark.tag[s] === tag) {
      Mark.until[s] = Math.max(Mark.until[s]!, until)
      Mark.a[s] = a
      Mark.b[s] = b
      Mark.c[s] = c
      return s
    }
    if (soonest < 0 || Mark.until[s]! < Mark.until[base + soonest]!) soonest = i
  }
  const s = base + (free >= 0 ? free : soonest)
  Mark.kind[s] = kind
  Mark.tag[s] = tag
  Mark.until[s] = until
  Mark.a[s] = a
  Mark.b[s] = b
  Mark.c[s] = c
  return s
}

/** 第一条还在生效的某种标记的槽位，没有则 -1 */
export function markSlot(sim: Sim, eid: number, kind: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === kind && Mark.until[s]! > now) return s
  }
  return -1
}

export function hasMark(sim: Sim, eid: number, kind: number): boolean {
  return markSlot(sim, eid, kind) >= 0
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

/** 被谁嘲讽着，嘲讽者已倒下则不算；没有则 -1 */
export function tauntedBy(sim: Sim, eid: number): number {
  const s = markSlot(sim, eid, MARK.taunt)
  if (s < 0) return -1
  const by = Mark.a[s]!
  return Alive.v[by] ? by : -1
}
