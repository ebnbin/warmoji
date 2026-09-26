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
import { castRushes } from '../castRushes'
import { castLeaps } from '../castLeaps'
import { castTaunts } from '../castTaunts'
import { castStealths } from '../castStealths'
import { castFields } from '../castFields'
import { castDeploys } from '../castDeploys'
import { castNovas } from '../castNovas'
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
import type { Sim } from '../../sim'
import { pipeline, runPipeline } from './step'
import type { Step } from './step'

const afterCooldown = (steps: readonly Step[]): Step[] =>
  steps.map((s) => (typeof s === 'function' ? { run: s, after: [tickCooldowns] } : { run: s.run, after: [tickCooldowns, ...s.after] }))

const ABILITY_PIPELINE = pipeline([
  clearFrameRegisters,
  updateAbilityGates,
  { run: tickCooldowns, after: [updateAbilityGates] },
  ...afterCooldown([
    castRallies,
    castDances,
    castBuffs,
    castTimeStops,
    castNukes,
    castHeals,
    tickEchoes,
    { run: castAreaBlasts, after: [tickEchoes] },
    castChainArcs,
    placeThrustBody,
    tickCombos,
    { run: castThrusts, after: [placeThrustBody, tickCombos] },
    placeSweepBody,
    { run: castSweeps, after: [placeSweepBody] },
    updateDrops,
    { run: castStrikes, after: [updateDrops] },
    placeAssassinBody,
    tickStrikeStay,
    { run: castAssassinates, after: [placeAssassinBody, tickStrikeStay] },
    placeProjectileBody,
    { run: castProjectiles, after: [placeProjectileBody] },
    updateFlyers,
    { run: placeIdleBoomerangs, after: [updateFlyers] },
    { run: castBoomerangs, after: [updateFlyers, placeIdleBoomerangs] },
    placeLaserBody,
    fireRadials,
    { run: castLasers, after: [placeLaserBody, fireRadials] },
    updateBees,
    { run: castSummons, after: [updateBees] },
    updateEmplacements,
    { run: castTurrets, after: [updateEmplacements, castProjectiles] },
    castSlowAuras,
  ]),
])

export function stepAbilities(sim: Sim): void {
  runPipeline(ABILITY_PIPELINE, sim)
}

const MANUAL_CASTS = [
  castRallies,
  castDances,
  castBuffs,
  castTimeStops,
  castNukes,
  castStrikes,
  castRushes,
  castLeaps,
  castTaunts,
  castStealths,
  castFields,
  castDeploys,
  castNovas,
]

export function castRequests(sim: Sim): void {
  for (const cast of MANUAL_CASTS) cast(sim, castRequested)
}
