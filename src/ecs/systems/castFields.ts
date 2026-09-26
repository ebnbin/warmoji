import { playSfx } from '../../audio/sfx'
import { Field } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { spawnZone } from '../entities/zone'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castFields(sim: Sim, scan = castScan): void {
  scan(sim, Field, (e) => {
    spawnZone(sim, {
      x: ownerX(e),
      y: ownerY(e),
      radius: Field.radius[e]!,
      src: sourceOf(sim, e),
      durationMs: Field.durationMs[e]!,
      enterMs: 300,
      color: Field.color[e]!,
      fillAlpha: 0.14,
      lineAlpha: 0.6,
      lineWidth: 3,
      tickMs: Field.poisonTickMs[e]!,
      damage: Field.poisonDamage[e]!,
      mend: Field.healPerSec[e]!,
    })
    playSfx('recruit')
  })
}
