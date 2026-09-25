import enemiesJson from '../assets/enemies.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
import { fromJson } from './json'
import type { AiTuning, Difficulty, EnemyDef, EnemyKind } from '../types/enemies'

export const ENEMIES = fromJson<Record<EnemyKind, EnemyDef>>(enemiesJson)
const ALL_ENEMIES = Object.values(ENEMIES)
export const ENEMY_DEFS = ALL_ENEMIES.filter((e) => e.role !== 'boss')
export const BOSSES = ALL_ENEMIES.filter((e) => e.role === 'boss')

const DIFF = fromJson<Difficulty>(difficultyJson)

export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const BOSS_SPAWN_RELIEF = DIFF.bossSpawnRelief

export const AI = fromJson<AiTuning>(aiJson)
