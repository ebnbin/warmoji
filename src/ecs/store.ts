import { MAX_ENTITIES } from './world'
import type { EnemyDef } from '../data/enemies'
import type { FieldPickupDef } from '../data/battlefield'
import type { Effect } from '../data/abilityDefs'

// 富数据伴随存储(按 eid 索引):bitECS 组件只存数值,def 引用等复杂对象放这里。
// spawn 时写、removeEntity 前不必清(下次 spawn 覆盖;eid 复用后新 def 覆盖旧)。
// 跨局(scene.restart)必须整体清空:eid 从头再分配,上一局的引用会挂在新实体身上。

/** 敌人的 px 化 def(emoji/尺寸/速度/locomotion/abilities/死亡效果…) */
export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(MAX_ENTITIES)

/** 抛射物命中效果链 */
export const projOnHit: (readonly Effect[] | undefined)[] = new Array<readonly Effect[] | undefined>(MAX_ENTITIES)

/** 抛射物已命中的敌人 eid(贯穿去重) */
export const projHitEids: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(MAX_ENTITIES)

/** 在途回旋镖本程已命中的 eid(去程/回程各判一次,同程内每敌最多一次) */
export const flyerHits: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(MAX_ENTITIES)

/** 该敌人是否已装配过能力(eid 复用后由 spawnEnemy 清零,新实体重新装配) */
export const enemyArmed = new Uint8Array(MAX_ENTITIES)

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

/** 跨局清场:模块级伴随存储整体清空(eid 从 0 重新分配,旧局引用不能留给新实体)。
 * 场景 create 时与 clearGroundEffectsEcs/clearFieldEcs 一并调用 */
export function clearEcsStore(): void {
  enemyDef.fill(undefined)
  projOnHit.fill(undefined)
  projHitEids.fill(undefined)
  flyerHits.fill(undefined)
  enemyCarries.fill(undefined)
  enemyArmed.fill(0)
  animId.length = 0
  animOutline.length = 0
  eprojSrcName.length = 0
}
