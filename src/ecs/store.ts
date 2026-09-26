import { INITIAL_CAPACITY } from './world'
import type { EnemyDef, EnemyKind } from '../types/enemies'
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

export const projSrcEnemy = slots<EnemyKind>()

export const poisonSrc = slots<Source>()

export const zoneEffects = slots<readonly Effect[]>()

export const zoneSrc = slots<Source>()

export const animId = slots<string>()
export const animOutline = slots<import('../emoji/svg').OutlineKind>()
