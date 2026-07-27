import { playSfx } from '../../../audio/sfx'
import { thrustHitIndices } from '../../../war/hit'
import { Laser } from '../../components'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { damageTarget } from './damage'
import { sourceOf } from '../../utils/source'
import { targetsOf } from '../../utils/targets'
import type { Sim } from '../../sim'

/** 发射一束：胶囊判定 + 光束特效（ratio 折损用于扫射分束） */
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
  sim.out.cues.push({
    kind: 'beam',
    x: ox,
    y: oy,
    angle,
    length: range,
    radius: beamRadius,
    color: Laser.color[e]!,
  })
}
