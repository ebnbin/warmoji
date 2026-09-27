import battlefieldJson from '../assets/battlefield.json'
import { fromJson } from './json'
import type { MapId } from '../types/maps'
import type { BattleEffects, BattlefieldTuning, FieldPickupDef } from '../types/battlefield'

export const BATTLE_FX_IDENTITY: BattleEffects = { team: [], enemy: [] }

const BF = fromJson<BattlefieldTuning>(battlefieldJson)

export const POOLS: Record<MapId, readonly FieldPickupDef[]> = BF.pools

export const FIELD_PICKUPS: readonly FieldPickupDef[] = Object.values(POOLS).flat()

export const FIELD = BF.field
export const CARRIER_BUDGET = BF.carrierBudget
