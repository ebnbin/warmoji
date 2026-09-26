import { INITIAL_CAPACITY } from './world'
import type { BodyRules, EnemyDef } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { AbilityDef, Effect } from '../types/abilityDefs'
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

/** 身体自己的规则：敌人是它的定义，角色是出生时按道具拼出来的包，造物只有接触效果 */
export const bodyRules = slots<BodyRules>()

export const zoneEffects = slots<readonly Effect[]>()

export const zoneSrc = slots<Source>()

export const animId = slots<string>()
export const animOutline = slots<import('../emoji/svg').OutlineKind>()
