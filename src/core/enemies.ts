import { BLOB, BOAR, ENEMY_MIX, GHOST, INVADER, MUSHROOM, RAT, SNAKE, ZOMBIE } from './config'
import type { EnemySpec } from './config'

const BY_KIND: Record<(typeof ENEMY_MIX)[number]['kind'], EnemySpec> = {
  zombie: ZOMBIE,
  ghost: GHOST,
  invader: INVADER,
  boar: BOAR,
  snake: SNAKE,
  mushroom: MUSHROOM,
  rat: RAT,
  blob: BLOB,
}

export interface EnemyMixEntry {
  spec: EnemySpec
  weight: number
}

/** 某一波的出场配比（已按 sinceWave 过滤、权重夹在上下限之间） */
export function enemyMixAt(wave: number): EnemyMixEntry[] {
  return ENEMY_MIX.filter((m) => wave >= m.sinceWave).map((m) => ({
    spec: BY_KIND[m.kind],
    weight: Math.min(m.max, Math.max(m.min, m.base + m.perWave * (wave - m.sinceWave))),
  }))
}

/** 按权重随机抽一种敌人 */
export function pickEnemy(mix: readonly EnemyMixEntry[], rand: () => number): EnemySpec {
  const total = mix.reduce((s, m) => s + m.weight, 0)
  let roll = rand() * total
  for (const m of mix) {
    roll -= m.weight
    if (roll < 0) return m.spec
  }
  return mix[mix.length - 1]!.spec
}
