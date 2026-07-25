import type { Effect } from '../../data/abilityDefs'
import { circleHitIndices } from '../../war/abilities/hit'
import { MAtkSlow, Poison, Slow } from '../components'
import { applyMorph } from '../morph'
import { spawnEnemyProjectileEcs } from '../projectile'
import { enemyDef } from '../store'
import { attributionSlot, damageTarget } from './amp'
import { FACTION, Faction, Owner } from './components'
import { healEnemies, healMembers } from './heal'
import { nearestAngle, targetsOf } from './targets'
import type { Sim } from '../sim'

// 命中效果层（阵营中立）：「投送方式」与「命中后做什么」正交——任何投送都经此施加
// 同一套效果。落点归属（暴击/击退倍率/战报分账/该打哪一侧）由能力实体本身决定，
// 效果只描述做什么。

/** 一次触发的落点：锚点类效果（blast/ground/spawnProjectile/heal）作用于 (x,y)；
 * 逐目标类效果（damage/slow/poison/morph/attackSlow）作用于 targets（本次直接命中的真身） */
export interface HitCtx {
  readonly x: number
  readonly y: number
  readonly baseDamage: number
  readonly targets?: readonly number[]
  /** blast 跳过的目标（主目标 / 已命中） */
  readonly exclude?: ReadonlySet<number>
  /** 触发者自身（死亡触发时 heal 排除正在死亡的自己） */
  readonly source?: number
}

/** 锚点圆内各造成一次伤害（击退方向从锚点指向目标）；溅射/终点震波/连环刃/轰炸共用 */
export function applyBlast(
  sim: Sim,
  e: number,
  x: number,
  y: number,
  damage: number,
  radius: number,
  knockback: number,
  exclude?: ReadonlySet<number>,
): void {
  const list = targetsOf(sim, e)
  for (const i of circleHitIndices({ x, y }, radius, list)) {
    const t = list[i]!
    if (exclude?.has(t.eid)) continue
    damageTarget(sim, e, t.eid, damage, knockback, x, y)
  }
}

/** 求值一串效果（命中触发 onHit 共用）。缺席某侧机制的效果在该阵营下静默跳过 */
export function applyAbilityEffects(
  sim: Sim,
  e: number,
  effects: readonly Effect[] | undefined,
  hit: HitCtx,
): void {
  if (!effects) return
  const team = Faction.v[e] === FACTION.team
  const now = sim.elapsedMs
  for (const fx of effects) {
    if (fx.kind === 'blast') {
      const dmg = Math.max(1, Math.round(hit.baseDamage * fx.ratio))
      applyBlast(sim, e, hit.x, hit.y, dmg, fx.radius, fx.knockback, hit.exclude)
      if (fx.ring) {
        sim.pendingCues.push({
          kind: 'circle',
          x: hit.x,
          y: hit.y,
          radius: fx.radius,
          o: {
            fill: fx.ring.color,
            fillAlpha: fx.ring.fillAlpha,
            stroke: fx.ring.color,
            lineWidth: fx.ring.lineWidth,
            lineAlpha: fx.ring.lineAlpha,
            fromScale: 0.3,
            toScale: 1,
            durationMs: fx.ring.durMs,
            depth: 7,
          },
        })
      }
    } else if (fx.kind === 'damage') {
      const dmg = Math.max(1, Math.round(hit.baseDamage * (fx.ratio ?? 1)))
      for (const t of hit.targets ?? []) damageTarget(sim, e, t, dmg)
    } else if (fx.kind === 'slow') {
      if (!team) continue // 队员无减速机制
      for (const t of hit.targets ?? []) {
        Slow.until[t] = now + fx.durationMs
        Slow.mul[t] = fx.factor
      }
    } else if (fx.kind === 'poison') {
      if (!team) continue // 队员无中毒机制
      const slot = attributionSlot(e)
      for (const t of hit.targets ?? []) {
        Poison.until[t] = now + fx.durationMs
        Poison.nextTick[t] = now + fx.tickMs
        Poison.dmg[t] = fx.damage
        Poison.tickMs[t] = fx.tickMs
        Poison.slot[t] = slot
      }
    } else if (fx.kind === 'morph') {
      if (!team) continue // 敌方无变形手段
      for (const t of hit.targets ?? []) {
        if (enemyDef[t] !== undefined) applyMorph(sim, sim.frames, t, fx) // 死者不变形
      }
    } else if (fx.kind === 'attackSlow') {
      if (team) continue // 攻速减益是敌 → 队员专属
      for (const t of hit.targets ?? []) {
        MAtkSlow.until[t] = now + fx.durationMs
        MAtkSlow.mul[t] = fx.mul
      }
    } else if (fx.kind === 'ground') {
      sim.pendingGrounds.push({
        x: hit.x,
        y: hit.y,
        def: fx.def,
        faction: team ? 'team' : 'enemy',
        srcSlot: attributionSlot(e),
        srcName: team ? '' : (enemyDef[Owner.eid[e]!]?.name ?? ''),
      })
    } else if (fx.kind === 'heal') {
      const all = fx.all ?? true
      if (team) healMembers(sim, hit.x, hit.y, fx.range, fx.amount, all)
      else healEnemies(sim, hit.x, hit.y, fx.range, fx.amount, all, hit.source)
    } else if (fx.kind === 'spawnProjectile') {
      if (team) continue // 目前只有敌方死亡冷枪在用
      const angle = nearestAngle(hit.x, hit.y, targetsOf(sim, e), Infinity)
      if (angle === null) continue
      spawnEnemyProjectileEcs(sim, sim.frames, hit.x, hit.y, angle, {
        emoji: fx.projectile.emoji,
        size: fx.projectile.size,
        radius: fx.projectile.radius,
        speed: fx.projectile.speed,
        damage: fx.damage,
        lifeMs: fx.lifeMs,
        srcName: enemyDef[Owner.eid[e]!]?.name,
      })
    }
  }
}
