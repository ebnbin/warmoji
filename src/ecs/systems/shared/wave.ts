import { hasComponent } from 'bitecs'
import { Alive, Hp, Res, Stats } from '../../components'
import { resDef } from '../../store'
import { ITEMS } from '../../../data/items'
import { gearWave } from './gear'
import { slotKept } from '../../../run/state'
import type { RunState } from '../../../run/state'
import type { Sim } from '../../sim'

/** 一场结束：生命与资源带走，成长道具攒进度，收获与过关奖励进账；场与场之间不休整，活着的带着残血，倒下的进下一场还倒着 */
export function settleWave(sim: Sim): void {
  const run = sim.run
  run.combatMs += sim.elapsedMs
  const reward = sim.fight.def.reward
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(Hp.v[m]!)) : 0))
  run.memberRes = sim.characters.map((m) => (resDef[m]?.keep && hasComponent(sim.world, m, Res) ? Res.v[m]! : -1))
  run.roster.forEach((_, slot) => grow(run, slot))
  run.coins += Math.round(sim.characters.reduce((sum, m) => sum + Stats.harvest[m]!, 0)) + (reward?.coins ?? 0)
}

/** 新的一波开始：触发道具的开波规则 */
export function openWave(sim: Sim): void {
  for (const m of sim.characters) gearWave(sim, m)
}

/** 成长道具攒进度：每波成长按件数加，击杀成长按件数乘这一波新添的击杀数加 */
function grow(run: RunState, slot: number): void {
  const k = slotKept(run, slot)
  const total = run.stats.kills[run.roster[slot]!] ?? 0
  const kills = total - k.growthKills
  k.growthKills = total
  const progress = k.growth
  for (const id of k.items) {
    const g = ITEMS[id].grow
    if (g) progress[id] = (progress[id] ?? 0) + (g.each === 'wave' ? 1 : kills)
  }
}
