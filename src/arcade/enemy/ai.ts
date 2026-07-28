import { ENEMIES } from '../../data/enemies'
import type { EnemyDef, EnemyMixEntry, EnemyMixRow } from '../../types/enemies'
import type { Rng } from '../../util/rng'
import { dist2 } from '../../util/vec'
import type { Point } from '../../util/vec'

// 敌人投放与行为的战斗规则：这一波出什么、按权重抽哪一只、刷在哪、逃跑往哪转。
// 旧框架侧的一份；ECS 侧另有等价实现（ecs/utils/spawnMix + systems/shared/steer），
// 两份有意重复——两套架构各自成包、互不引用，删掉任一侧都是删一个目录。

/** 某一波的出场配比（已按 sinceWave 过滤、权重夹在上下限之间） */
export function enemyMixAt(mix: readonly EnemyMixRow[], wave: number): EnemyMixEntry[] {
  return mix.filter((m) => wave >= m.sinceWave).map((m) => ({
    def: ENEMIES[m.kind]!,
    weight: Math.min(m.max, Math.max(m.min, m.base + m.perWave * (wave - m.sinceWave))),
  }))
}
/** 按权重随机抽一种敌人 */
export function pickEnemy(mix: readonly EnemyMixEntry[], rand: () => number): EnemyDef {
  const total = mix.reduce((s, m) => s + m.weight, 0)
  let roll = rand() * total
  for (const m of mix) {
    roll -= m.weight
    if (roll < 0) return m.def
  }
  return mix[mix.length - 1]!.def
}
/** 逃离转向：贴近地图边缘时叠加向内分量，沿墙滑行绕开而不是顶着边界冲 */
export function fleeSteer(
  x: number,
  y: number,
  awayX: number,
  awayY: number,
  mapW: number,
  mapH: number,
  margin: number,
): { x: number; y: number } {
  let fx = awayX
  let fy = awayY
  if (x < margin) fx += ((margin - x) / margin) * 2
  if (x > mapW - margin) fx -= ((x - (mapW - margin)) / margin) * 2
  if (y < margin) fy += ((margin - y) / margin) * 2
  if (y > mapH - margin) fy -= ((y - (mapH - margin)) / margin) * 2
  const len = Math.hypot(fx, fy)
  if (len < 1e-6) {
    // 完全抵消（顶死在边上）时沿切线走
    const t = Math.hypot(awayX, awayY) || 1
    return { x: -awayY / t, y: awayX / t }
  }
  return { x: fx / len, y: fy / len }
}

/**
 * 地图内随机刷怪点：距边缘 ≥ inset，距 avoid（玩家）≥ minDist；
 * 拒绝采样最多 20 次，全拒则返回最后一次（minDist 过大时的兜底）。
 */
export function randomMapPoint(
  rng: Rng,
  width: number,
  height: number,
  inset: number,
  avoid: Point,
  minDist: number,
): Point {
  const xMin = Math.round(inset)
  const xMax = Math.round(width - inset)
  const yMin = Math.round(inset)
  const yMax = Math.round(height - inset)
  let p: Point = { x: xMin, y: yMin }
  for (let i = 0; i < 20; i++) {
    p = { x: rng.int(xMin, xMax), y: rng.int(yMin, yMax) }
    if (dist2(p, avoid) >= minDist * minDist) return p
  }
  return p
}
