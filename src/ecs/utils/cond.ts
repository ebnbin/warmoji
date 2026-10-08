import { Boss, FACTION, Faction, Gear, Hp, MARK, Phys, Radius, Transform, Uid } from '../components'
import { isAirborne, markSlot, statusDef } from './marks'
import { UNIT } from '../../util/units'
import type { Cond } from '../../types/abilityDefs'
import type { Source } from './source'
import type { Sim } from '../sim'

/** 速度不超过它就算站着不动 */
export const STILL = 0.3 * UNIT

/** 身边 r 内活着的对面阵营的身体数，对方的体积也算 */
export function foesNear(sim: Sim, eid: number, r: number): number {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  let n = 0
  for (const t of sim.targets[Faction.v[eid] === FACTION.team ? FACTION.enemy : FACTION.team]!) {
    if (!t.alive || Uid.v[t.eid] !== t.uid) continue
    const d = sim.hooks.worldDelta(sim, x, y, t.x, t.y)
    const rr = r + t.radius
    if (d.x * d.x + d.y * d.y <= rr * rr) n++
  }
  return n
}

type Atom = Exclude<Cond, { readonly kind: 'all' | 'any' | 'not' }>

function atom(sim: Sim, src: Source, self: number, t: number, c: Atom): boolean {
  switch (c.kind) {
    case 'airborne':
      return isAirborne(t)
    case 'marked': {
      const kind = MARK[c.mark]
      return markSlot(sim, t, kind, statusDef(kind)?.keyed ? (src.bodyUid ?? 0) : 0) >= 0
    }
    case 'hpBelow':
      return Hp.max[t]! > 0 && Hp.v[t]! / Hp.max[t]! < c.ratio
    case 'boss':
      return Boss.v[t] === 1
    case 'still':
      return Math.hypot(Phys.vx[t]!, Phys.vy[t]!) <= STILL
    case 'leader':
      return t === sim.leader
    case 'follower':
      return t !== sim.leader
    case 'noFoesNear':
      return foesNear(sim, t, c.radius) === 0
    case 'foesNear':
      return foesNear(sim, t, c.radius) >= c.atLeast
    case 'within': {
      if (self < 0) return false
      const d = sim.hooks.worldDelta(sim, Transform.x[self]!, Transform.y[self]!, Transform.x[t]!, Transform.y[t]!)
      return Math.hypot(d.x, d.y) <= c.radius + Radius.v[t]!
    }
    case 'afterSkill':
      return sim.elapsedMs - Gear.skillAt[t]! < c.ms
  }
}

/** 条件：self 是带着这条规则的身体，target 是这一下作用到的身体，没有的记 -1，看的那个没有就不成立；按来源分开记的状态只认 src 施加的 */
export function test(sim: Sim, src: Source, self: number, target: number, c: Cond): boolean {
  switch (c.kind) {
    case 'all':
      return c.of.every((x) => test(sim, src, self, target, x))
    case 'any':
      return c.of.some((x) => test(sim, src, self, target, x))
    case 'not':
      return !test(sim, src, self, target, c.cond)
    default: {
      const t = c.who === 'self' ? self : target
      return t >= 0 && atom(sim, src, self, t, c)
    }
  }
}
