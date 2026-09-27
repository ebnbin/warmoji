import { playSfx } from '../../../audio/sfx'
import { gainXp, waveBonusXp } from '../../../run/xp'
import { isFinalWave } from '../../../data/waves'
import { hasComponent } from 'bitecs'
import { Alive, Hp, Res } from '../../components'
import { resDef } from '../../store'
import { ITEMS } from '../../../data/items'
import type { RunState } from '../../../run/state'
import type { Sim } from '../../sim'

export function settleWave(sim: Sim): boolean {
  const run = sim.run
  const finished = isFinalWave(run.wave)
  const gained = gainXp(run.xp, Math.round(waveBonusXp(run.wave)))
  run.xp = gained.state
  if (gained.levelsGained > 0) {
    playSfx('levelup')
  }
  run.combatMs += sim.elapsedMs
  run.wave += 1
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(Hp.v[m]!)) : 0))
  run.memberRes = sim.characters.map((m) => (resDef[m]?.keep && hasComponent(sim.world, m, Res) ? Res.v[m]! : -1))
  if (!sim.sandbox) run.roster.forEach((_, slot) => grow(run, slot))
  return finished
}

/** 成长道具攒进度：每波成长按件数加，击杀成长按件数乘这一波新添的击杀数加 */
function grow(run: RunState, slot: number): void {
  const kills = (run.stats.kills[slot] ?? 0) - (run.growthKills[slot] ?? 0)
  run.growthKills[slot] = run.stats.kills[slot] ?? 0
  const progress = (run.memberGrowth[slot] ??= {})
  for (const id of run.memberItems[slot] ?? []) {
    const g = ITEMS[id].grow
    if (g) progress[id] = (progress[id] ?? 0) + (g.each === 'wave' ? 1 : kills)
  }
}
