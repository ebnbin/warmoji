import { playSfx } from '../../audio/sfx'
import { Hidden, Stealth } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 隐匿给每个角色各写一份，半透明由 tickSkillStates 随状态开关 */
export function castStealths(sim: Sim, scan = castScan): void {
  scan(sim, Stealth, (e) => {
    const until = sim.elapsedMs + Stealth.durationMs[e]!
    for (const m of sim.characters) Hidden.until[m] = until
    playSfx('whoosh')
  })
}
