import { query, removeEntity } from 'bitecs'
import { Bolt, Faction, Linger, Payload, Proj, Uid } from '../../components'
import { abilityDef, projHitUids, projOnHit, projSrc } from '../../store'
import { abilityPiercesWalls } from '../../../data/abilities'
import type { Effect } from '../../../types/abilityDefs'
import { spawnBolt } from '../../entities/projectile'
import { flying, sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

/** 能力朝某个方向射出自己的弹体：平射的在离地 z 米飞，抛射的从那里出手、抛到 reach 像素远（瞄准的目标那里） */
export function shoot(sim: Sim, e: number, x: number, y: number, angle: number, z: number, damage: number, onHit: readonly Effect[] | undefined, reach?: number): void {
  const def = abilityDef[e]
  spawnBolt(sim, x, y, angle, {
    faction: Faction.v[e]!,
    frame: Bolt.frame[e]!,
    size: Bolt.size[e]!,
    radius: Bolt.radius[e]!,
    speed: Bolt.speed[e]!,
    rotOffsetDeg: Bolt.rotOffset[e]!,
    lifeMs: Bolt.lifeMs[e]!,
    pierce: Bolt.pierce[e]!,
    damage,
    knockback: Payload.knockback[e]!,
    src: flying(sourceOf(sim, e)),
    onHit,
    homingDeg: Bolt.homingDeg[e]!,
    linger: Bolt.linger[e]!,
    z,
    arc: Bolt.arc[e]!,
    reach,
    breach: def?.breach,
    through: def !== undefined && abilityPiercesWalls(def),
  })
}

export function cullProjectile(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitUids[eid] = undefined
  projSrc[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 召回：主人落在地上的弹体全部飞回来，沿途重新能打，穿透不限 */
export function recallShots(sim: Sim, by: number, speed: number): void {
  for (const eid of query(sim.world, [Linger, Proj])) {
    if (projSrc[eid]?.body !== by || Linger.back[eid]) continue
    Linger.back[eid] = 1
    Linger.to[eid] = by
    Linger.toUid[eid] = Uid.v[by]!
    Linger.speed[eid] = speed
    Proj.pierce[eid] = 1 << 20
    Proj.dieAt[eid] = sim.elapsedMs + 4000
    projHitUids[eid] = new Set()
  }
}
