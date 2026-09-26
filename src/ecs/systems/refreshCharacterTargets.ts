import { Alive, Hidden, Radius, Transform } from '../components'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

export function refreshCharacterTargets(sim: Sim): void {
  const list: Target[] = []
  const now = sim.elapsedMs
  for (const m of sim.characters) {
    if (!Alive.v[m] || now < Hidden.until[m]!) continue
    const x = Transform.x[m]!
    const y = Transform.y[m]!
    const radius = Radius.v[m]!
    list.push({ eid: m, x, y, radius })
    for (const g of sim.hooks.ghosts(sim, x, y)) list.push({ eid: m, x: g.x, y: g.y, radius })
  }
  sim.characterTargets = list
}
