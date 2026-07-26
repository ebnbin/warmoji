import { ENEMIES } from '../data/enemies'
import type { EnemyDef, EnemyMixEntry, EnemyMixRow } from '../types/enemies'

// 敌人投放与行为的战斗规则：波次混编取样、按权重抽取、逃跑转向。
// 只被两套战斗实现消费，故归战斗共享层而非内容层。

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
