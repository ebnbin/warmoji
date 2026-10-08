import { armEnemies } from '../armEnemies'
import { capCoins } from '../capCoins'
import { fireCalls } from '../fireCalls'
import { fireOrders } from '../fireOrders'
import { grantCoins } from '../grantCoins'
import { grantFlash } from '../grantFlash'
import { grantMods } from '../grantMods'
import { playPickupFx } from '../playPickupFx'
import { reapCollected } from '../reapCollected'
import { refreshTargets } from '../refreshTargets'
import { runDeathEffects } from '../runDeathEffects'
import { spawnStep } from '../spawnStep'
import { tickHold } from '../tickHold'
import { tickLeaks } from '../tickLeaks'
import { tickRelay } from '../tickRelay'
import { tickRescue } from '../tickRescue'
import { tickVisits } from '../tickVisits'
import { fireCues } from '../fireCues'
import { fireTriggers } from '../fireTriggers'
import { updateAnims } from '../updateAnims'
import { updatePickups } from '../updatePickups'
import { updateSpawners } from '../updateSpawners'
import { updateZones } from '../updateZones'
import { castRequests, stepAbilities } from './abilities'
import { stepSim, worldTimeScale } from '../../sim'
import type { Sim } from '../../sim'
import { timeLeftMs } from '../../fight/state'
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
  { run: fireCues, after: [stepSim] },
  { run: fireTriggers, after: [stepSim] },
  { run: fireCalls, after: [fireTriggers] },
  { run: fireOrders, after: [fireCalls] },
  { run: spawnStep, after: [fireOrders] },
  { run: tickHold, after: [stepSim] },
  { run: tickVisits, after: [stepSim] },
  { run: tickLeaks, after: [stepSim] },
  { run: tickRelay, after: [stepSim] },
  { run: tickRescue, after: [stepSim] },
])

/** 一步的时长：模拟只按它走，画面快慢不同也走出同一场战斗 */
export const TICK_MS = 1000 / 60

/** 走一步：世界时间按时停缩放，打到时限的那一步只走剩下的；返回这一步是不是打到了时限 */
export function stepFrame(sim: Sim): boolean {
  sim.dtMs = TICK_MS
  sim.wdtMs = TICK_MS * worldTimeScale(sim)
  const leftMs = timeLeftMs(sim)
  const last = sim.wdtMs >= leftMs
  if (last) sim.wdtMs = leftMs
  runPipeline(FRAME_PIPELINE, sim)
  sim.tick++
  return last
}
