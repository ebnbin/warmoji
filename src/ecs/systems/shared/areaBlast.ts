import { playSfx } from '../../../audio/sfx'
import { AreaBlast } from '../../components'
import { abilityOnHit } from '../../store'
import { applyAbilityEffects, applyBlast } from './effects'
import { sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'
import { spawnFxBoom, spawnFxCircle } from '../../entities/fx'

export function blastAt(sim: Sim, e: number, x: number, y: number, damage: number): void {
  const src = sourceOf(sim, e)
  const radius = AreaBlast.blastRadius[e]!
  const color = AreaBlast.color[e]!
  playSfx('boom')
  applyBlast(sim, src, x, y, damage, radius, AreaBlast.knockback[e]!)
  applyAbilityEffects(sim, src, abilityOnHit[e], { x, y, baseDamage: damage })
  spawnFxCircle(sim, x, y, radius * 0.55, { fill: 0xffffff, fillAlpha: 0.9, fromScale: 1, toScale: 1.7, durationMs: 170, depth: 8 })
  spawnFxCircle(sim, x, y, radius, {
    fill: color,
    fillAlpha: 0.4,
    stroke: color,
    lineWidth: 6,
    lineAlpha: 1,
    fromScale: 0.25,
    toScale: 1.08,
    durationMs: 400,
    depth: 7,
  })
  spawnFxBoom(sim, x, y, radius * 1.5)
}
