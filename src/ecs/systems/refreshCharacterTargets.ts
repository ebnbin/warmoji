import { Alive, Hurt, Transform } from '../components'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

// 索敌快照（队伍侧）：须先于任何敌方出手。

/** 重建队员存活快照：须先于任何敌方出手 */
export function refreshCharacterTargets(sim: Sim): void {
  const list: Target[] = []
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const radius = Hurt.radius[m]!
    list.push({ eid: m, x, y, radius })
    for (const g of sim.hooks.ghosts(sim, x, y)) list.push({ eid: m, x: g.x, y: g.y, radius })
  }
  sim.characterTargets = list
}
