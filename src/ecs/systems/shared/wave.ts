import { hasComponent } from 'bitecs'
import { Alive, Hp, Res, Stats } from '../../components'
import { resDef } from '../../store'
import { teamStats } from '../../../data/items'
import type { Sim } from '../../sim'

/** 一场结束：生命与资源带走，收获与过关奖励进账；收获是队员各自的加上队伍道具的一份；场与场之间不休整，活着的带着残血，倒下的进下一场还倒着 */
export function settleWave(sim: Sim): void {
  const run = sim.run
  run.combatMs += sim.elapsedMs
  const reward = sim.fight.def.reward
  run.memberHp = sim.characters.map((m) => (Alive.v[m] ? Math.max(1, Math.round(Hp.v[m]!)) : 0))
  run.memberRes = sim.characters.map((m) => (resDef[m]?.keep && hasComponent(sim.world, m, Res) ? Res.v[m]! : -1))
  const harvest = sim.characters.reduce((sum, m) => sum + Stats.harvest[m]!, 0) + teamStats(run.items).harvest
  run.coins += Math.round(harvest) + (reward?.coins ?? 0)
}
