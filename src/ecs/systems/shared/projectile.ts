import { removeEntity } from 'bitecs'
import { Bolt, Faction, Payload } from '../../components'
import { projHitUids, projOnHit, projSrc } from '../../store'
import type { Effect } from '../../../types/abilityDefs'
import { spawnBolt } from '../../entities/projectile'
import { flying, sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

/** 能力朝某个方向射出自己的弹体 */
export function shoot(sim: Sim, e: number, x: number, y: number, angle: number, damage: number, onHit: readonly Effect[] | undefined): void {
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
  })
}

export function cullProjectile(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitUids[eid] = undefined
  projSrc[eid] = undefined
  removeEntity(sim.world, eid)
}
