import { addComponent } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { FACTION, Field, ZoneMend } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { spawnZone } from '../entities/zone'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castFields(sim: Sim, scan = castScan): void {
  scan(sim, Field, (e) => {
    const src = sourceOf(sim, e)
    const heal = Field.healPerSec[e]!
    const zone = spawnZone(sim, {
      x: ownerX(e),
      y: ownerY(e),
      radius: Field.radius[e]!,
      faction: FACTION.team,
      durationMs: Field.durationMs[e]!,
      enterMs: 300,
      color: Field.color[e]!,
      fillAlpha: 0.14,
      lineAlpha: 0.6,
      lineWidth: 3,
      burn: { damage: Field.poisonDamage[e]!, tickMs: Field.poisonTickMs[e]!, srcSlot: src.slot, srcEnemy: undefined },
    })
    addComponent(sim.world, zone, ZoneMend)
    ZoneMend.perSec[zone] = heal
    playSfx('recruit')
  })
}
