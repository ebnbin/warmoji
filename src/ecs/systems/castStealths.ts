import { playSfx } from '../../audio/sfx'
import { Stealth } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 半透明的视觉由 tickSkillStates 随状态开关 */
export function castStealths(sim: Sim, scan = castScan): void {
  scan(sim, Stealth, (e) => {
    sim.stealthUntil = sim.elapsedMs + Stealth.durationMs[e]!
    playSfx('whoosh')
  })
}
