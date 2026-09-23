import { INITIAL_CAPACITY } from './world'
import type { EnemyDef } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { Effect } from '../types/abilityDefs'

// 放不进类型化数组的富数据，按 eid 索引。spawn 时必须无条件写（eid 会复用）；跨局由 resetEntityStorage 整体清空；
// 一律 new Array(INITIAL_CAPACITY).fill 预分配，保持 packed；本文件只导出这类数组，扩容按导出项逐个补齐

/** px 化的 def */
export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

/** 抛射物命中效果链 */
export const projOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

/** 已命中的敌人 eid，贯穿去重 */
export const projHitEids: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

/** 在途回旋镖本程已命中的 eid */
export const flyerHits: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

/** 闪电折点，x,y 交替 */
export const boltPts: (Float32Array | undefined)[] = new Array<Float32Array | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 本次天体横扫已砸过的实体 */
export const meteorHit: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 战场限时层是哪一枚拾取 */
export const modDef: (FieldPickupDef | undefined)[] = new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 刷怪预告要落地的敌人 def */
export const telegraphDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 刷怪预告要落地的敌人携带的战场拾取(普通刷怪为 undefined) */
export const telegraphCarries: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 携带者排期到点要挂的那枚战场拾取 */
export const carrierPickup: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 敌人携带的战场拾取，死亡时掉落 */
export const enemyCarries: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

/** 拾取物载荷；金币无 */
export const pickupDef: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 拾取物到手音效 */
export const pickupSfx: (import('../types/sfx').SfxId | undefined)[] =
  new Array<import('../types/sfx').SfxId | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 能力的命中效果链；弹丸出膛时抄到 projOnHit */
export const abilityOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 能力生成物的 emoji */
export const abilityArtEmoji: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 能力出手音效 */
export const abilityFireSfx: (import('../types/sfx').SfxId | undefined)[] =
  new Array<import('../types/sfx').SfxId | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 敌弹的伤害来源名；我方弹按 Proj.srcSlot 分账 */
export const projSrcName: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 敌方地面区的伤害来源名 */
export const zoneSrcName: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)

/** undefined = 不参与部件动画 */
export const animId: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)
export const animOutline: (import('../emoji/svg').OutlineKind | undefined)[] =
  new Array<import('../emoji/svg').OutlineKind | undefined>(INITIAL_CAPACITY).fill(undefined)
