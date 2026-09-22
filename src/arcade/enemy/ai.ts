import { ENEMIES } from '../../data/enemies'
import type { EnemyDef, EnemyMixEntry, EnemyMixRow } from '../../types/enemies'
import type { Rng } from '../../util/rng'
import { dist2 } from '../../util/vec'
import type { Point } from '../../util/vec'

/** 已按 sinceWave 过滤，权重夹在上下限之间 */
export function enemyMixAt(mix: readonly EnemyMixRow[], wave: number): EnemyMixEntry[] {
  return mix.filter((m) => wave >= m.sinceWave).map((m) => ({
    def: ENEMIES[m.kind]!,
    weight: Math.min(m.max, Math.max(m.min, m.base + m.perWave * (wave - m.sinceWave))),
  }))
}
export function pickEnemy(mix: readonly EnemyMixEntry[], rand: () => number): EnemyDef {
  const total = mix.reduce((s, m) => s + m.weight, 0)
  let roll = rand() * total
  for (const m of mix) {
    roll -= m.weight
    if (roll < 0) return m.def
  }
  return mix[mix.length - 1]!.def
}
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
    const t = Math.hypot(awayX, awayY) || 1
    return { x: -awayY / t, y: awayX / t }
  }
  return { x: fx / len, y: fy / len }
}

/** 距边缘 ≥ inset，距 avoid ≥ minDist；拒绝采样最多 20 次，全拒则返回最后一次 */
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
