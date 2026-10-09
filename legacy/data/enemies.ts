import enemiesJson from '../assets/enemies.json'
import rosterJson from '../assets/roster.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
import { fromJson } from './json'
import type { AiTuning, Difficulty, EnemyDef, EnemyKind } from '../types/enemies'

export const ENEMIES = fromJson<Record<EnemyKind, EnemyDef>>(enemiesJson)
const ROSTER = fromJson<{ readonly enemies: readonly EnemyKind[] }>(rosterJson)
/** 全部敌人，按地图的先后、各图里按登记的先后 */
export const ENEMY_LIST = ROSTER.enemies.map((k) => ENEMIES[k])
/** 小怪与头目，按地图的先后 */
export const ENEMY_DEFS = ENEMY_LIST.filter((e) => e.role !== 'boss')
export const BOSSES = ENEMY_LIST.filter((e) => e.role === 'boss')

const DIFF = fromJson<Difficulty>(difficultyJson)

export const CURVE = DIFF.curve
export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const TENACITY = DIFF.tenacity

export const AI = fromJson<AiTuning>(aiJson)
