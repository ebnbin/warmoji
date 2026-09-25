import { playSfx } from '../../../audio/sfx'
import { gainXp, waveBonusXp } from '../../../run/xp'
import { isFinalWave } from '../../../data/waves'
import { Alive, CharHp } from '../../components'
import type { Sim } from '../../sim'

export function settleWave(sim: Sim): boolean {
  const run = sim.run
  const finished = isFinalWave(run.wave)
  const gained = gainXp(run.xp, Math.round(waveBonusXp(run.wave) * sim.reward.captainXpMul))
  run.xp = gained.state
  if (gained.levelsGained > 0) {
    playSfx('levelup')
  }
  run.combatMs += sim.elapsedMs
  run.wave += 1
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(CharHp.hp[m]!)) : 0))
  return finished
}
