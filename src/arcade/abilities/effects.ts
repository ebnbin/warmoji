import { blastRing } from '../cues'
import { circleHitIndices } from '../../arcade/hit'
import type { Effect } from '../../types/abilityDefs'
import { angleToNearest } from './targeting'
import type { EffectCtx, TargetInfo } from './types'

// 能力效果层（阵营中立）：命中/覆盖后施加的可复用效果，与「投送方式」正交——
// 任何投送（突刺/弹道/连锁/轰炸…）都经此施加同一套效果，消除各能力类里
// 重复手写的二次判定。ctx.damageTarget 注入阵营/暴击/击退倍率。

/** 命中点圆形范围伤害：对圈内敌对方各造成一次 damage（击退方向从爆心指向目标）。
 * exclude 跳过指定目标（主目标/已命中，避免二次计伤）。溅射/终点震波/连环刃
 * /轰炸共用此一处判定。 */
export function applyBlast(
  ctx: EffectCtx,
  center: { readonly x: number; readonly y: number },
  damage: number,
  radius: number,
  knockback: number,
  exclude?: ReadonlySet<unknown>,
): void {
  const targets = ctx.targets()
  for (const i of circleHitIndices(center, radius, targets)) {
    const t = targets[i]!
    if (exclude?.has(t.ref)) continue
    ctx.damageTarget(t.ref, damage, knockback, center.x, center.y)
  }
}

/** 一次触发的上下文：锚点类效果（blast/ground/spawnProjectile/heal）作用于 center；
 * 逐目标类效果（slow/morph）作用于 targets（本次直接命中的敌对方真身）。
 * exclude 供 blast 跳过主目标/已命中；source 为触发者本身（死亡触发时供 heal 排除自己）。 */
export interface HitContext {
  readonly center: { readonly x: number; readonly y: number }
  readonly baseDamage: number
  readonly targets?: readonly TargetInfo['ref'][]
  readonly exclude?: ReadonlySet<unknown>
  readonly source?: TargetInfo['ref']
}

/** 求值一串效果（命中触发 onHit / 死亡触发 onDeath 共用）：blast 打 center 圆内、
 * slow/morph 施加到 targets、ground 留地面区、heal 治我方、spawnProjectile 朝最近敌对方发弹。 */
export function applyEffects(
  ctx: EffectCtx,
  effects: readonly Effect[] | undefined,
  hit: HitContext,
): void {
  if (!effects) return
  for (const e of effects) {
    if (e.kind === 'blast') {
      applyBlast(ctx, hit.center, Math.max(1, Math.round(hit.baseDamage * e.ratio)), e.radius, e.knockback, hit.exclude)
      if (e.ring) blastRing(ctx.scene, hit.center.x, hit.center.y, e.radius, e.ring)
    } else if (e.kind === 'slow') {
      if (hit.targets) for (const ref of hit.targets) ctx.slowTarget(ref, e.factor, e.durationMs)
    } else if (e.kind === 'poison') {
      if (hit.targets) for (const ref of hit.targets) ctx.poisonTarget?.(ref, e.damage, e.tickMs, e.durationMs)
    } else if (e.kind === 'ground') {
      ctx.spawnGroundEffect(hit.center.x, hit.center.y, e.def)
    } else if (e.kind === 'morph') {
      if (hit.targets) for (const ref of hit.targets) ctx.morphTarget?.(ref, e)
    } else if (e.kind === 'heal') {
      ctx.heal(hit.center.x, hit.center.y, e.range, e.amount, e.all ?? true, hit.source)
    } else if (e.kind === 'spawnProjectile') {
      const angle = angleToNearest(hit.center.x, hit.center.y, ctx.targets())
      if (angle !== null) ctx.spawnBullet?.(hit.center.x, hit.center.y, angle, e.projectile, e.damage, e.lifeMs)
    } else if (e.kind === 'damage') {
      if (hit.targets) for (const ref of hit.targets) ctx.damageTarget(ref, Math.max(1, Math.round(hit.baseDamage * (e.ratio ?? 1))))
    } else if (e.kind === 'attackSlow') {
      if (hit.targets) for (const ref of hit.targets) ctx.attackSlowMember?.(ref, e.mul, e.durationMs)
    }
  }
}
