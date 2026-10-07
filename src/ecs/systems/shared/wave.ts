import { hasComponent } from 'bitecs'
import { Alive, Hp, Res, Stats } from '../../components'
import { resDef } from '../../store'
import { ITEMS } from '../../../data/items'
import { gearWave } from './gear'
import { runDef } from '../../../run/state'
import { WAVE } from '../../../data/waves'
import type { RunState } from '../../../run/state'
import type { Sim } from '../../sim'

/** 一场结束：生命与资源带走，成长道具攒进度，收获与过关奖励进账；生命按场间规则带走，奖励回满血时全队满血，永久减员时还倒着的这一局都回不来 */
export function settleWave(sim: Sim): void {
  const run = sim.run
  run.combatMs += sim.elapsedMs
  const between = runDef(run).rules?.between ?? 'carry'
  const reward = sim.fight.def.reward
  run.memberHp = sim.characters.map((m) => carriedHp(m, between === 'full' || !!reward?.heal, between === 'rest'))
  if (between === 'permadeath') sim.characters.forEach((m, slot) => (run.fallen[slot] ||= !Alive.v[m]))
  run.memberRes = sim.characters.map((m) => (resDef[m]?.keep && hasComponent(sim.world, m, Res) ? Res.v[m]! : -1))
  run.roster.forEach((_, slot) => grow(run, slot))
  run.coins += Math.round(sim.characters.reduce((sum, m) => sum + Stats.harvest[m]!, 0)) + (reward?.coins ?? 0)
}

/** 带进下一场的生命：回满血是 Infinity；休整时每人回复一部分损失的生命，倒下的也起来；否则活着的带着残血，倒下的记 0 */
function carriedHp(m: number, full: boolean, rest: boolean): number {
  if (full) return Infinity
  const hp = Alive.v[m] ? Hp.v[m]! : 0
  if (rest) return Math.max(1, Math.round(hp + (Hp.max[m]! - hp) * WAVE.restRatio))
  return Alive.v[m] ? Math.max(1, Math.round(hp)) : 0
}

/** 新的一波开始：触发道具的开波规则 */
export function openWave(sim: Sim): void {
  for (const m of sim.characters) gearWave(sim, m)
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
