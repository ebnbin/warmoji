import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Enemy, CharAtkSlow, Morph, Poison, Slow } from '../../components'
import { applyMorph } from '../../entities/enemy'
import { spawnEnemyProjectile } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { damageTarget } from './damage'
import { FACTION } from '../../components'
import { healEnemies, healCharacters } from './heal'
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
    damageTarget(sim, src, t.eid, damage, knockback, x, y)
  }
}

function eachCapable(sim: Sim, hit: HitCtx, comp: object, apply: (t: number) => void): void {
  for (const t of hit.targets ?? []) {
    if (hasComponent(sim.world, t, comp)) apply(t)
  }
}

type EffectOf = ByKind<Effect>

type Handler<K extends keyof EffectOf> = (sim: Sim, src: Source, fx: EffectOf[K], hit: HitCtx) => void

const EFFECT_KINDS: { [K in keyof EffectOf]: Handler<K> } = {
  blast: (sim, src, fx, hit) => {
    const dmg = Math.max(1, Math.round(hit.baseDamage * fx.ratio))
    applyBlast(sim, src, hit.x, hit.y, dmg, fx.radius, fx.knockback, hit.exclude)
    if (fx.ring) spawnFxRing(sim, hit.x, hit.y, fx.radius, fx.ring)
  },

  slow: (sim, _src, fx, hit) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, hit, Slow, (t) => {
      Slow.until[t] = until
      Slow.mul[t] = fx.factor
    })
  },

  poison: (sim, src, fx, hit) => {
    const now = sim.elapsedMs
    eachCapable(sim, hit, Poison, (t) => {
      Poison.until[t] = now + fx.durationMs
      Poison.nextTick[t] = now + fx.tickMs
      Poison.dmg[t] = fx.damage
      Poison.tickMs[t] = fx.tickMs
      Poison.slot[t] = src.slot
    })
  },

  morph: (sim, _src, fx, hit) => {
    eachCapable(sim, hit, Morph, (t) => {
      if (hasComponent(sim.world, t, Enemy)) applyMorph(sim, sim.frames, t, fx)
    })
  },

  attackSlow: (sim, _src, fx, hit) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, hit, CharAtkSlow, (t) => {
      CharAtkSlow.until[t] = until
      CharAtkSlow.mul[t] = fx.mul
    })
  },

  ground: (sim, src, fx, hit) => {
    spawnZone(sim, {
      x: hit.x,
      y: hit.y,
      radius: fx.def.radius,
      faction: src.faction,
      durationMs: fx.def.durationMs,
      enterMs: fx.def.enterMs,
      color: fx.def.color,
      fillAlpha: fx.def.fillAlpha,
      lineAlpha: fx.def.lineAlpha,
      lineWidth: 2,
      burn: {
        damage: fx.def.damage,
        tickMs: fx.def.tickMs,
        srcSlot: src.slot,
        srcEnemy: src.faction === FACTION.team ? undefined : src.enemy,
      },
    })
  },

  heal: (sim, src, fx, hit) => {
    const all = fx.all ?? true
    if (src.faction === FACTION.team) healCharacters(sim, hit.x, hit.y, fx.range, fx.amount, all)
    else healEnemies(sim, hit.x, hit.y, fx.range, fx.amount, all, hit.source)
  },

  spawnProjectile: (sim, src, fx, hit) => {
    if (src.faction === FACTION.team) return
    const angle = nearestAngle(sim, src, hit.x, hit.y, Infinity)
    if (angle === null) return
    spawnEnemyProjectile(sim, hit.x, hit.y, angle, {
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
  hit: HitCtx,
): void {
  if (!effects) return
  for (const fx of effects) applyEffect(sim, src, fx, hit)
}

function applyEffect<K extends keyof EffectOf>(sim: Sim, src: Source, fx: EffectOf[K] & { readonly kind: K }, hit: HitCtx): void {
  EFFECT_KINDS[fx.kind](sim, src, fx, hit)
}
