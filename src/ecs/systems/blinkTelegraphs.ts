import { query } from 'bitecs'
import { SPAWN } from '../../data/enemies'
import { Telegraph, Tint } from '../components'
import type { Sim } from '../sim'

// 预告标记的脉冲。旧实现是一条 tween：alpha 0→1、duration = telegraphMs/(boss?4:6)、
// yoyo、repeat boss?3:2——即一条周期 = 2×duration 的三角波。这里照抄同一条波形，
// 只是时钟从 Phaser 墙钟换成 sim.elapsedMs：落地时刻本来就走世界钟，
// 时停期间旧实现会「标记照闪、敌人不来」。

/** 预告标记的 alpha 三角波（与落地时刻同一个时钟） */
export function blinkTelegraphs(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Telegraph, Tint])) {
    const period = (2 * SPAWN.telegraphMs) / (Telegraph.boss[eid] ? 4 : 6)
    const age = now - Telegraph.bornMs[eid]!
    const p = (age % period) / period
    Tint.alpha[eid] = p < 0.5 ? p * 2 : 2 - p * 2
  }
}
