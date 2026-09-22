import { blastRing } from '../cues'
import { circleHitIndices } from '../../arcade/hit'
import type { Effect } from '../../types/abilityDefs'
import { angleToNearest } from './targeting'
import type { EffectCtx, TargetInfo } from './types'

/** exclude 跳过的目标不计伤 */
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

/** 锚点类效果作用于 center；逐目标类作用于 targets；source 为触发者，死亡触发时 heal 排除它 */
export interface HitContext {
  readonly center: { readonly x: number; readonly y: number }
  readonly baseDamage: number
  readonly targets?: readonly TargetInfo['ref'][]
  readonly exclude?: ReadonlySet<unknown>
  readonly source?: TargetInfo['ref']
}

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
