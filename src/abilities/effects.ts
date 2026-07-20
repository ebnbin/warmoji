import { circleHitIndices } from './defs'
import type { BlastRing, Effect } from './defs'
import type { AbilityContext, TargetInfo } from './types'

// 能力效果层（阵营中立）：命中/覆盖后施加的可复用效果，与「投送方式」正交——
// 任何投送（突刺/弹道/连锁/轰炸…）都经此施加同一套效果，消除各能力类里
// 重复手写的二次判定。ctx.damageTarget 注入阵营/暴击/击退倍率。

/** 命中点圆形范围伤害：对圈内敌对方各造成一次 damage（击退方向从爆心指向目标）。
 * exclude 跳过指定目标（主目标/已命中，避免二次计伤）。溅射/终点震波/连环刃
 * /轰炸共用此一处判定。 */
export function applyBlast(
  ctx: AbilityContext,
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

/** 命中环 VFX：从锚点扩张淡出的一圈（纯表现，参数随效果自带）。 */
export function blastRing(
  ctx: AbilityContext,
  x: number,
  y: number,
  radius: number,
  ring: BlastRing,
): void {
  const g = ctx.scene.add
    .circle(x, y, radius, ring.color, ring.fillAlpha)
    .setStrokeStyle(ring.lineWidth, ring.color, ring.lineAlpha)
    .setDepth(7)
    .setScale(0.3)
  ctx.scene.tweens.add({
    targets: g,
    scale: 1,
    alpha: 0,
    duration: ring.durMs,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  })
}

/** 一次命中的上下文：锚点类效果（blast）作用于 center；逐目标类效果（slow）
 * 作用于 targets（本次直接命中的敌对方真身）。exclude 供 blast 跳过主目标/已命中。 */
export interface HitContext {
  readonly center: { readonly x: number; readonly y: number }
  readonly baseDamage: number
  readonly targets?: readonly TargetInfo['ref'][]
  readonly exclude?: ReadonlySet<unknown>
}

/** 在一次命中上求值一串 onHit 效果：blast 打 center 圆内，slow 施加到 targets。 */
export function applyEffects(
  ctx: AbilityContext,
  effects: readonly Effect[] | undefined,
  hit: HitContext,
): void {
  if (!effects) return
  for (const e of effects) {
    if (e.kind === 'blast') {
      applyBlast(ctx, hit.center, Math.max(1, Math.round(hit.baseDamage * e.ratio)), e.radius, e.knockback, hit.exclude)
      if (e.ring) blastRing(ctx, hit.center.x, hit.center.y, e.radius, e.ring)
    } else if (e.kind === 'slow') {
      if (hit.targets) for (const ref of hit.targets) ctx.slowTarget(ref, e.factor, e.durationMs)
    }
  }
}
