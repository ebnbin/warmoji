import { ENEMIES as ENEMY_TABLE } from '../../defs/enemies'
import { DIFFICULTY } from '../../defs/difficulty'
import { AI as AI_TUNING } from '../../defs/ai'
import type { AiTuning, Difficulty, EnemyDef, EnemyKind } from '../types/enemies'

export const ENEMIES: Record<EnemyKind, EnemyDef> = ENEMY_TABLE
const ALL_ENEMIES = Object.values(ENEMIES)
export const ENEMY_DEFS = ALL_ENEMIES.filter((e) => e.role !== 'boss')
export const BOSSES = ALL_ENEMIES.filter((e) => e.role === 'boss')

const DIFF: Difficulty = DIFFICULTY

export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const BOSS_SPAWN_RELIEF = DIFF.bossSpawnRelief

export const AI: AiTuning = AI_TUNING
