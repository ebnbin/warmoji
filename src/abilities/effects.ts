import { circleHitIndices } from './defs'
import type { BlastRing, Effect } from './defs'
import type { AbilityContext } from './types'

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

/** 在锚点求值一串 onHit 效果。center = 效果锚点（投送方定义：突刺终点/斩击
 * 目标/末跳落点…）；baseDamage = 本次命中的伤害基准；exclude 跳过的目标。 */
export function applyEffects(
  ctx: AbilityContext,
  effects: readonly Effect[] | undefined,
  center: { readonly x: number; readonly y: number },
  baseDamage: number,
  exclude?: ReadonlySet<unknown>,
): void {
  if (!effects) return
  for (const e of effects) {
    if (e.kind === 'blast') {
      applyBlast(ctx, center, Math.max(1, Math.round(baseDamage * e.ratio)), e.radius, e.knockback, exclude)
      if (e.ring) blastRing(ctx, center.x, center.y, e.radius, e.ring)
    }
  }
}
