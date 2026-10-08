import enemiesJson from '../assets/enemies.json'
import rosterJson from '../assets/roster.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
import { fromJson } from './json'
import type { AiTuning, Difficulty, EnemyDef, EnemyKind } from '../types/enemies'

export const ENEMIES = fromJson<Record<EnemyKind, EnemyDef>>(enemiesJson)
const ROSTER = fromJson<{ readonly enemies: readonly EnemyKind[]; readonly legacyEnemies: readonly EnemyKind[] }>(rosterJson)
/** 新敌人，按地图的先后、各图里按登记的先后 */
export const NEW_ENEMIES = ROSTER.enemies.map((k) => ENEMIES[k])
/** 旧敌人，按原来的先后 */
export const LEGACY_ENEMIES = ROSTER.legacyEnemies.map((k) => ENEMIES[k])
/** 新敌人里的小怪与头目，按地图的先后 */
export const ENEMY_DEFS = NEW_ENEMIES.filter((e) => e.role !== 'boss')
export const BOSSES = NEW_ENEMIES.filter((e) => e.role === 'boss')
/** 旧敌人：只给旧关卡与图鉴的旧敌人页用 */
export const LEGACY_ENEMY_DEFS = LEGACY_ENEMIES.filter((e) => e.role !== 'boss')
export const LEGACY_BOSSES = LEGACY_ENEMIES.filter((e) => e.role === 'boss')

const DIFF = fromJson<Difficulty>(difficultyJson)

export const CURVE = DIFF.curve
export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const TENACITY = DIFF.tenacity

export const AI = fromJson<AiTuning>(aiJson)
