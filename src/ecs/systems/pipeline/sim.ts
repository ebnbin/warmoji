import { animateEnemies } from '../animateEnemies'
import { blinkTelegraphs } from '../blinkTelegraphs'
import { animateBooms } from '../animateBooms'
import { driftDecor } from '../driftDecor'
import { spinDecor } from '../spinDecor'
import { expireFx } from '../expireFx'
import { animateCharacters } from '../animateCharacters'
import { despawnExpired } from '../despawnExpired'
import { fadeEnemyFlash } from '../fadeEnemyFlash'
import { layoutTeam } from '../layoutTeam'
import { touchBodies } from '../touchBodies'
import { characterVisual } from '../characterVisual'
import { driveTeam } from '../driveTeam'
import { moveBodies } from '../moveBodies'
import { tickStamina } from '../tickStamina'
import { stepHandover } from '../shared/leader'
import { tickSkillCooldowns } from '../tickSkillCooldowns'
import { settleMotions } from '../settleMotions'
import { popInEnemies } from '../popInEnemies'
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
import { tickGrowUp } from '../tickGrowUp'
import { tickPets } from '../tickPets'
import { tickBorrowed } from '../shared/steal'
import { tickGuts } from '../shared/gut'
import { tickShadows } from '../../entities/shadow'
import { recordHistory } from '../shared/history'
import { tickBarriers } from '../../entities/barrier'
import { tickTethers } from '../../entities/tether'
import { tintEnemies } from '../tintEnemies'
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
  { run: tickBarriers, after: [tickMarks] },
  { run: tickStats, after: [refoldBattleFx, tickMarks, tickForms] },
  { run: tickRegen, after: [tickStats] },
  { run: updateControl, after: [tickStats, tickMarks] },
  { run: driveTeam, after: [stepHandover, reviveCharacters, updateControl] },
  { run: layoutTeam, after: [driveTeam] },
  popInEnemies,
  despawnExpired,
  fadeEnemyFlash,
  { run: tintEnemies, after: [fadeEnemyFlash] },
  updateBees,
  { run: steerBodies, after: [updateControl, updateBees] },
  { run: moveBodies, after: [layoutTeam, steerBodies] },
  { run: tickStamina, after: [moveBodies] },
  { run: refreshTargets, after: [moveBodies] },
  { run: recordHistory, after: [moveBodies] },
  { run: tickPets, after: [moveBodies] },
  { run: tickTethers, after: [refreshTargets] },
  { run: settleMotions, after: [refreshTargets] },
  { run: animateCharacters, after: [moveBodies] },
  { run: animateEnemies, after: [moveBodies] },
  { run: moveProjectiles, after: [moveBodies] },
  { run: hitProjectiles, after: [moveProjectiles, refreshTargets] },
  { run: touchBodies, after: [refreshTargets, settleMotions] },
  { run: cullProjectiles, after: [hitProjectiles] },
  { run: characterVisual, after: [hitProjectiles, touchBodies] },
  blinkTelegraphs,
  updateShards,
  animateBooms,
  driftDecor,
  { run: spinDecor, after: [driftDecor] },
  { run: expireFx, after: [animateBooms] },
  { run: worldTick, after: [moveBodies, touchBodies] },
])
