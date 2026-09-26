import { INITIAL_CAPACITY } from './world'
import type { BodyRules, EnemyDef, ResourceDef } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { AbilityDef, Cond, Effect } from '../types/abilityDefs'
import type { Source } from './utils/source'

const slots = <T>(): (T | undefined)[] => new Array<T | undefined>(INITIAL_CAPACITY).fill(undefined)

export const enemyDef = slots<EnemyDef>()

export const projOnHit = slots<readonly Effect[]>()

export const projHitUids = slots<Set<number>>()

export const flyerHits = slots<Set<number>>()

export const boltPts = slots<Float32Array>()

export const meteorHit = slots<Set<number>>()

export const modDef = slots<FieldPickupDef>()

export const telegraphDef = slots<EnemyDef>()

export const telegraphCarries = slots<FieldPickupDef>()

export const carrierPickup = slots<FieldPickupDef>()

export const enemyCarries = slots<FieldPickupDef>()

export const pickupDef = slots<FieldPickupDef>()

export const pickupSfx = slots<import('../types/sfx').SfxId>()

export const abilityOnHit = slots<readonly Effect[]>()

export const abilityOnSelf = slots<readonly Effect[]>()

export const abilityPulse = slots<readonly Effect[]>()

export const abilityArtEmoji = slots<string>()

export const abilityFireSfx = slots<import('../types/sfx').SfxId>()

/** 装置自己的那条能力 */
export const emplaceAbility = slots<AbilityDef>()

/** 弹体出膛时记下的来源：归因与倍率跟着弹体走 */
export const projSrc = slots<Source>()

export const poisonSrc = slots<Source>()

/** 每个身体每个标记槽位的来源：引信、存伤、叠层、死亡印记结算时用 */
export const markSrcs = slots<(Source | undefined)[]>()

/** 能力的附加定义：打死人时施于出手者、出手条件、资源强化、弹匣最后一发 */
export const abilityOnKill = slots<readonly Effect[]>()
export const abilityRequires = slots<Cond>()
export const abilityBoost = slots<{ readonly at: number; readonly spend: number; readonly damageMul?: number; readonly onHit?: readonly Effect[] }>()
export const ammoLast = slots<readonly Effect[]>()

/** 身体的资源定义 */
export const resDef = slots<ResourceDef>()

/** 身体自己的规则：敌人是它的定义，角色是出生时按道具拼出来的包，造物只有接触效果 */
export const bodyRules = slots<BodyRules>()

export const zoneEffects = slots<readonly Effect[]>()

/** 被摆布的身体落地、撞墙时的后续与来源 */
export const motionFx = slots<{ readonly src: Source; readonly onLand?: readonly Effect[]; readonly onWall?: readonly Effect[]; readonly base: number }>()

export const zoneSrc = slots<Source>()

export const animId = slots<string>()
export const animOutline = slots<import('../emoji/svg').OutlineKind>()
