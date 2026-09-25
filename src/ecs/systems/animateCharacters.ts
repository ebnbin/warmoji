import { UNIT } from '../../util/units'
import { MEMBER } from '../../data/characters'
import { Alive, Breath, Pop, Sprite, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

function popping(sim: Sim, eid: number, charSize: number): boolean {
  const left = Pop.until[eid]! - sim.fxMs
  if (left <= 0) return false
  const pop = charSize * (0.3 + 0.7 * backEaseOut(1 - left / 200))
  Transform.w[eid] = pop
  Transform.h[eid] = pop
  return true
}

export function finishCharacterPops(sim: Sim): void {
  const charSize = MEMBER.size * UNIT
  for (const eid of sim.characters) {
    if (!Alive.v[eid] || Pop.until[eid] === 0 || popping(sim, eid, charSize)) continue
    Pop.until[eid] = 0
    Transform.w[eid] = charSize
    Transform.h[eid] = charSize
  }
}

export function animateCharacters(sim: Sim): void {
  const delta = sim.dtMs
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const charSize = MEMBER.size * UNIT
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    if (!popping(sim, eid, charSize)) {
      const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = charSize * (1 - s * 0.6)
      Transform.h[eid] = charSize * (1 + s)
    }
    if (Math.abs(sim.teamDir.x) > 0.2) Sprite.flipX[eid] = sim.teamDir.x > 0 ? 1 : 0
  }
}
