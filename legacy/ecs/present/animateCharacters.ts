import { UNIT } from '../../util/units'
import { charSize } from '../systems/shared/scale'
import { REJOIN } from '../../data/feel'
import { Alive, Breath, Depth, Phys, Pop, Sprite, Transform } from '../components'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

const STRIDE = 20

/** 落地压扁再回弹，按阻尼振荡收回原样 */
function popping(sim: Sim, eid: number, charSize: number): boolean {
  const left = Pop.until[eid]! - sim.fxMs
  if (left <= 0) return false
  const u = 1 - left / Pop.ms[eid]!
  const s = REJOIN.squash * Math.exp(-4 * u) * Math.cos(3 * Math.PI * u)
  Transform.w[eid] = charSize * (1 + s)
  Transform.h[eid] = charSize * (1 - s)
  return true
}

/** 画面停住时把还在进行的回弹直接收尾 */
export function finishCharacterPops(sim: Sim): void {
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    const size = charSize(eid)
    if (Pop.until[eid] === 0 || popping(sim, eid, size)) continue
    Pop.until[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
  }
}

/** 按离队长的远近排前后，走动时呼吸快些，按速度转身；dtMs 是这一帧模拟走过的时长 */
export function animateCharacters(sim: Sim, dtMs: number): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of sim.characters) {
    Depth.z[eid] = 10 + sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, Transform.y[eid]!).y / UNIT
    if (!Alive.v[eid]) continue
    const vx = Phys.vx[eid]!
    const moving = Math.hypot(vx, Phys.vy[eid]!) > STRIDE
    const size = charSize(eid)
    if (!popping(sim, eid, size)) {
      const bp = Breath.phase[eid]! + dtMs / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = size * (1 - s * 0.6)
      Transform.h[eid] = size * (1 + s)
    }
    if (Math.abs(vx) > STRIDE) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
