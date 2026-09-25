import { UNIT } from '../../../util/units'
import { waveAt } from '../../../data/waves'
import type { DeathEffect, DecoyEffect, SplitEffect } from '../../../types/enemies'
import type { Effect } from '../../../types/abilityDefs'
import { Despawn } from '../../components'
import { spawnBrood, spawnEnemy } from '../../entities/enemy'
import { applyAbilityEffects } from './effects'
import { enemySource } from '../../utils/source'
import type { PendingDeath, Sim } from '../../sim'

function spawnSplit(sim: Sim, d: PendingDeath, fx: SplitEffect): void {
  if (sim.over) return
  spawnBrood(sim, sim.frames, fx.into, fx.count, d.x, d.y, 0.5 * UNIT, -1)
}

function spawnDecoy(sim: Sim, d: PendingDeath, fx: DecoyEffect, hpMul: number): void {
  if (sim.over) return
  const husk = {
    ...d.def,
    damage: 0,
    speed: 0,
    xp: 0,
    coins: 0,
    locomotion: { kind: 'wander' as const },
    abilities: undefined,
    onDeath: undefined,
    kbImmune: true,
  }
  const eid = spawnEnemy(sim, sim.frames, husk, d.x, d.y, Math.round(fx.hp * hpMul), false, false, fx.alpha)
  Despawn.at[eid] = sim.elapsedMs + fx.durationMs
}

type DeathHandler = (sim: Sim, d: PendingDeath, fx: DeathEffect, hpMul: number) => void

const toEffectLayer: DeathHandler = (sim, d, fx) => {
  applyAbilityEffects(sim, enemySource(d.def.kind, d.dmgMul), [fx as Effect], {
    x: d.x,
    y: d.y,
    baseDamage: 0,
    source: d.eid,
  })
}

const DEATH_KINDS: Record<DeathEffect['kind'], DeathHandler> = {
  split: (sim, d, fx) => spawnSplit(sim, d, fx as SplitEffect),
  decoy: (sim, d, fx, hpMul) => spawnDecoy(sim, d, fx as DecoyEffect, hpMul),
  blast: toEffectLayer,
  slow: toEffectLayer,
  poison: toEffectLayer,
  morph: toEffectLayer,
  attackSlow: toEffectLayer,
  ground: toEffectLayer,
  heal: toEffectLayer,
  spawnProjectile: toEffectLayer,
}

export function replayDeath(sim: Sim, d: PendingDeath): void {
  const effects = d.def.onDeath
  if (!effects) return
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (const fx of effects) DEATH_KINDS[fx.kind]!(sim, d, fx, hpMul)
}

