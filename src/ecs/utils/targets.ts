import { FACTION, Radius, Transform, Uid, Zone } from '../components'
import { isSameEntity } from './identity'
import { tauntedBy } from './marks'
import { bandOf, canSee, eyeM } from './pass'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 帧首快照里的一个身体；uid 用来识别快照后已死亡或被复用的编号；bottom、top 是此刻占的那一段离地多高（米）；hidden 看不见，untargetable 碰不到，realm 是所在的界 */
export interface Target {
  readonly eid: number
  readonly uid: number
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly bottom: number
  readonly top: number
  readonly hidden: boolean
  readonly untargetable: boolean
  readonly realm: number
  /** 身在哪片迷雾里（场的编号与 Uid），不在是 -1 */
  readonly mist: number
  readonly mistUid: number
  readonly alive: boolean
}

type Visit = (eid: number, x: number, y: number, radius: number) => boolean | void

const FOES: readonly (readonly number[])[] = [[FACTION.enemy], [FACTION.team], [FACTION.team, FACTION.enemy]]

/** 来源能打的阵营：倒戈的打自己人 */
function foeFactions(src: Source): readonly number[] {
  return src.foes ?? FOES[src.faction]!
}

/** 迷雾里的身体只让同在这片迷雾里出手的打到；迷雾散了就不算 */
function shrouded(sim: Sim, t: Target, from: Source['from']): boolean {
  if (t.mist < 0 || !from || !isSameEntity(sim.world, t.mist, t.mistUid)) return false
  const d = sim.hooks.worldDelta(sim, Transform.x[t.mist]!, Transform.y[t.mist]!, from.x, from.y)
  const r = Zone.radius[t.mist]!
  return d.x * d.x + d.y * d.y > r * r
}

/** 来源打在哪一段高度：不写的不论高低 */
function outOfBand(src: Source, t: Target): boolean {
  const b = src.band
  return b !== undefined && (t.top <= b[0] || t.bottom >= b[1])
}

function eachFoe(sim: Sim, src: Source, cx: number, cy: number, reach: number, seeing: boolean, visit: Visit): void {
  const sight = src.sight
  const realm = src.realm ?? 0
  for (const f of foeFactions(src)) {
    for (const t of sim.targets[f]!) {
      if (!t.alive || t.untargetable || t.realm !== realm || Uid.v[t.eid] !== t.uid || (seeing && t.hidden) || t.eid === src.body || outOfBand(src, t) || shrouded(sim, t, src.from)) continue
      const d = sim.hooks.worldDelta(sim, cx, cy, t.x, t.y)
      const rr = reach + t.radius
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const x = cx + d.x
      const y = cy + d.y
      if (seeing && sight && !canSee(sim, sight.x, sight.y, sight.eye, x, y, eyeM(sim.world, t.eid))) continue
      if (visit(t.eid, x, y, t.radius)) return
    }
  }
}

/** 看：来源能打的身体里瞄得到的。世界打所有人；倒戈的打自己人；被嘲讽的观察者只看得见嘲讽者；隐匿的谁也看不见；碰不到的、不在同一个界的、不在来源打的那一段高度里的、躲在迷雾里而出手者在雾外的不算；有视线要求时看不见的不算 */
export function eachTarget(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  const by = src.viewer === undefined ? -1 : tauntedBy(sim, src.viewer)
  if (by >= 0) {
    const band = src.band
    if (band) {
      const own = bandOf(sim, by)
      if (own[1] <= band[0] || own[0] >= band[1]) return
    }
    const d = sim.hooks.worldDelta(sim, cx, cy, Transform.x[by]!, Transform.y[by]!)
    const r = Radius.v[by]!
    const rr = reach + r
    if (d.x * d.x + d.y * d.y <= rr * rr) visit(by, cx + d.x, cy + d.y, r)
    return
  }
  eachFoe(sim, src, cx, cy, reach, true, visit)
}

/** 碰：来源能打的身体里被覆盖到的，隐匿、嘲讽与视线不算数，碰不到的、界外的与不在那一段高度里的仍不算；够不够得着由出手处另查（见 pass.covered） */
export function eachTargetBody(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  eachFoe(sim, src, cx, cy, reach, false, visit)
}

/** 身体的实体接触：不看隐匿、嘲讽与视线，倒地的、碰不到的、界外的与高度不重叠的不算 */
export function eachFoeBody(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  eachFoe(sim, src, cx, cy, reach, false, visit)
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
