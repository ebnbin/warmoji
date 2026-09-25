import { armEnemies } from '../armEnemies'
import { capCoins } from '../capCoins'
import { fireCarriers } from '../fireCarriers'
import { fireSurges } from '../fireSurges'
import { grantCoins } from '../grantCoins'
import { grantFlash } from '../grantFlash'
import { grantMods } from '../grantMods'
import { playPickupFx } from '../playPickupFx'
import { reapCollected } from '../reapCollected'
import { refreshCharacterTargets } from '../refreshCharacterTargets'
import { runDeathEffects } from '../runDeathEffects'
import { spawnStep } from '../spawnStep'
import { updateAnims } from '../updateAnims'
import { updatePickups } from '../updatePickups'
import { updateSpawners } from '../updateSpawners'
import { updateZones } from '../updateZones'
import { castRequests, stepAbilities } from './abilities'
import { runPipeline } from './step'
import { stepSim } from '../../sim'
import type { Step } from './step'
import type { Sim } from '../../sim'

const FRAME_PIPELINE: readonly Step[] = [
  castRequests,
  stepSim,
  refreshCharacterTargets,
  armEnemies,
  stepAbilities,
  updateAnims,
  runDeathEffects,
  updateZones,
  updatePickups,
  grantCoins,
  grantMods,
  grantFlash,
  playPickupFx,
  reapCollected,
  capCoins,
  updateSpawners,
  fireSurges,
  fireCarriers,
  spawnStep,
]

export function stepFrame(sim: Sim): void {
  runPipeline(FRAME_PIPELINE, sim)
}
