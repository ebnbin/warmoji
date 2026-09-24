import { playSfx } from '../../../audio/sfx'
import { gainXp, waveBonusXp } from '../../../run/xp'
import { isFinalWave } from '../../../data/waves'
import { Alive, CharHp } from '../../components'
import type { Sim } from '../../sim'

/** 调用它即宣告本局仿真到此为止：elapsedMs 已并进 run.combatMs，再跑一帧就是双计 */
export function settleWave(sim: Sim): boolean {
  const run = sim.run
  const finished = isFinalWave(run.wave)
  const gained = gainXp(run.xp, Math.round(waveBonusXp(run.wave) * sim.reward.captainXpMul))
  run.xp = gained.state
  if (gained.levelsGained > 0) {
    run.cardDraws += gained.levelsGained
    playSfx('levelup')
  }
  // 须在血量快照前
  if (sim.reward.waveHealRatio > 0) {
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      CharHp.hp[m] = Math.min(CharHp.max[m]!, CharHp.hp[m]! + CharHp.max[m]! * sim.reward.waveHealRatio)
    }
  }
  if (sim.reward.waveCoins > 0) run.coins += sim.reward.waveCoins
  run.combatMs += sim.elapsedMs
  run.wave += 1
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(CharHp.hp[m]!)) : 0))
  return finished
}
