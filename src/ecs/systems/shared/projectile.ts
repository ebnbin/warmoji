import { removeEntity } from 'bitecs'
import { Bolt, Faction, FACTION, Owner, Payload } from '../../components'
import { abilityOnHit, enemyDef, projHitUids, projOnHit, projSrcEnemy } from '../../store'
import { spawnBolt } from '../../entities/projectile'
import { attributionSlot } from '../../utils/amp'
import type { Sim } from '../../sim'

/** 能力朝某个方向射出自己的弹体 */
export function shoot(sim: Sim, e: number, x: number, y: number, angle: number, damage: number): void {
  const faction = Faction.v[e]!
  spawnBolt(sim, x, y, angle, {
    faction,
    frame: Bolt.frame[e]!,
    size: Bolt.size[e]!,
    radius: Bolt.radius[e]!,
    speed: Bolt.speed[e]!,
    rotOffsetDeg: Bolt.rotOffset[e]!,
    lifeMs: Bolt.lifeMs[e]!,
    pierce: Bolt.pierce[e]!,
    damage,
    knockback: Payload.knockback[e]!,
    srcSlot: attributionSlot(e),
    srcEnemy: faction === FACTION.enemy ? enemyDef[Owner.eid[e]!]?.kind : undefined,
    onHit: abilityOnHit[e],
  })
}

export function cullProjectile(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitUids[eid] = undefined
  projSrcEnemy[eid] = undefined
  removeEntity(sim.world, eid)
}
