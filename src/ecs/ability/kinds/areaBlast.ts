import type { AreaBlastDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { applyAbilityEffects, applyBlast } from '../effects'
import { sourceOf } from '../source'
import type { Sim } from '../../sim'

/** 一次完整爆炸：伤害 + 命中效果 + 白闪核心/冲击环/爆裂 */
export function blastAt(sim: Sim, e: number, def: AreaBlastDef, x: number, y: number, damage: number): void {
  const src = sourceOf(sim, e)
  playSfx('boom')
  applyBlast(sim, src, x, y, damage, def.blastRadius, def.knockback)
  applyAbilityEffects(sim, src, def.onHit, { x, y, baseDamage: damage })
  sim.pendingCues.push(
    {
      kind: 'circle',
      x,
      y,
      radius: def.blastRadius * 0.55,
      o: { fill: 0xffffff, fillAlpha: 0.9, fromScale: 1, toScale: 1.7, durationMs: 170, depth: 8 },
    },
    {
      kind: 'circle',
      x,
      y,
      radius: def.blastRadius,
      o: {
        fill: def.color,
        fillAlpha: 0.4,
        stroke: def.color,
        lineWidth: 6,
        lineAlpha: 1,
        fromScale: 0.25,
        toScale: 1.08,
        durationMs: 400,
        depth: 7,
      },
    },
    { kind: 'boom', x, y, size: def.blastRadius * 1.5 },
  )
}
