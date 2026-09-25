import battlefieldJson from '../assets/battlefield.json'
import { fromJson } from './json'
import type { MapId } from '../types/maps'
import type { BattleEffects, BattlefieldTuning, FieldPickupDef, Polarity } from '../types/battlefield'

export const BATTLE_FX_IDENTITY: BattleEffects = {
  moveSpeedMul: 1,
  teamDamageMul: 1,
  teamCooldownMul: 1,
  critAdd: 0,
  enemySlowMul: 1,
}

const BF = fromJson<BattlefieldTuning>(battlefieldJson)

export const POOLS: Record<MapId, readonly FieldPickupDef[]> = BF.pools

export const FIELD_PICKUPS: readonly FieldPickupDef[] = Object.values(POOLS).flat()

export const FIELD = BF.field
export const CARRIER_BUDGET = BF.carrierBudget

export const POLARITY_COLOR: Record<Polarity, number> = {
  buff: 0x66bb6a,
  debuff: 0xef5350,
}
