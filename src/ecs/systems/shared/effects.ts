import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Enemy, AtkSlow, FACTION, Morph, Poison, Slow } from '../../components'
import { poisonSrc } from '../../store'
import { applyMorph } from '../../entities/enemy'
import { spawnEnemyProjectile } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { hit } from './damage'
import { healAllies } from './heal'
import { nearestAngle, targetsNear } from '../../utils/targets'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import type { ByKind } from '../../../util/record'
import { spawnFxRing } from '../../entities/fx'

export interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  readonly exclude?: ReadonlySet<number>
  readonly source?: number
}

export function applyBlast(
  sim: Sim,
  src: Source,
  x: number,
  y: number,
  damage: number,
  radius: number,
  knockback: number,
  exclude?: ReadonlySet<number>,
): void {
  const list = targetsNear(sim, src, x, y, radius)
  for (const i of circleHitIndices({ x, y }, radius, list)) {
    const t = list[i]!
    if (exclude?.has(t.eid)) continue
    hit(sim, src, t.eid, damage, { knockback: knockback, from: { x: x, y: y } })
  }
}

function eachCapable(sim: Sim, at: HitCtx, comp: object, apply: (t: number) => void): void {
  for (const t of at.targets ?? []) {
    if (hasComponent(sim.world, t, comp)) apply(t)
  }
}

type EffectOf = ByKind<Effect>

type Handler<K extends keyof EffectOf> = (sim: Sim, src: Source, fx: EffectOf[K], at: HitCtx) => void

const EFFECT_KINDS: { [K in keyof EffectOf]: Handler<K> } = {
  blast: (sim, src, fx, at) => {
    const dmg = Math.max(1, Math.round(at.baseDamage * fx.ratio))
    applyBlast(sim, src, at.x, at.y, dmg, fx.radius, fx.knockback, at.exclude)
    if (fx.ring) spawnFxRing(sim, at.x, at.y, fx.radius, fx.ring)
  },

  slow: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Slow, (t) => {
      Slow.until[t] = until
      Slow.mul[t] = fx.factor
    })
  },

  poison: (sim, src, fx, at) => {
    const now = sim.elapsedMs
    eachCapable(sim, at, Poison, (t) => {
      Poison.until[t] = now + fx.durationMs
      Poison.nextTick[t] = now + fx.tickMs
      Poison.dmg[t] = fx.damage
      Poison.tickMs[t] = fx.tickMs
      poisonSrc[t] = src
    })
  },

  morph: (sim, _src, fx, at) => {
    eachCapable(sim, at, Morph, (t) => {
      if (hasComponent(sim.world, t, Enemy)) applyMorph(sim, sim.frames, t, fx)
    })
  },

  attackSlow: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, AtkSlow, (t) => {
      AtkSlow.until[t] = until
      AtkSlow.mul[t] = fx.mul
    })
  },

  ground: (sim, src, fx, at) => {
    spawnZone(sim, {
      x: at.x,
      y: at.y,
      radius: fx.def.radius,
      src: { ...src, tint: 0xa5d86a },
      durationMs: fx.def.durationMs,
      enterMs: fx.def.enterMs,
      color: fx.def.color,
      fillAlpha: fx.def.fillAlpha,
      lineAlpha: fx.def.lineAlpha,
      lineWidth: 2,
      tickMs: fx.def.tickMs,
      damage: fx.def.damage,
    })
  },

  heal: (sim, src, fx, at) => {
    healAllies(sim, src.faction, at.x, at.y, fx.range, fx.amount, fx.all ?? true, at.source ?? -1)
  },

  spawnProjectile: (sim, src, fx, at) => {
    if (src.faction === FACTION.team) return
    const angle = nearestAngle(sim, src, at.x, at.y, Infinity)
    if (angle === null) return
    spawnEnemyProjectile(sim, at.x, at.y, angle, {
      frame: sim.frames.index(fx.projectile.emoji, 'enemyProjectile'),
      size: fx.projectile.size,
      radius: fx.projectile.radius,
      speed: fx.projectile.speed,
      damage: Math.round(fx.damage * src.dmgMul),
      lifeMs: fx.lifeMs,
      srcEnemy: src.enemy,
    })
  },
}

export function applyAbilityEffects(
  sim: Sim,
  src: Source,
  effects: readonly Effect[] | undefined,
  at: HitCtx,
): void {
  if (!effects) return
  for (const fx of effects) applyEffect(sim, src, fx, at)
}

function applyEffect<K extends keyof EffectOf>(sim: Sim, src: Source, fx: EffectOf[K] & { readonly kind: K }, at: HitCtx): void {
  EFFECT_KINDS[fx.kind](sim, src, fx, at)
}
