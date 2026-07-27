import { addComponents, addEntity, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { Due, Telegraph } from '../components'
import { telegraphCarries, telegraphDef } from '../store'
import { attachDrawable } from './drawable'
import type { EnemyDef } from '../../types/enemies'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'

// 刷怪预告实体：落点上的 ⚠ 脉冲，Due 到点即在原地换成真敌人（落地在 spawnStep）。
//
// 从前它是 sim.pendingSpawns 里的一个对象，视觉是场景侧 Map<PendingSpawn, Image>
// 里的一个 Phaser Image——**用对象引用当身份，每帧建一个 Set 双向比对来同步生死**。
// 那正是 eid 的用途。做成实体之后场景侧一行都不剩：它就是一个可绘制实体，
// 跟装饰物、碎片走同一个批绘。
//
// 脉冲也随之从 tween 换成系统（blinkTelegraphs）：tween 走 Phaser 墙钟，而落地时刻
// 走世界钟，时停期间标记会照常闪而敌人迟迟不来。现在两者同一个时钟。

/** z=4：压在金币之上、敌人之下（与旧实现的 setDepth(4) 同层） */
const MARK_Z = 4

/** 排一个刷怪预告（telegraphMs 之后在 x,y 落地成 def 那只敌人） */
export function spawnTelegraph(
  sim: Sim,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  carries?: FieldPickupDef,
  /** 预告时长（Boss 更久，见 spawnBossEcs）；默认 SPAWN.telegraphMs */
  delayMs = SPAWN.telegraphMs,
): number {
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Telegraph, Due)
  Telegraph.hp[eid] = hp
  Telegraph.elite[eid] = elite ? 1 : 0
  Telegraph.boss[eid] = boss ? 1 : 0
  Telegraph.bornMs[eid] = sim.elapsedMs
  Due.at[eid] = sim.elapsedMs + delayMs
  telegraphDef[eid] = def
  telegraphCarries[eid] = carries
  attachDrawable(sim.world, eid, sim.frames, {
    id: SPAWN.markEmoji,
    outline: 'player',
    x,
    y,
    size: SPAWN.markSize * UNIT * (boss ? 2 : 1),
    alpha: 0, // 首帧就由 blinkTelegraphs 写实值
    z: MARK_Z,
  })
  return eid
}

/** 在途预告数（刷怪上限要把「已排队但没落地的」算进去，否则会超额排） */
export function telegraphCount(sim: Sim): number {
  return query(sim.world, [Telegraph]).length
}
