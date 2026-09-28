import { curveOf } from '../../data/runs'
import { waveAt } from '../../data/waves'
import { runDef } from '../../run/state'
import type { DifficultyCurve, WaveState } from '../../types/waves'
import type { Sim } from '../sim'

/** 难度时钟走到的秒数：这一场定了起点就从起点算，否则接着这一局累计打过的时长 */
export function clockSec(sim: Sim): number {
  return (sim.fight.def.clockSec ?? sim.run.combatMs / 1000) + sim.elapsedMs / 1000
}

/** 这一局的难度曲线 */
export function runCurve(sim: Sim): DifficultyCurve {
  return curveOf(runDef(sim.run))
}

/** 此刻难度时钟在这一局的曲线上：刷怪间隔与敌人血量倍率 */
export function clockWave(sim: Sim): WaveState {
  return waveAt(runCurve(sim), clockSec(sim))
}
