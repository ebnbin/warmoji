import { UNIT } from '../../util/units'
import { MEMBER } from '../../data/characters'
import { Alive, Breath, Pop, Sprite, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

export function animateCharacters(sim: Sim): void {
  const delta = sim.dtMs
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const charSize = MEMBER.size * UNIT
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    if (Pop.until[eid]! > sim.elapsedMs) {
      const t = 1 - (Pop.until[eid]! - sim.elapsedMs) / 200
      const pop = charSize * (0.3 + 0.7 * backEaseOut(t))
      Transform.w[eid] = pop
      Transform.h[eid] = pop
    } else {
      const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = charSize * (1 - s * 0.6)
      Transform.h[eid] = charSize * (1 + s)
    }
    if (Math.abs(sim.teamDir.x) > 0.2) Sprite.flipX[eid] = sim.teamDir.x > 0 ? 1 : 0
  }
}
