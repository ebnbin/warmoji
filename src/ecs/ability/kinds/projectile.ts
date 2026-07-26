import { hasComponent } from 'bitecs'
import type { ProjectileDef } from '../../../types/abilityDefs'
import { Aim, EnemyVel, Faction, FACTION, Held, Owner } from '../../components'
import { spawnEnemyProjectileEcs, spawnProjectileEcs } from '../../entities/projectile'
import { enemyDef } from '../../store'
import { attributionSlot, ownerX, ownerY } from '../amp'
import type { Sim } from '../../sim'

/** 敌方能力弹药缺省寿命 */
const BULLET_LIFE_MS = 3000

/** 持有者朝向（aim:'move' 用）：队伍取本帧移动方向，敌人取本帧移动速度方向 */
export function headingOf(sim: Sim, e: number): { x: number; y: number } {
  if (Faction.v[e] !== FACTION.enemy) return sim.teamDir
  const o = Owner.eid[e]!
  return { x: EnemyVel.x[o]!, y: EnemyVel.y[o]! }
}

/** 出手随机流：队伍侧走非确定性随机，敌方侧走 run 种子（镜像两侧 ctx 的 random） */
export function random(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.enemy ? sim.rng.next() : Math.random()
}

/** 枪口：无手持外形即施放锚点本身（徒手 / 弩塔）；有则沿瞄准方向前伸 restOffset，
 * 再按左右手横向偏 gap。**「有没有外形」看有没有 Held 组件**，不去翻 def */
export function muzzle(sim: Sim, e: number): { x: number; y: number } {
  if (!hasComponent(sim.world, e, Held)) return { x: ownerX(e), y: ownerY(e) }
  const aim = Aim.rad[e]!
  const off = Held.restOffset[e]!
  const lateral = Held.side[e]! * Held.gap[e]!
  return {
    x: ownerX(e) + Math.cos(aim) * off + Math.cos(aim + Math.PI / 2) * lateral,
    y: ownerY(e) + Math.sin(aim) * off + Math.sin(aim + Math.PI / 2) * lateral,
  }
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

