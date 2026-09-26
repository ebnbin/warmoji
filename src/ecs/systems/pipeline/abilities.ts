import { clearFrameRegisters } from '../clearFrameRegisters'
import { updateAbilityGates } from '../updateAbilityGates'
import { tickCooldowns } from '../tickCooldowns'
import { tickRepeats } from '../tickRepeats'
import { placeHeld } from '../placeHeld'
import { castAbilities } from '../castAbilities'
import { tickBlinks } from '../tickBlinks'
import { updateBees } from '../updateBees'
import { updateDrops } from '../updateDrops'
import { updateEmplacements } from '../updateEmplacements'
import { updateFlyers } from '../updateFlyers'
import type { Sim } from '../../sim'
import { pipeline, runPipeline } from './step'

export { castRequests } from '../castAbilities'

// 先推进手头在做的事（延迟重复、坠物、飞返体、蜜蜂），再让冷却到了的能力出手
const ABILITY_PIPELINE = pipeline([
  clearFrameRegisters,
  updateAbilityGates,
  { run: tickCooldowns, after: [updateAbilityGates] },
  { run: tickRepeats, after: [tickCooldowns] },
  { run: updateDrops, after: [tickCooldowns] },
  { run: updateFlyers, after: [tickCooldowns] },
  { run: updateBees, after: [tickCooldowns] },
  { run: tickBlinks, after: [tickCooldowns] },
  { run: castAbilities, after: [tickRepeats, updateDrops, updateFlyers, updateBees, tickBlinks] },
  { run: updateEmplacements, after: [castAbilities] },
  { run: placeHeld, after: [castAbilities] },
])

export function stepAbilities(sim: Sim): void {
  runPipeline(ABILITY_PIPELINE, sim)
}
