import { UNIT } from '../../../util/units'
import { waveAt } from '../../../data/waves'
import type { DeathEffect, DecoyEffect, SplitEffect } from '../../../types/enemies'
import type { Effect } from '../../../types/abilityDefs'
import { Despawn } from '../../components'
import { spawnBrood, spawnEnemy } from '../../entities/enemy'
import { applyAbilityEffects } from './effects'
import { enemySource } from '../../utils/source'
import type { PendingDeath, Sim } from '../../sim'
import type { ByKind } from '../../../util/record'

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

type DeathOf = ByKind<DeathEffect>

type DeathHandler<K extends keyof DeathOf> = (sim: Sim, d: PendingDeath, fx: DeathOf[K], hpMul: number) => void

const toEffectLayer = (sim: Sim, d: PendingDeath, fx: Effect): void => {
  applyAbilityEffects(sim, enemySource(d.def.kind, d.dmgMul), [fx], {
    x: d.x,
    y: d.y,
    baseDamage: 0,
    source: d.eid,
  })
}

const DEATH_KINDS: { [K in keyof DeathOf]: DeathHandler<K> } = {
  split: spawnSplit,
  decoy: spawnDecoy,
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
  for (const fx of effects) replayEffect(sim, d, fx, hpMul)
}

function replayEffect<K extends keyof DeathOf>(sim: Sim, d: PendingDeath, fx: DeathOf[K] & { readonly kind: K }, hpMul: number): void {
  DEATH_KINDS[fx.kind](sim, d, fx, hpMul)
}

