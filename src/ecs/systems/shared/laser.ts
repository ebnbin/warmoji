import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../utils/hit'
import { Laser } from '../../components'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { damageTarget } from './damage'
import { sourceOf } from '../../utils/source'
import { targetsOf } from '../../utils/targets'
import type { Sim } from '../../sim'
import { spawnFxBeam } from '../../entities/fx'

/** ratio 为扫射分束的折损 */
export function fireBeam(sim: Sim, e: number, angle: number, ratio: number): void {
  const src = sourceOf(sim, e)
  playSfx('zap')
  const damage = Math.max(1, Math.round(Laser.damage[e]! * damageMul(sim, e) * ratio))
  const range = Laser.range[e]!
  const beamRadius = Laser.beamRadius[e]!
  const ox = ownerX(e)
  const oy = ownerY(e)
  const list = targetsOf(sim, src)
  for (const i of thrustHitIndices({ x: ox, y: oy }, angle, range, beamRadius, list)) {
    damageTarget(sim, src, list[i]!.eid, damage, Laser.knockback[e]!, ox, oy)
  }
  spawnFxBeam(sim, ox, oy, angle, range, beamRadius, Laser.color[e]!)
}
