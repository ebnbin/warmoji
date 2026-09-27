import { playSfx } from '../../../audio/sfx'
import { gainXp, waveBonusXp } from '../../../run/xp'
import { hasComponent } from 'bitecs'
import { Alive, Hp, Res, Stats } from '../../components'
import { resDef } from '../../store'
import { ITEMS } from '../../../data/items'
import { gearWave } from './gear'
import type { RunState } from '../../../run/state'
import type { Sim } from '../../sim'

/** 一波结束：经验、生命与资源带走，成长道具攒进度，收获进账 */
export function settleWave(sim: Sim): void {
  const run = sim.run
  const gained = gainXp(run.xp, Math.round(waveBonusXp(run.wave)))
  run.xp = gained.state
  if (gained.levelsGained > 0) {
    playSfx('levelup')
  }
  run.combatMs += sim.elapsedMs
  run.wave += 1
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(Hp.v[m]!)) : 0))
  run.memberRes = sim.characters.map((m) => (resDef[m]?.keep && hasComponent(sim.world, m, Res) ? Res.v[m]! : -1))
  if (!sim.sandbox) {
    run.roster.forEach((_, slot) => grow(run, slot))
    run.coins += Math.round(sim.characters.reduce((sum, m) => sum + Stats.harvest[m]!, 0))
  }
}

/** 新的一波开始：触发道具的开波规则 */
export function openWave(sim: Sim): void {
  if (!sim.sandbox) for (const m of sim.characters) gearWave(sim, m)
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
