import { Alive, FACTION, Taunted, Transform, Uid } from '../components'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 帧首快照里的一个可被打的身体；uid 用来识别快照后已死亡或被复用的编号 */
export interface Target {
  readonly eid: number
  readonly uid: number
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly hidden: boolean
  readonly alive: boolean
}

type Visit = (eid: number, x: number, y: number, radius: number) => boolean | void

const FOES: readonly (readonly number[])[] = [[FACTION.enemy], [FACTION.team], [FACTION.team, FACTION.enemy]]

/** 来源阵营的敌人：世界打所有人；被嘲讽的观察者只看得见嘲讽者；隐匿的身体谁也看不见；有视线要求时墙后不算。visit 内不得施伤：击杀会原地改动正在遍历的快照 */
export function eachTarget(sim: Sim, src: Source, cx: number, cy: number, reach: number, visit: Visit): void {
  const now = sim.elapsedMs
  const v = src.viewer
  if (v !== undefined && now < Taunted.until[v]! && Alive.v[Taunted.by[v]!]) {
    const by = Taunted.by[v]!
    const d = sim.hooks.worldDelta(sim, cx, cy, Transform.x[by]!, Transform.y[by]!)
    visit(by, cx + d.x, cy + d.y, 0)
    return
  }
  const sight = src.sight
  for (const f of FOES[src.faction]!) {
    for (const t of sim.targets[f]!) {
      if (t.hidden || !t.alive || Uid.v[t.eid] !== t.uid) continue
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

/** 敌方身体的实体接触：不看隐匿、嘲讽与视线，倒地的不算 */
export function eachFoeBody(sim: Sim, faction: number, cx: number, cy: number, reach: number, visit: Visit): void {
  for (const f of FOES[faction]!) {
    for (const t of sim.targets[f]!) {
      if (!t.alive || Uid.v[t.eid] !== t.uid) continue
      const d = sim.hooks.worldDelta(sim, cx, cy, t.x, t.y)
      const rr = reach + t.radius
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      if (visit(t.eid, cx + d.x, cy + d.y, t.radius)) return
    }
  }
}

/** 同阵营的身体，隐匿的也算；downed 为真时倒地的也算 */
export function eachAlly(sim: Sim, faction: number, cx: number, cy: number, reach: number, downed: boolean, visit: Visit): void {
  for (const t of sim.targets[faction]!) {
    if (Uid.v[t.eid] !== t.uid || (!t.alive && !downed)) continue
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

export function nearestTarget(
  sim: Sim,
  src: Source,
  ox: number,
  oy: number,
  maxRange: number,
  exclude?: ReadonlySet<number>,
): Found | null {
  let bestEid = -1
  let bestX = 0
  let bestY = 0
  let bestR = 0
  let bestD = maxRange * maxRange
  eachTarget(sim, src, ox, oy, maxRange, (eid, x, y, radius) => {
    if (exclude?.has(eid)) return
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
