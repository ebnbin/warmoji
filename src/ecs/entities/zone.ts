import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Lifetime, Owner, Ring, Tint, Transform, Zone, ZoneFollow } from '../components'
import { zoneEffects, zoneSrc } from '../store'
import type { Effect } from '../../types/abilityDefs'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

export interface ZoneSpec {
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
}

/** 场：一个有阵营的圆，按节拍对场内的身体施加载荷 */
export function spawnZone(sim: Sim, spec: ZoneSpec): number {
  const world = sim.world
  const eid = newEntity(world)
  addComponents(world, eid, Zone, Transform, Tint, Ring, Lifetime)
  Zone.radius[eid] = spec.radius
  Zone.faction[eid] = spec.src.faction
  Zone.enterMs[eid] = spec.enterMs
  Zone.on[eid] = 1
  Zone.tickMs[eid] = spec.tickMs ?? 0
  Zone.nextAt[eid] = sim.elapsedMs + (spec.tickMs ?? 0)
  Zone.damage[eid] = spec.damage ?? 0
  Zone.mend[eid] = spec.mend ?? 0
  Zone.pulse[eid] = spec.pulse ?? 0
  zoneSrc[eid] = { ...spec.src, crit: 0 }
  zoneEffects[eid] = spec.effects
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
