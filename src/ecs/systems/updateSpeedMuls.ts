import { hasComponent, query } from 'bitecs'
import { FACTION, Faction, Slot, SpeedMul, Stamina } from '../components'
import { speedMul } from '../utils/marks'
import { fatigue, squadStamina } from './shared/stamina'
import type { Sim } from '../sim'

/** 每个身体这一帧的速度倍率：身上速度标记的折叠 × 各自阵营的战场效果 × 体力（队伍整队按最累的人） */
export function updateSpeedMuls(sim: Sim): void {
  const squad = fatigue(squadStamina(sim))
  for (const eid of query(sim.world, [SpeedMul, Faction])) {
    const side = Faction.v[eid] === FACTION.enemy ? sim.battleFx.enemySlowMul : sim.battleFx.moveSpeedMul
    const tired = hasComponent(sim.world, eid, Slot) ? squad : hasComponent(sim.world, eid, Stamina) ? fatigue(Stamina.v[eid]!) : 1
    SpeedMul.v[eid] = speedMul(sim, eid) * side * tired
  }
}
