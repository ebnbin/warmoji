import { ENEMIES } from '../../data/enemies'
import type { EnemyDef, EnemyMixEntry, EnemyMixRow } from '../../types/enemies'

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
