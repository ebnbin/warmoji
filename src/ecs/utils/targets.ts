import { FACTION, Radius, Transform, Uid } from '../components'
import { tauntedBy } from './marks'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 帧首快照里的一个身体；uid 用来识别快照后已死亡或被复用的编号；hidden 看不见，untargetable 碰不到，realm 是所在的界 */
export interface Target {
  readonly eid: number
  readonly uid: number
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly hidden: boolean
  readonly untargetable: boolean
  readonly realm: number
  readonly alive: boolean
}

type Visit = (eid: number, x: number, y: number, radius: number) => boolean | void

const FOES: readonly (readonly number[])[] = [[FACTION.enemy], [FACTION.team], [FACTION.team, FACTION.enemy]]

/** 来源能打的阵营：倒戈的打自己人 */
function foeFactions(src: Source): readonly number[] {
  return src.foes ?? FOES[src.faction]!
}

function eachFoe(sim: Sim, src: Source, cx: number, cy: number, reach: number, seeing: boolean, visit: Visit): void {
  const sight = src.sight
  const realm = src.realm ?? 0
  for (const f of foeFactions(src)) {
    for (const t of sim.targets[f]!) {
      if (!t.alive || t.untargetable || t.realm !== realm || Uid.v[t.eid] !== t.uid || (seeing && t.hidden) || t.eid === src.body) continue
      const d = sim.hooks.worldDelta(sim, cx, cy, t.x, t.y)
      const rr = reach + t.radius
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const x = cx + d.x
      const y = cy + d.y
      if (sight && sim.hooks.wallHit(sim, sight.x, sight.y, x, y) !== null) continue
      if (visit(t.eid, x, y, t.radius)) return
    }
  }
}

/** 看：来源能打的身体里瞄得到的。世界打所有人；倒戈的打自己人；被嘲讽的观察者只看得见嘲讽者；隐匿的谁也看不见；碰不到的、不在同一个界的不算；有视线要求时墙后不算 */
export function eachTarget(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  const by = src.viewer === undefined ? -1 : tauntedBy(sim, src.viewer)
  if (by >= 0) {
    const d = sim.hooks.worldDelta(sim, cx, cy, Transform.x[by]!, Transform.y[by]!)
    const r = Radius.v[by]!
    const rr = reach + r
    if (d.x * d.x + d.y * d.y <= rr * rr) visit(by, cx + d.x, cy + d.y, r)
    return
  }
  eachFoe(sim, src, cx, cy, reach, true, visit)
}

/** 碰：来源能打的身体里被覆盖到的，隐匿与嘲讽不算数，碰不到的与界外的仍不算，墙后仍不算 */
export function eachTargetBody(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  eachFoe(sim, src, cx, cy, reach, false, visit)
}

/** 身体的实体接触：不看隐匿、嘲讽与视线，倒地的、碰不到的、界外的不算 */
export function eachFoeBody(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  eachFoe(sim, { ...src, sight: undefined }, cx, cy, reach, false, visit)
}

/** 同阵营的身体，隐匿的也算，界外的不算；downed 为真时倒地的也算 */
export function eachAlly(sim: Sim, faction: number, cx: number, cy: number, reach: number, downed: boolean, visit: Visit, realm = 0): void {
  for (const t of sim.targets[faction]!) {
    if (Uid.v[t.eid] !== t.uid || (!t.alive && !downed) || t.realm !== realm) continue
    const d = sim.hooks.worldDelta(sim, cx, cy, t.x, t.y)
    const rr = reach + t.radius
    if (d.x * d.x + d.y * d.y > rr * rr) continue
    if (visit(t.eid, cx + d.x, cy + d.y, t.radius)) return
  }
}

export interface Found {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly radius: number
}

export function targetsNear(sim: Sim, src: Source, cx: number, cy: number, reach: number): Found[] {
  const out: Found[] = []
  eachTarget(sim, src, cx, cy, reach, (eid, x, y, radius) => {
    out.push({ eid, x, y, radius })
  })
  return out
}

export function targetsWithin(sim: Sim, src: Source, cx: number, cy: number, reach: number): Found[] {
  const out: Found[] = []
  eachTargetBody(sim, src, cx, cy, reach, (eid, x, y, radius) => {
    out.push({ eid, x, y, radius })
  })
  return out
}

export function nearestTarget(
  sim: Sim,
  src: Source,
  ox: number,
  oy: number,
  maxRange: number,
  exclude?: ReadonlySet<number>,
  accept?: (eid: number) => boolean,
): Found | null {
  let bestEid = -1
  let bestX = 0
  let bestY = 0
  let bestR = 0
  let bestD = maxRange * maxRange
  eachTarget(sim, src, ox, oy, maxRange, (eid, x, y, radius) => {
    if (exclude?.has(eid) || (accept && !accept(eid))) return
    const dx = x - ox
    const dy = y - oy
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      bestEid = eid
      bestX = x
      bestY = y
      bestR = radius
    }
  })
  return bestEid < 0 ? null : { eid: bestEid, x: bestX, y: bestY, radius: bestR }
}

export function nearestAngle(sim: Sim, src: Source, ox: number, oy: number, maxRange: number): number | null {
  const t = nearestTarget(sim, src, ox, oy, maxRange)
  return t ? Math.atan2(t.y - oy, t.x - ox) : null
}
