import { ENEMIES } from '../../data/enemies'
import type { EnemyDef, EnemyMixEntry, EnemyMixRow } from '../../types/enemies'

// 刷怪配比：某一波出什么、按什么权重抽。纯函数，只读内容表——
// 建敌人实体（entities/enemy.ts）之前先问这里「这一发该是哪一种」。

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
