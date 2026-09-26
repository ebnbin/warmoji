import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Alive, AtkSlow, Boss, Dancing, DmgBuff, Enemy, EState, FACTION, Guard, Hidden, Hp, Iframe, Morph, Poison, Revive, Rushing, Slow, Taunted, Tint } from '../../components'
import { poisonSrc } from '../../store'
import { applyMorph } from '../../entities/enemy'
import { spawnBolt } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { spawnCoins } from '../../entities/pickup'
import { hit } from './damage'
import { grantIframe, reviveCharacter } from './combat'
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
    hit(sim, src, t.eid, damage, { knockback, from: { x, y } })
  }
}

function eachCapable(sim: Sim, at: HitCtx, comp: object, apply: (t: number) => void): void {
  for (const t of at.targets ?? []) {
    if (hasComponent(sim.world, t, comp)) apply(t)
  }
}

type EffectOf = ByKind<Effect>

type Handler<K extends keyof EffectOf> = (sim: Sim, src: Source, fx: EffectOf[K], at: HitCtx) => void

/** 效果只看目标有没有对应的组件，不看阵营 */
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
    const amount = Math.max(1, Math.round(fx.amount * src.dmgMul))
    if (!at.targets) {
      healAllies(sim, src.faction, at.x, at.y, fx.range ?? 0, amount, fx.scope !== 'lowest', at.source ?? -1)
      return
    }
    const hurt = at.targets.filter((t) => hasComponent(sim.world, t, Hp) && Alive.v[t] === 1 && Hp.v[t]! < Hp.max[t]!)
    if (hurt.length === 0) return
    const each = Math.max(1, Math.round(amount * (fx.ratio ?? 1)))
    if (fx.scope === 'lowest') {
      let best = hurt[0]!
      for (const t of hurt) if (Hp.v[t]! / Hp.max[t]! < Hp.v[best]! / Hp.max[best]!) best = t
      Hp.v[best] = Math.min(Hp.max[best]!, Hp.v[best]! + each)
      return
    }
    for (const t of hurt) Hp.v[t] = Math.min(Hp.max[t]!, Hp.v[t]! + each)
  },

  spawnProjectile: (sim, src, fx, at) => {
    const angle = nearestAngle(sim, src, at.x, at.y, Infinity)
    if (angle === null) return
    spawnBolt(sim, at.x, at.y, angle, {
      faction: src.faction,
      frame: sim.frames.index(fx.projectile.emoji, src.faction === FACTION.enemy ? 'enemyProjectile' : 'player'),
      size: fx.projectile.size,
      radius: fx.projectile.radius,
      speed: fx.projectile.speed,
      rotOffsetDeg: fx.projectile.rotationOffsetDeg,
      lifeMs: fx.lifeMs,
      pierce: 0,
      damage: fx.damage * src.dmgMul,
      knockback: 0,
      srcSlot: src.slot,
      srcEnemy: src.enemy,
    })
  },

  buff: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, DmgBuff, (t) => {
      DmgBuff.mul[t] = fx.damageMul
      DmgBuff.until[t] = until
    })
  },

  stun: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Dancing, (t) => {
      Dancing.until[t] = until
      Rushing.active[t] = 0
      if (EState.v[t] !== 2 && EState.v[t] !== 3) return
      EState.v[t] = Boss.v[t] ? 1 : 0
      Tint.effect[t] = 0
      Tint.color[t] = 0xffffff
    })
  },

  hide: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Hidden, (t) => {
      Hidden.until[t] = until
    })
  },

  taunt: (sim, src, fx, at) => {
    const by = src.viewer
    if (by === undefined) return
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Taunted, (t) => {
      Taunted.until[t] = until
      Taunted.by[t] = by
    })
  },

  guard: (sim, _src, fx, at) => {
    const until = sim.elapsedMs + fx.durationMs
    eachCapable(sim, at, Guard, (t) => {
      Guard.mul[t] = fx.mul
      Guard.until[t] = until
    })
  },

  revive: (sim, _src, _fx, at) => {
    eachCapable(sim, at, Revive, (t) => {
      if (!Alive.v[t]) reviveCharacter(sim, t)
    })
  },

  healRatio: (sim, _src, fx, at) => {
    eachCapable(sim, at, Hp, (t) => {
      if (Alive.v[t]) Hp.v[t] = Math.min(Hp.max[t]!, Hp.v[t]! + Hp.max[t]! * fx.ratio)
    })
  },

  invuln: (sim, _src, fx, at) => {
    eachCapable(sim, at, Iframe, (t) => {
      if (Alive.v[t]) grantIframe(sim, t, fx.ms)
    })
  },

  reviveCut: (sim, _src, fx, at) => {
    let best = -1
    eachCapable(sim, at, Revive, (t) => {
      if (Alive.v[t]) return
      if (best < 0 || Revive.at[t]! > Revive.at[best]!) best = t
    })
    if (best >= 0) Revive.at[best] = Revive.at[best]! - fx.ms
  },

  timeStop: (sim, _src, fx) => {
    sim.timeStopMsLeft = fx.durationMs
  },

  coins: (sim, src, fx, at) => {
    if (src.faction === FACTION.team) spawnCoins(sim, at.x, at.y, fx.count)
  },
}

export function applyAbilityEffects(sim: Sim, src: Source, effects: readonly Effect[] | undefined, at: HitCtx): void {
  if (!effects) return
  for (const fx of effects) applyEffect(sim, src, fx, at)
}

function applyEffect<K extends keyof EffectOf>(sim: Sim, src: Source, fx: EffectOf[K] & { readonly kind: K }, at: HitCtx): void {
  EFFECT_KINDS[fx.kind](sim, src, fx, at)
}
