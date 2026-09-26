import { UNIT } from '../../util/units'
import { MEMBER } from '../../data/characters'
import { Alive, Breath, CharScale, Phys, Pop, Sprite, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

const STRIDE = 20

function popping(sim: Sim, eid: number, charSize: number): boolean {
  const left = Pop.until[eid]! - sim.fxMs
  if (left <= 0) return false
  const pop = charSize * (0.3 + 0.7 * backEaseOut(1 - left / 200))
  Transform.w[eid] = pop
  Transform.h[eid] = pop
  return true
}

export function finishCharacterPops(sim: Sim): void {
  const baseSize = MEMBER.size * UNIT
  for (const eid of sim.characters) {
    const charSize = baseSize * CharScale.v[eid]!
    if (!Alive.v[eid] || Pop.until[eid] === 0 || popping(sim, eid, charSize)) continue
    Pop.until[eid] = 0
    Transform.w[eid] = charSize
    Transform.h[eid] = charSize
  }
}

export function animateCharacters(sim: Sim): void {
  const delta = sim.dtMs
  const baseSize = MEMBER.size * UNIT
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    const vx = Phys.vx[eid]!
    const moving = Math.hypot(vx, Phys.vy[eid]!) > STRIDE
    const charSize = baseSize * CharScale.v[eid]!
    if (!popping(sim, eid, charSize)) {
      const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = charSize * (1 - s * 0.6)
      Transform.h[eid] = charSize * (1 + s)
    }
    if (Math.abs(vx) > STRIDE) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
