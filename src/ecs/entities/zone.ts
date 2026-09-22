import { addComponent, addComponents, addEntity } from 'bitecs'
import { Lifetime, Owner, Ring, Tint, Transform, Zone, ZoneBurn, ZoneChill, ZoneFollow } from '../components'
import { zoneSrcName } from '../store'
import type { Sim } from '../sim'


export interface ZoneSpec {
  x: number
  y: number
  /** 作用半径(px) */
  radius: number
  /** 效果只落在对面阵营 */
  faction: number
  /** 存活时长(ms);0 = 不按时限退场(跟随型随武器走) */
  durationMs: number
  /** 入场缩放时长(ms);0 = 直接到位 */
  enterMs: number
  color: number
  fillAlpha: number
  lineAlpha: number
  lineWidth: number
  /** srcName 给敌方区 */
  burn?: { damage: number; tickMs: number; srcSlot: number; srcName: string }
  chill?: { factor: number }
  /** owner = 造它的武器，开关随它的出手闸门 */
  follow?: { of: number; owner: number }
}

export function spawnZone(sim: Sim, spec: ZoneSpec): number {
  const world = sim.world
  const eid = addEntity(world)
  addComponents(world, eid, Zone, Transform, Tint, Ring, Lifetime)
  Zone.radius[eid] = spec.radius
  Zone.faction[eid] = spec.faction
  Zone.enterMs[eid] = spec.enterMs
  Zone.on[eid] = 1
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
  Ring.z[eid] = 2 // 压在一切单位之下
  Ring.breathe[eid] = 0
  Lifetime.until[eid] = spec.durationMs > 0 ? sim.elapsedMs + spec.durationMs : 0
  if (spec.burn) {
    addComponent(world, eid, ZoneBurn)
    ZoneBurn.damage[eid] = spec.burn.damage
    ZoneBurn.tickMs[eid] = spec.burn.tickMs
    ZoneBurn.nextAt[eid] = sim.elapsedMs + spec.burn.tickMs
    ZoneBurn.srcSlot[eid] = spec.burn.srcSlot
    zoneSrcName[eid] = spec.burn.srcName
  }
  if (spec.chill) {
    addComponent(world, eid, ZoneChill)
    ZoneChill.factor[eid] = spec.chill.factor
  }
  if (spec.follow) {
    addComponents(world, eid, ZoneFollow, Owner)
    ZoneFollow.of[eid] = spec.follow.of
    Owner.eid[eid] = spec.follow.owner
  }
  return eid
}
