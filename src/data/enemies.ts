import enemiesJson from '../assets/enemies.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
import type { Effect } from '../types/abilityDefs'
import type { AiTuning, Difficulty, EnemyDef } from '../types/enemies'

// ── 死亡效果（亡语）─────────────────────────────────────────
// 亡语 = 死亡触发的一串效果，与命中触发 onHit 复用同一套组合式 Effect
//（留毒 = ground、治疗 = heal、冷枪 = spawnProjectile），经敌方 ctx 求值
//（deathEffects.ts）。生成实体类（分裂/诱饵）需引 EnemyDef，为避免与 abilities
// 循环依赖留在本模块，与 Effect 并入同一 onDeath 联合。

/** 缺省接触效果：一发接触伤害（未显式配 onContact 的敌人都用它，共享一份不重复分配） */
export const DEFAULT_CONTACT: readonly Effect[] = [{ kind: 'damage' }]

// 数据行在 defs/enemies.ts（创作层），npm run gen 生成 enemies.json；
// split.into 已内联为自包含数据。构建期已校验，此处一次断言收口。
// Boss 就是 role:'boss' 的普通条目：ENEMIES 全量按 kind 反查、ENEMY_DEFS 只含常规怪、BOSSES 只含 Boss
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
