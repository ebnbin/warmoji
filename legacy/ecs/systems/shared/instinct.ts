import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../../util/units'
import { CHARACTERS, INSTINCT } from '../../../data/characters'
import { toPx } from '../../../data/px'
import { Ability, Alive, Disc, DISC_AT, FACTION, Faction, Hp, LeapShape, Motion, MOTION, Owner, Radius, Sector, Segment, Slot, SprintShape, Transform, WindupState, Zone, ZONE_WHO } from '../../components'
import { zoneSrc } from '../../store'
import { test } from '../../utils/cond'
import { selfSource } from '../../utils/source'
import { nearestTarget, targetsNear } from '../../utils/targets'
import { leaderX, leaderY } from '../../utils/team'
import type { Found } from '../../utils/targets'
import type { Source } from '../../utils/source'
import type { InstinctDef, InstinctRule } from '../../../types/roles'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'

/** 一处要躲的地方：a 到 b 的线段往外 r 内，a 与 b 重合就是一个圆 */
export interface Danger {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly r: number
}

function circle(x: number, y: number, r: number): Danger {
  return { ax: x, ay: y, bx: x, by: y, r }
}

/** 敌人正在蓄的这一招打得到的地方：贴身的按招式的范围，跳砸按落点，冲撞按冲过去的那一条；远程的躲不开，不算 */
function windupDanger(sim: Sim, e: number, o: number): Danger | null {
  const x = Transform.x[o]!
  const y = Transform.y[o]!
  const cos = Math.cos(WindupState.angle[e]!)
  const sin = Math.sin(WindupState.angle[e]!)
  const has = (c: object): boolean => hasComponent(sim.world, e, c)
  if (has(Segment)) return { ax: x, ay: y, bx: x + cos * Segment.reach[e]!, by: y + sin * Segment.reach[e]!, r: Segment.radius[e]! }
  if (has(Sector)) return circle(x, y, Sector.radius[e]!)
  if (has(Disc) && Disc.at[e] === DISC_AT.self) return circle(x, y, Disc.radius[e]!)
  if (has(LeapShape)) return circle(x + cos * LeapShape.distance[e]!, y + sin * LeapShape.distance[e]!, LeapShape.radius[e]!)
  if (has(SprintShape)) return { ax: x, ay: y, bx: x + cos * SprintShape.distance[e]!, by: y + sin * SprintShape.distance[e]!, r: SprintShape.radius[e]! + Radius.v[o]! }
  return null
}

/** 这一刻队员要躲的地方：敌人跳过来的落点、敌人正在蓄力的招、敌方的场 */
export function dangers(sim: Sim): Danger[] {
  const out: Danger[] = []
  for (const m of query(sim.world, [Motion, Transform])) {
    const e = Motion.skill[m]!
    if (Faction.v[m] !== FACTION.enemy || Motion.kind[m] !== MOTION.arc || e === 0 || !hasComponent(sim.world, e, LeapShape)) continue
    out.push(circle(Motion.tx[m]!, Motion.ty[m]!, LeapShape.radius[e]!))
  }
  for (const e of query(sim.world, [Ability, WindupState, Owner])) {
    const o = Owner.eid[e]!
    if (WindupState.until[e]! <= sim.elapsedMs || Faction.v[o] !== FACTION.enemy || !Alive.v[o]) continue
    const d = windupDanger(sim, e, o)
    if (d) out.push(d)
  }
  for (const z of query(sim.world, [Zone, Transform])) {
    if (!Zone.on[z] || zoneSrc[z]?.faction !== FACTION.enemy || Zone.who[z] === ZONE_WHO.allies) continue
    out.push(circle(Transform.x[z]!, Transform.y[z]!, Zone.radius[z]!))
  }
  return out
}

/** (x, y) 离线段 a→b 多远 */
function segDist(sim: Sim, d: Danger, x: number, y: number): number {
  const ab = sim.hooks.worldDelta(sim, d.ax, d.ay, d.bx, d.by)
  const ap = sim.hooks.worldDelta(sim, d.ax, d.ay, x, y)
  const len2 = ab.x * ab.x + ab.y * ab.y
  const t = len2 > 0 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2)) : 0
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t)
}

/** 身体 eid 站在 (x, y) 会不会挨上这些危险之一；terrain 为真时连地图会伤人的地方也算 */
function unsafe(sim: Sim, eid: number, list: readonly Danger[], x: number, y: number, terrain: boolean): boolean {
  const pad = Radius.v[eid]! + INSTINCT.margin * UNIT
  if (list.some((d) => segDist(sim, d, x, y) < d.r + pad)) return true
  return terrain && sim.hooks.harms?.(sim, eid, x, y) === true
}

const SEARCH_STEP_U = 0.5
const SEARCH_RINGS = 8
const SEARCH_DIRS = 12

/** p 不安全就从 p 往外一圈圈找，找到的第一圈里挑离身体最近的安全处；找不到就还是 p */
function safeNear(sim: Sim, eid: number, list: readonly Danger[], p: Point, terrain: boolean): Point {
  if (!unsafe(sim, eid, list, p.x, p.y, terrain)) return p
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  for (let k = 1; k <= SEARCH_RINGS; k++) {
    let best: Point | null = null
    let bestD = Infinity
    for (let i = 0; i < SEARCH_DIRS; i++) {
      const a = (i / SEARCH_DIRS) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * k * SEARCH_STEP_U * UNIT, y: p.y + Math.sin(a) * k * SEARCH_STEP_U * UNIT }
      if (unsafe(sim, eid, list, q.x, q.y, terrain)) continue
      const d = sim.hooks.worldDelta(sim, x, y, q.x, q.y)
      const dd = d.x * d.x + d.y * d.y
      if (dd < bestD) {
        bestD = dd
        best = q
      }
    }
    if (best) return best
  }
  return p
}

/** 贴到 t 身边、朝着 f 的那一侧 */
function beside(sim: Sim, f: number, t: Found): Point {
  const d = sim.hooks.worldDelta(sim, t.x, t.y, Transform.x[f]!, Transform.y[f]!)
  const len = Math.hypot(d.x, d.y)
  const gap = t.radius + Radius.v[f]! + INSTINCT.margin * UNIT
  return len > 1e-6 ? { x: t.x + (d.x / len) * gap, y: t.y + (d.y / len) * gap } : { x: t.x + gap, y: t.y }
}

/** 收进离队长 leash 格以内 */
function leashed(sim: Sim, p: Point): Point {
  const cx = leaderX(sim)
  const cy = leaderY(sim)
  const d = sim.hooks.worldDelta(sim, cx, cy, p.x, p.y)
  const len = Math.hypot(d.x, d.y)
  const max = INSTINCT.leash * UNIT
  return len <= max ? p : { x: cx + (d.x / len) * max, y: cy + (d.y / len) * max }
}

function ratioOf(eid: number): number {
  return Hp.max[eid]! > 0 ? Hp.v[eid]! / Hp.max[eid]! : 1
}

/** 一种本能此刻想站的地方，挑不出就是 null；near 是离队员最近的敌人 */
function spotOf(sim: Sim, f: number, src: Source, seat: Point, near: Found | null, how: InstinctDef): Point | null {
  switch (how.kind) {
    case 'engage':
      return near ? beside(sim, f, near) : null
    case 'guard': {
      const cx = leaderX(sim)
      const cy = leaderY(sim)
      const t = nearestTarget(sim, src, cx, cy, Infinity)
      if (!t) return null
      const d = sim.hooks.worldDelta(sim, cx, cy, t.x, t.y)
      const len = Math.hypot(d.x, d.y)
      if (len < 1e-6) return beside(sim, f, t)
      const at = Math.min(how.reach, Math.max(Radius.v[sim.leader]! + Radius.v[f]!, len - t.radius - Radius.v[f]!))
      return { x: cx + (d.x / len) * at, y: cy + (d.y / len) * at }
    }
    case 'dive': {
      let best: Found | null = null
      let low = how.ratio
      for (const t of targetsNear(sim, src, Transform.x[f]!, Transform.y[f]!, how.radius)) {
        const r = ratioOf(t.eid)
        if (r < low) {
          low = r
          best = t
        }
      }
      return best ? beside(sim, f, best) : null
    }
    case 'kite': {
      const t = nearestTarget(sim, src, seat.x, seat.y, how.distance)
      if (!t) return seat
      const d = sim.hooks.worldDelta(sim, t.x, t.y, seat.x, seat.y)
      const len = Math.hypot(d.x, d.y)
      return len > 1e-6 ? { x: t.x + (d.x / len) * how.distance, y: t.y + (d.y / len) * how.distance } : seat
    }
    case 'tend': {
      let best = -1
      let low = how.ratio
      for (const m of sim.characters) {
        if (m === f || !Alive.v[m]) continue
        const r = ratioOf(m)
        if (r < low) {
          low = r
          best = m
        }
      }
      return best >= 0 ? beside(sim, f, { eid: best, x: Transform.x[best]!, y: Transform.y[best]!, radius: Radius.v[best]! }) : null
    }
  }
}

/** 队员的本能：角色写了的，否则定位的 */
function rulesOf(sim: Sim, f: number): readonly InstinctRule[] {
  return toPx(CHARACTERS[sim.run.roster[Slot.v[f]!]!]!.instincts)
}

/** 队员这一刻站哪：离队长超出 leash 的回坑位；否则第一条成立又挑得出地方的本能，都不成就坑位；最后躲开危险，自己正站在危险里就先走出来 */
export function followerGoal(sim: Sim, f: number, seat: Point, list: readonly Danger[]): { readonly at: Point; readonly how: InstinctDef | null } {
  const x = Transform.x[f]!
  const y = Transform.y[f]!
  if (unsafe(sim, f, list, x, y, false)) return { at: safeNear(sim, f, list, { x, y }, false), how: null }
  const off = sim.hooks.worldDelta(sim, leaderX(sim), leaderY(sim), x, y)
  if (Math.hypot(off.x, off.y) > INSTINCT.leash * UNIT) return { at: safeNear(sim, f, list, seat, true), how: null }
  const src = selfSource(sim, f)
  const near = nearestTarget(sim, src, x, y, Infinity)
  for (const rule of rulesOf(sim, f)) {
    if (rule.if && !test(sim, src, f, near ? near.eid : -1, rule.if)) continue
    const p = spotOf(sim, f, src, seat, near, rule.do)
    if (p) return { at: safeNear(sim, f, list, leashed(sim, p), true), how: rule.do }
  }
  return { at: safeNear(sim, f, list, seat, true), how: null }
}
