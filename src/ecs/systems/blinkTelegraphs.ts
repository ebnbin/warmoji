import { query } from 'bitecs'
import { SPAWN } from '../../data/enemies'
import { Telegraph, Tint } from '../components'
import type { Sim } from '../sim'

export function hideTelegraphs(sim: Sim): void {
  for (const eid of query(sim.world, [Telegraph, Tint])) Tint.alpha[eid] = 0
}

/** 预兆的警示标记一闪一闪；怪物自己聚出来的地图不打标记 */
export function blinkTelegraphs(sim: Sim): void {
  if (sim.hooks.forming) return hideTelegraphs(sim)
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Telegraph, Tint])) {
    const period = (2 * SPAWN.telegraphMs) / (Telegraph.boss[eid] ? 4 : 6)
    const age = now - Telegraph.bornMs[eid]!
    const p = (age % period) / period
    Tint.alpha[eid] = p < 0.5 ? p * 2 : 2 - p * 2
  }
}
