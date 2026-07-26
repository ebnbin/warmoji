import type { LaserDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { thrustHitIndices } from '../../war/hit'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './damage'
import { sourceOf } from '../utils/source'
import { targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 发射一束：胶囊判定 + 光束特效（ratio 折损用于扫射分束） */
export function fireBeam(sim: Sim, e: number, def: LaserDef, angle: number, ratio: number): void {
  const src = sourceOf(sim, e)
  playSfx('zap')
  const damage = Math.max(1, Math.round(def.damage * damageMul(sim, e) * ratio))
  const ox = ownerX(e)
  const oy = ownerY(e)
  const list = targetsOf(sim, src)
  for (const i of thrustHitIndices({ x: ox, y: oy }, angle, def.range, def.beamRadius, list)) {
    damageTarget(sim, src, list[i]!.eid, damage, def.knockback, ox, oy)
  }
  sim.pendingCues.push({
    kind: 'beam',
    x: ox,
    y: oy,
    angle,
    length: def.range,
    radius: def.beamRadius,
    color: def.color,
  })
}
