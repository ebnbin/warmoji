import { armEnemies } from '../armEnemies'
import { capCoins } from '../capCoins'
import { fireCarriers } from '../fireCarriers'
import { fireSurges } from '../fireSurges'
import { grantCoins } from '../grantCoins'
import { grantFlash } from '../grantFlash'
import { grantMods } from '../grantMods'
import { playPickupFx } from '../playPickupFx'
import { reapCollected } from '../reapCollected'
import { refreshTargets } from '../refreshTargets'
import { runDeathEffects } from '../runDeathEffects'
import { spawnStep } from '../spawnStep'
import { updateAnims } from '../updateAnims'
import { updatePickups } from '../updatePickups'
import { updateSpawners } from '../updateSpawners'
import { updateZones } from '../updateZones'
import { castRequests, stepAbilities } from './abilities'
import { stepSim } from '../../sim'
import type { Sim } from '../../sim'
import { pipeline, runPipeline } from './step'

const FRAME_PIPELINE = pipeline([
  refreshTargets,
  { run: castRequests, after: [refreshTargets] },
  { run: stepSim, after: [castRequests] },
  armEnemies,
  { run: stepAbilities, after: [stepSim, armEnemies] },
  updateAnims,
  runDeathEffects,
  updateZones,
  updatePickups,
  { run: grantCoins, after: [updatePickups] },
  { run: grantMods, after: [updatePickups] },
  { run: grantFlash, after: [updatePickups] },
  { run: playPickupFx, after: [updatePickups] },
  { run: reapCollected, after: [grantCoins, grantMods, grantFlash, playPickupFx] },
  { run: capCoins, after: [reapCollected] },
  updateSpawners,
  fireSurges,
  fireCarriers,
  { run: spawnStep, after: [fireSurges, fireCarriers] },
])

export function stepFrame(sim: Sim): void {
  runPipeline(FRAME_PIPELINE, sim)
}
