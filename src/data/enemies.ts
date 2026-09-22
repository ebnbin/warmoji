import enemiesJson from '../assets/enemies.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
import type { Effect } from '../types/abilityDefs'
import type { AiTuning, Difficulty, EnemyDef } from '../types/enemies'

export const DEFAULT_CONTACT: readonly Effect[] = [{ kind: 'damage' }]

export const ENEMIES = enemiesJson.enemies as unknown as Record<string, EnemyDef>
const ALL_ENEMIES = Object.values(ENEMIES)
export const ENEMY_DEFS = ALL_ENEMIES.filter((e) => e.role !== 'boss')
export const BOSSES = ALL_ENEMIES.filter((e) => e.role === 'boss')

const DIFF = difficultyJson as unknown as Difficulty

export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const BOSS_SPAWN_RELIEF = DIFF.bossSpawnRelief

const AITUNE = aiJson as unknown as AiTuning
export const AI = AITUNE
