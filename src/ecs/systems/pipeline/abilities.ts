import { clearFrameRegisters } from '../clearFrameRegisters'
import { updateAbilityGates } from '../updateAbilityGates'
import { tickCooldowns } from '../tickCooldowns'
import { castAreaBlasts } from '../castAreaBlasts'
import { castAssassinates } from '../castAssassinates'
import { castBoomerangs } from '../castBoomerangs'
import { castBuffs } from '../castBuffs'
import { castChainArcs } from '../castChainArcs'
import { castDances } from '../castDances'
import { castHeals } from '../castHeals'
import { castLasers } from '../castLasers'
import { castNukes } from '../castNukes'
import { castProjectiles } from '../castProjectiles'
import { castRallies } from '../castRallies'
import { castSlowAuras } from '../castSlowAuras'
import { castStrikes } from '../castStrikes'
import { castSummons } from '../castSummons'
import { castSweeps } from '../castSweeps'
import { castThrusts } from '../castThrusts'
import { castTimeStops } from '../castTimeStops'
import { castTurrets } from '../castTurrets'
import { fireRadials } from '../fireRadials'
import { placeAssassinBody } from '../placeAssassinBody'
import { placeIdleBoomerangs } from '../placeIdleBoomerangs'
import { placeLaserBody } from '../placeLaserBody'
import { placeProjectileBody } from '../placeProjectileBody'
import { placeSweepBody } from '../placeSweepBody'
import { placeThrustBody } from '../placeThrustBody'
import { tickCombos } from '../tickCombos'
import { tickEchoes } from '../tickEchoes'
import { tickStrikeStay } from '../tickStrikeStay'
import { updateBees } from '../updateBees'
import { updateDrops } from '../updateDrops'
import { updateEmplacements } from '../updateEmplacements'
import { updateFlyers } from '../updateFlyers'
import { castRequested } from '../shared/castScan'
import { runPipeline } from './step'
import type { Step } from './step'
import type { Sim } from '../../sim'

const ABILITY_PIPELINE: readonly Step[] = [
  clearFrameRegisters,
  updateAbilityGates,
  tickCooldowns,
  castRallies,
  castDances,
  castBuffs,
  castTimeStops,
  castNukes,
  castHeals,
  tickEchoes,
  castAreaBlasts,
  castChainArcs,
  placeThrustBody,
  tickCombos,
  castThrusts,
  placeSweepBody,
  castSweeps,
  updateDrops,
  castStrikes,
  placeAssassinBody,
  tickStrikeStay,
  castAssassinates,
  placeProjectileBody,
  castProjectiles,
  updateFlyers,
  placeIdleBoomerangs,
  castBoomerangs,
  placeLaserBody,
  fireRadials,
  castLasers,
  updateBees,
  castSummons,
  updateEmplacements,
  castTurrets,
  castSlowAuras,
]

export function stepAbilities(sim: Sim): void {
  runPipeline(ABILITY_PIPELINE, sim)
}

const MANUAL_CASTS = [castRallies, castDances, castBuffs, castTimeStops, castNukes, castStrikes]

export function castRequests(sim: Sim): void {
  for (const cast of MANUAL_CASTS) cast(sim, castRequested)
}
