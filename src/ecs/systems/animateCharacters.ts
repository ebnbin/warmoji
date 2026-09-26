import { UNIT } from '../../util/units'
import { MEMBER } from '../../data/characters'
import { SQUAD } from '../../data/feel'
import { Alive, Breath, CharScale, Depth, Facing, Phys, Pop, Sprite, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

const STRIDE = 20
const HEADING_MIN = 0.5

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

/** 相对介质的速度先低通滤波，滤波后快过阈值才更新朝向，静止时保留上一次的方向 */
function face(sim: Sim, eid: number): void {
  const medium = sim.hooks.mediumVelocity(sim, Transform.x[eid]!, Transform.y[eid]!)
  const k = Math.min(1, sim.dtMs / SQUAD.facingTauMs)
  const fvx = Facing.vx[eid]! + (Phys.vx[eid]! - medium.x - Facing.vx[eid]!) * k
  const fvy = Facing.vy[eid]! + (Phys.vy[eid]! - medium.y - Facing.vy[eid]!) * k
  Facing.vx[eid] = fvx
  Facing.vy[eid] = fvy
  const speed = Math.hypot(fvx, fvy)
  if (speed <= HEADING_MIN * UNIT) return
  Facing.x[eid] = fvx / speed
  Facing.y[eid] = fvy / speed
}

export function animateCharacters(sim: Sim): void {
  const delta = sim.dtMs
  const baseSize = MEMBER.size * UNIT
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of sim.characters) {
    Depth.z[eid] = 10 + sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, Transform.y[eid]!).y / UNIT
    if (!Alive.v[eid]) continue
    face(sim, eid)
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
