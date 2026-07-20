import { circleHitIndices } from './defs'
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
