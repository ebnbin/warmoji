import { MAX_ENTITIES } from './world'
import type { EnemyDef } from '../enemies/registry'
import type { FieldPickupDef } from '../battlefield/registry'
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

// ── 敌人能力(按 eid 索引;P3e)──
/** 敌人持械能力运行时(projectile/strike/heal;每帧驱动,死亡时销毁) */
export const enemyAbilities: (AbilityRuntime[] | undefined)[] = new Array<AbilityRuntime[] | undefined>(MAX_ENTITIES)
/** 敌人能力持有者句柄(读实时位置) */
export const enemyOwner: (AbilityOwner | undefined)[] = new Array<AbilityOwner | undefined>(MAX_ENTITIES)

/** 队员的稳定目标引用(按 eid;敌方能力索敌/追踪用) */
export const memberRef: (object | undefined)[] = new Array<object | undefined>(MAX_ENTITIES)

/** 敌人本帧移动朝向(steerEnemies 写;敌方 aim:'move' 弹的 ownerHeading 读) */
export const enemyVelX = new Float32Array(MAX_ENTITIES)
export const enemyVelY = new Float32Array(MAX_ENTITIES)

/** 敌人首发延迟(spawn 时抽取 900+rng*1500;lazy-arm 喂入 createAbility) */
export const enemyFireDelayMs = new Float32Array(MAX_ENTITIES)

/** 敌人摇摆随机相位(spawn 时抽取;行走动画的环境摇摆错相) */
export const enemyPhase = new Float32Array(MAX_ENTITIES)

/** 护巢子敌的巢 eid(baseOrbit 绕巢锚点 + 计入本巢在场上限;拆巢时清空触发暴走),0=无巢 */
export const enemyNest = new Int32Array(MAX_ENTITIES).fill(-1)

/** 虫巢下次生成时刻(0=非 spawner) */
export const enemyNextSpawnAt = new Float32Array(MAX_ENTITIES)

/** 敌人携带的战场拾取(携带者:死亡即在原地掉这枚拾取) */
export const enemyCarries: (FieldPickupDef | undefined)[] = new Array<FieldPickupDef | undefined>(MAX_ENTITIES)

/** 偷币鼠已吞金币数(死亡时吐回 + 利息) */
export const thiefEaten = new Int32Array(MAX_ENTITIES)
/** 偷币鼠下次可吞金币时刻(逐枚偷,不一帧扫光) */
export const thiefNextEatAt = new Float32Array(MAX_ENTITIES)

/** 敌弹的伤害来源名(结算页敌情明细按敌人名归属) */
export const eprojSrcName: (string | undefined)[] = []

/** 部件动画的 emoji 与描边(帧惰性解析用;undefined = 该实体不参与动画) */
export const animId: (string | undefined)[] = []
export const animOutline: (import('../emoji/svg').OutlineKind | undefined)[] = []
