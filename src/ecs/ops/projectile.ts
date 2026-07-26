import { } from 'bitecs'
import type { ProjectileDef } from '../../types/abilityDefs'
import { Faction, FACTION, Owner } from '../components'
import { spawnEnemyProjectileEcs, spawnProjectileEcs } from '../entities/projectile'
import { enemyDef } from '../store'
import { attributionSlot } from '../utils/amp'
import type { Sim } from '../sim'

/** 敌方能力弹药缺省寿命 */
const BULLET_LIFE_MS = 3000

/** 出手随机流：队伍侧走非确定性随机，敌方侧走 run 种子（镜像两侧 ctx 的 random） */
export function random(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.enemy ? sim.rng.next() : Math.random()
}

/** 发一枚：阵营决定进哪条弹道机器（队伍弹带 pierce/onHit，敌弹按寿命回收） */
export function shoot(sim: Sim, e: number, def: ProjectileDef, x: number, y: number, angle: number, damage: number): void {
  if (Faction.v[e] !== FACTION.enemy) {
    spawnProjectileEcs(sim, sim.frames, x, y, angle, def, damage, attributionSlot(e))
    return
  }
  const p = def.projectile
  spawnEnemyProjectileEcs(sim, sim.frames, x, y, angle, {
    emoji: p.emoji,
    size: p.size,
    radius: p.radius,
    speed: p.speed,
    damage,
    lifeMs: def.lifeMs ?? BULLET_LIFE_MS,
    srcName: enemyDef[Owner.eid[e]!]?.name,
  })
}
