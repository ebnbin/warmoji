import { Bolt, FACTION, Faction, Owner, Shoot } from '../../components'
import { removeEntity } from 'bitecs'
import { projHitEids, projOnHit, projSrcName } from '../../store'
import { spawnEnemyProjectileEcs, spawnProjectileEcs } from '../../entities/projectile'
import { abilityFireSfx, enemyDef } from '../../store'
import { attributionSlot } from '../../utils/amp'
import type { Sim } from '../../sim'

/** 敌方能力弹药缺省寿命 */
const BULLET_LIFE_MS = 3000

/** 出手随机流：队伍侧走非确定性随机，敌方侧走 run 种子（镜像两侧 ctx 的 random） */
export function random(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.enemy ? sim.rng.next() : Math.random()
}

/** 发一枚：阵营决定进哪条弹道机器（队伍弹带 pierce/onHit，敌弹按寿命回收） */
export function shoot(sim: Sim, e: number, x: number, y: number, angle: number, damage: number): void {
  if (Faction.v[e] !== FACTION.enemy) {
    spawnProjectileEcs(sim, e, x, y, angle, damage, attributionSlot(e))
    return
  }
  const life = Shoot.lifeMs[e]!
  spawnEnemyProjectileEcs(sim, x, y, angle, {
    frame: Bolt.frame[e]!,
    size: Bolt.size[e]!,
    radius: Bolt.radius[e]!,
    speed: Bolt.speed[e]!,
    damage,
    lifeMs: life > 0 ? life : BULLET_LIFE_MS,
    srcName: enemyDef[Owner.eid[e]!]?.name,
  })
}

/** 这条能力出手时的音效（敌械弹幕用；队伍弹的 shoot 音效在发弹处） */
export function fireSfxOf(e: number): import('../../../types/sfx').SfxId | undefined {
  return abilityFireSfx[e]
}

/** 回收一枚抛射物：伴随存储先清（eid 会复用，残值会挂到下一位住户身上） */
export function cullProjectile(sim: Sim, eid: number): void {
  projOnHit[eid] = undefined
  projHitEids[eid] = undefined
  projSrcName[eid] = undefined
  removeEntity(sim.world, eid)
}
