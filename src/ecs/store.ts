import { INITIAL_CAPACITY } from './world'
import type { EnemyDef, EnemyKind } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { Effect } from '../types/abilityDefs'

export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

export const projOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

export const projHitUids: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

export const flyerHits: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

export const boltPts: (Float32Array | undefined)[] = new Array<Float32Array | undefined>(INITIAL_CAPACITY).fill(undefined)

export const meteorHit: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(INITIAL_CAPACITY).fill(undefined)

export const modDef: (FieldPickupDef | undefined)[] = new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

export const telegraphDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(INITIAL_CAPACITY).fill(undefined)

export const telegraphCarries: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

export const carrierPickup: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

export const enemyCarries: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined).fill(undefined)

export const pickupDef: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(INITIAL_CAPACITY).fill(undefined)

export const pickupSfx: (import('../types/sfx').SfxId | undefined)[] =
  new Array<import('../types/sfx').SfxId | undefined>(INITIAL_CAPACITY).fill(undefined)

export const abilityOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(INITIAL_CAPACITY).fill(undefined)

export const abilityArtEmoji: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)

export const abilityFireSfx: (import('../types/sfx').SfxId | undefined)[] =
  new Array<import('../types/sfx').SfxId | undefined>(INITIAL_CAPACITY).fill(undefined)

export const projSrcEnemy: (EnemyKind | undefined)[] = new Array<EnemyKind | undefined>(INITIAL_CAPACITY).fill(undefined)

export const zoneEffects: (readonly Effect[] | undefined)[] = new Array<readonly Effect[] | undefined>(INITIAL_CAPACITY).fill(undefined)

export const zoneSrc: (import('./utils/source').Source | undefined)[] = new Array<import('./utils/source').Source | undefined>(INITIAL_CAPACITY).fill(undefined)

export const poisonSrc: (import('./utils/source').Source | undefined)[] = new Array<import('./utils/source').Source | undefined>(INITIAL_CAPACITY).fill(undefined)

export const animId: (string | undefined)[] = new Array<string | undefined>(INITIAL_CAPACITY).fill(undefined)
export const animOutline: (import('../emoji/svg').OutlineKind | undefined)[] =
  new Array<import('../emoji/svg').OutlineKind | undefined>(INITIAL_CAPACITY).fill(undefined)
