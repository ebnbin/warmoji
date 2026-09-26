import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Lifetime, Owner, Portal, Ring, Tint, Transform, Uid, Zone, ZONE_WHO, ZoneFollow } from '../components'
import { zoneDwellIn, zoneEffects, zoneRules, zoneSrc } from '../store'
import type { Effect } from '../../types/abilityDefs'
import type { ZoneRules } from '../../types/groundEffects'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

interface ZoneSpec {
  x: number
  y: number
  radius: number
  src: Source
  durationMs: number
  enterMs: number
  color: number
  fillAlpha: number
  lineAlpha: number
  lineWidth: number
  /** 每隔 tickMs 对场内敌方：先扣 damage，再施加 effects */
  tickMs?: number
  damage?: number
  effects?: readonly Effect[]
  /** 场内己方每秒回复 */
  mend?: number
  /** 每次 tick 闪一圈这个颜色 */
  pulse?: number
  follow?: { of: number; owner: number }
  rules?: ZoneRules
}

/** 场：一个有阵营的圆，按节拍对场内的身体施加载荷 */
export function spawnZone(sim: Sim, spec: ZoneSpec): number {
  const world = sim.world
  const eid = newEntity(world)
  addComponents(world, eid, Zone, Transform, Tint, Ring, Lifetime)
  Zone.radius[eid] = spec.radius
  Zone.enterMs[eid] = spec.enterMs
  Zone.on[eid] = 1
  Zone.tickMs[eid] = spec.tickMs ?? 0
  Zone.nextAt[eid] = sim.elapsedMs + (spec.tickMs ?? 0)
  Zone.damage[eid] = spec.damage ?? 0
  Zone.mend[eid] = spec.mend ?? 0
  Zone.pulse[eid] = spec.pulse ?? 0
  zoneSrc[eid] = { ...spec.src, crit: 0 }
  zoneEffects[eid] = spec.effects
  const rules = spec.rules
  zoneRules[eid] = rules
  Zone.who[eid] = ZONE_WHO[rules?.who ?? 'foes']
  Zone.pull[eid] = rules?.pull ?? 0
  Zone.traction[eid] = rules?.traction ?? 0
  Zone.mist[eid] = rules?.mist ? 1 : 0
  Zone.trap[eid] = rules?.trap ? 1 : 0
  if (rules?.dwell) zoneDwellIn[eid] = new Map()
  Transform.x[eid] = spec.x
  Transform.y[eid] = spec.y
  Transform.rot[eid] = 0
  Transform.w[eid] = 0
  Transform.h[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Ring.color[eid] = spec.color
  Ring.radius[eid] = spec.radius * (spec.enterMs > 0 ? 0.3 : 1)
  Ring.fillAlpha[eid] = spec.fillAlpha
  Ring.lineAlpha[eid] = spec.lineAlpha
  Ring.lineWidth[eid] = spec.lineWidth
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 2
  Ring.breathe[eid] = 0
  Lifetime.until[eid] = spec.durationMs > 0 ? sim.elapsedMs + spec.durationMs : 0
  if (spec.follow) {
    addComponents(world, eid, ZoneFollow, Owner)
    ZoneFollow.of[eid] = spec.follow.of
    Owner.eid[eid] = spec.follow.owner
  }
  return eid
}

/** 一对传送门：两个互相指着的场，谁踏进一个就从另一个出来 */
export function openPortals(sim: Sim, src: Source, a: { x: number; y: number }, b: { x: number; y: number }, radius: number, durationMs: number, cdMs: number, color: number): void {
  const look = { radius, src, durationMs, enterMs: 200, color, fillAlpha: 0.22, lineAlpha: 0.85, lineWidth: 3 }
  const p = spawnZone(sim, { ...look, x: a.x, y: a.y })
  const q = spawnZone(sim, { ...look, x: b.x, y: b.y })
  addComponents(sim.world, p, Portal)
  addComponents(sim.world, q, Portal)
  Portal.other[p] = q
  Portal.otherUid[p] = Uid.v[q]!
  Portal.other[q] = p
  Portal.otherUid[q] = Uid.v[p]!
  Portal.cdMs[p] = cdMs
  Portal.cdMs[q] = cdMs
}
