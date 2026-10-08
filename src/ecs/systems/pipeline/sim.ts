import { expireFx } from '../expireFx'
import { faceCharacters } from '../faceCharacters'
import { landCharacters } from '../landCharacters'
import { despawnExpired } from '../despawnExpired'
import { layoutTeam } from '../layoutTeam'
import { touchBodies } from '../touchBodies'
import { driveTeam } from '../driveTeam'
import { moveBodies } from '../moveBodies'
import { tickStamina } from '../tickStamina'
import { stepHandover } from '../shared/leader'
import { tickSkillCooldowns } from '../tickSkillCooldowns'
import { settleMotions } from '../settleMotions'
import { refoldBattleFx } from '../refoldBattleFx'
import { reviveCharacters } from '../reviveCharacters'
import { steerBodies } from '../steerBodies'
import { updateBees } from '../updateBees'
import { updateControl } from '../updateControl'
import { tickStats } from '../tickStats'
import { tickRegen } from '../tickRegen'
import { tickMarks } from '../tickMarks'
import { tickResources } from '../tickResources'
import { tickForms } from '../tickForms'
import { tickIdle } from '../tickIdle'
import { tickTenacity } from '../tickTenacity'
import { tickGrowUp } from '../tickGrowUp'
import { tickPets } from '../tickPets'
import { tickBorrowed } from '../shared/steal'
import { tickGuts } from '../shared/gut'
import { tickShadows } from '../../entities/shadow'
import { recordTraces } from '../shared/trace'
import { tickBarriers } from '../../entities/barrier'
import { tickTethers } from '../../entities/tether'
import { cullProjectiles } from '../cullProjectiles'
import { hitProjectiles } from '../hitProjectiles'
import { refreshTargets } from '../refreshTargets'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import { pipeline } from './step'

// 先走标记的时钟，再汇总每个身体的属性表与门控，再由驱动写期望速度，积分只在 moveBodies 一处；时标是身体的属性（Clock）
export const SIM_PIPELINE = pipeline([
  refoldBattleFx,
  tickSkillCooldowns,
  stepHandover,
  { run: reviveCharacters, after: [stepHandover] },
  tickMarks,
  { run: tickResources, after: [tickMarks] },
  { run: tickForms, after: [tickMarks] },
  { run: tickBorrowed, after: [tickMarks] },
  { run: tickGuts, after: [tickMarks] },
  { run: tickShadows, after: [tickMarks] },
  { run: tickGrowUp, after: [tickMarks] },
  { run: tickIdle, after: [tickMarks] },
  { run: tickTenacity, after: [tickMarks] },
  { run: tickBarriers, after: [tickMarks] },
  { run: tickStats, after: [refoldBattleFx, tickMarks, tickForms] },
  { run: tickRegen, after: [tickStats] },
  { run: updateControl, after: [tickStats, tickMarks, tickTenacity] },
  { run: driveTeam, after: [stepHandover, reviveCharacters, updateControl] },
  { run: layoutTeam, after: [driveTeam] },
  despawnExpired,
  updateBees,
  { run: steerBodies, after: [updateControl, updateBees] },
  { run: moveBodies, after: [layoutTeam, steerBodies] },
  { run: tickStamina, after: [moveBodies] },
  { run: refreshTargets, after: [moveBodies] },
  { run: recordTraces, after: [moveBodies] },
  { run: tickPets, after: [moveBodies] },
  { run: tickTethers, after: [refreshTargets] },
  { run: settleMotions, after: [refreshTargets] },
  { run: landCharacters, after: [moveBodies] },
  { run: faceCharacters, after: [moveBodies] },
  { run: moveProjectiles, after: [moveBodies] },
  { run: hitProjectiles, after: [moveProjectiles, refreshTargets] },
  { run: touchBodies, after: [refreshTargets, settleMotions] },
  { run: cullProjectiles, after: [hitProjectiles] },
  updateShards,
  expireFx,
  { run: worldTick, after: [moveBodies, touchBodies] },
])
