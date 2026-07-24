import { MAX_ENTITIES } from './world'
import type { EnemyDef } from '../enemies/registry'
import type { Effect } from '../abilities/defs'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'

// 富数据伴随存储(按 eid 索引):bitECS 组件只存数值,def 引用等复杂对象放这里。
// spawn 时写、removeEntity 前不必清(下次 spawn 覆盖;eid 复用后新 def 覆盖旧)。

/** 敌人的 px 化 def(emoji/尺寸/速度/locomotion/abilities/死亡效果…) */
export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(MAX_ENTITIES)

/** 抛射物命中效果链 */
export const projOnHit: (readonly Effect[] | undefined)[] = new Array<readonly Effect[] | undefined>(MAX_ENTITIES)

/** 抛射物已命中的敌人 eid(贯穿去重) */
export const projHitEids: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(MAX_ENTITIES)

// ── 队员能力(按槽位索引)──
/** 每槽位的能力运行时实例 */
export const memberAbilities: AbilityRuntime[][] = []
/** 每槽位的能力持有者句柄 */
export const memberHandle: (AbilityOwner | undefined)[] = []

/** 敌人的稳定目标引用(按 eid;能力跨帧追踪 ref 用),killEnemy 时置空 */
export const enemyRef: (object | undefined)[] = new Array<object | undefined>(MAX_ENTITIES)
