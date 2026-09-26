import { query } from 'bitecs'
import { FACTION, Faction, SpeedMul } from '../components'
import { speedMul } from '../utils/marks'
import type { Sim } from '../sim'

/** 每个身体这一帧的速度倍率：身上速度标记的折叠 × 各自阵营的战场效果 */
export function updateSpeedMuls(sim: Sim): void {
  for (const eid of query(sim.world, [SpeedMul, Faction])) {
    const side = Faction.v[eid] === FACTION.enemy ? sim.battleFx.enemySlowMul : sim.battleFx.moveSpeedMul
    SpeedMul.v[eid] = speedMul(sim, eid) * side
  }
}
