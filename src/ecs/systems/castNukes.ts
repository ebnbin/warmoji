import { playSfx } from '../../audio/sfx'
import { Boss, Nuke } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { targetsNear } from '../utils/targets'
import { damageMul, waveScale } from '../utils/amp'
import { hit } from './shared/damage'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

export function castNukes(sim: Sim, scan = castScan): void {
  scan(sim, Nuke, (e) => {
    const src = sourceOf(sim, e)
    sim.out.flash = { color: 0xffffff, alpha: 0.55, durationMs: 380 }
    playSfx('boom')
    const base = Nuke.damage[e]! * waveScale(sim) * damageMul(sim, e)
    const bossRatio = Nuke.bossRatio[e]!
    for (const t of targetsNear(sim, src, ownerX(e), ownerY(e), Infinity)) {
      hit(sim, src, t.eid, Math.max(1, Math.round(base * (Boss.v[t.eid] ? bossRatio : 1))))
    }
  })
}
