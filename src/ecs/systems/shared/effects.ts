import { hasComponent } from 'bitecs'
import type { Effect } from '../../../types/abilityDefs'
import { circleHitIndices } from '../../utils/hit'
import { Enemy, CharAtkSlow, Morph, Poison, Slow } from '../../components'
import { applyMorph } from '../../entities/enemy'
import { spawnEnemyProjectileEcs } from '../../entities/projectile'
import { spawnZone } from '../../entities/zone'
import { } from '../../store'
import { damageTarget } from './damage'
import { FACTION } from '../../components'
import { healEnemies, healCharacters } from './heal'
import { nearestAngle, targetsOf } from '../../utils/targets'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import { spawnFxRing } from '../../entities/fx'

// 状态类效果按目标有没有对应组件施加，不按阵营判

/** 锚点类效果作用于 (x,y)；逐目标类作用于 targets */
export interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  /** blast 跳过的目标 */
  readonly exclude?: ReadonlySet<number>
  /** 死亡触发时 heal 排除它 */
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
  const list = targetsOf(sim, src)
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

type Handler<K extends Effect['kind']> = (
  sim: Sim,
  src: Source,
  fx: Extract<Effect, { kind: K }>,
  hit: HitCtx,
) => void

const EFFECT_KINDS: { [K in Effect['kind']]: Handler<K> } = {
  blast: (sim, src, fx, hit) => {
    const dmg = Math.max(1, Math.round(hit.baseDamage * fx.ratio))
    applyBlast(sim, src, hit.x, hit.y, dmg, fx.radius, fx.knockback, hit.exclude)
    if (fx.ring) spawnFxRing(sim, hit.x, hit.y, fx.radius, fx.ring)
  },

  damage: (sim, src, fx, hit) => {
    const dmg = Math.max(1, Math.round(hit.baseDamage * (fx.ratio ?? 1)))
    for (const t of hit.targets ?? []) damageTarget(sim, src, t, dmg)
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

  // 这一帧刚死的不变形
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

  // 不挂 Owner：可活过放它的人
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
        srcName: src.faction === FACTION.team ? '' : (src.name ?? ''),
      },
    })
  },

  heal: (sim, src, fx, hit) => {
    const all = fx.all ?? true
    if (src.faction === FACTION.team) healCharacters(sim, hit.x, hit.y, fx.range, fx.amount, all)
    else healEnemies(sim, hit.x, hit.y, fx.range, fx.amount, all, hit.source)
  },

  // 只对敌方侧成立，gen 校验
  spawnProjectile: (sim, src, fx, hit) => {
    if (src.faction === FACTION.team) return
    const angle = nearestAngle(hit.x, hit.y, targetsOf(sim, src), Infinity)
    if (angle === null) return
    spawnEnemyProjectileEcs(sim, hit.x, hit.y, angle, {
      frame: sim.frames.index(fx.projectile.emoji, 'enemyProjectile'),
      size: fx.projectile.size,
      radius: fx.projectile.radius,
      speed: fx.projectile.speed,
      damage: Math.round(fx.damage * src.dmgMul),
      lifeMs: fx.lifeMs,
      srcName: src.name,
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
  for (const fx of effects) {
    ;(EFFECT_KINDS[fx.kind] as Handler<Effect['kind']>)(sim, src, fx, hit)
  }
}
