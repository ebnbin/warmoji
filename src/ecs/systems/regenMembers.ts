import { Alive, MHp, MPerk } from '../components'
import type { Sim } from '../sim'

/** 再生戒指:持续回复(hp 允许小数,展示与快照处各自取整;时停期随世界冻结) */
export function regenMembers(sim: Sim): void {
  const wdelta = sim.wdtMs
  for (const m of sim.members) {
    if (!Alive.v[m] || MPerk.regenPerSec[m]! <= 0) continue
    if (MHp.hp[m]! >= MHp.max[m]!) continue
    MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + (MPerk.regenPerSec[m]! * wdelta) / 1000)
  }
}
