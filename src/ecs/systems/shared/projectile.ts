import { Bolt, FACTION, Faction, Owner, Shoot } from '../../components'
import { removeEntity } from 'bitecs'
import { projHitUids, projOnHit, projSrcName } from '../../store'
import { spawnEnemyProjectile, spawnProjectile } from '../../entities/projectile'
import { abilityFireSfx, enemyDef } from '../../store'
import { attributionSlot } from '../../utils/amp'
import type { Sim } from '../../sim'

/** 队伍侧非确定性随机，敌方侧走 run 种子 */
export function random(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.enemy ? sim.rng.next() : Math.random()
}

export function shoot(sim: Sim, e: number, x: number, y: number, angle: number, damage: number): void {
  if (Faction.v[e] !== FACTION.enemy) {
    spawnProjectile(sim, e, x, y, angle, damage, attributionSlot(e))
    return
  }
  spawnEnemyProjectile(sim, x, y, angle, {
    frame: Bolt.frame[e]!,
    size: Bolt.size[e]!,
    radius: Bolt.radius[e]!,
    speed: Bolt.speed[e]!,
    damage,
    lifeMs: Shoot.lifeMs[e]!,
    srcName: enemyDef[Owner.eid[e]!]?.name,
  })
}

export function fireSfxOf(e: number): import('../../../types/sfx').SfxId | undefined {
  return abilityFireSfx[e]
}

/** 伴随存储先清 */
export function cullProjectile(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitUids[eid] = undefined
  projSrcName[eid] = undefined
  removeEntity(sim.world, eid)
}
