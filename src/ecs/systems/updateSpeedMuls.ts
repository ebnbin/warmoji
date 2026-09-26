import { query } from 'bitecs'
import { FACTION, Faction, Slowed, SpMul } from '../components'
import { slowMul } from './shared/status'
import type { Sim } from '../sim'

/** 每个身体这一帧的速度倍率：减速状态 × 精英或暴走的固有倍率 × 各自阵营的战场效果 */
export function updateSpeedMuls(sim: Sim): void {
  for (const eid of query(sim.world, [Slowed, Faction])) {
    const side = Faction.v[eid] === FACTION.enemy ? SpMul.v[eid]! * sim.battleFx.enemySlowMul : sim.battleFx.moveSpeedMul
    Slowed.v[eid] = slowMul(sim, eid) * side
  }
}
