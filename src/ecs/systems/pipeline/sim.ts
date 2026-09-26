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
import { stepHandover } from '../shared/leader'
import { tickSkillCooldowns } from '../tickSkillCooldowns'
import { tickSkillStates } from '../tickSkillStates'
import { popInEnemies } from '../popInEnemies'
import { refoldBattleFx } from '../refoldBattleFx'
import { regenCharacters } from '../regenCharacters'
import { reviveCharacters } from '../reviveCharacters'
import { steerBodies } from '../steerBodies'
import { updateBees } from '../updateBees'
import { updateEnemyGates } from '../updateEnemyGates'
import { updateSpeedMuls } from '../updateSpeedMuls'
import { tickMarks } from '../tickMarks'
import { tintEnemies } from '../tintEnemies'
import { updateDormancy } from '../updateDormancy'
import { cullProjectiles } from '../cullProjectiles'
import { hitProjectiles } from '../hitProjectiles'
import { refreshTargets } from '../refreshTargets'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import { pipeline } from './step'

// 先走标记的时钟，再算每个身体的速度倍率与门控，再由驱动写期望速度，积分只在 moveBodies 一处；时标是身体的属性（Clock）
export const SIM_PIPELINE = pipeline([
  refoldBattleFx,
  updateDormancy,
  tickSkillCooldowns,
  stepHandover,
  { run: tickMarks, after: [updateDormancy] },
  { run: updateSpeedMuls, after: [refoldBattleFx, tickMarks] },
  { run: driveTeam, after: [stepHandover, updateSpeedMuls] },
  { run: layoutTeam, after: [driveTeam] },
  reviveCharacters,
  regenCharacters,
  { run: popInEnemies, after: [updateDormancy] },
  { run: despawnExpired, after: [updateDormancy] },
  { run: fadeEnemyFlash, after: [updateDormancy] },
  { run: tintEnemies, after: [updateDormancy] },
  { run: updateEnemyGates, after: [updateDormancy, updateSpeedMuls] },
  { run: updateBees, after: [updateDormancy] },
  { run: steerBodies, after: [updateEnemyGates, updateBees] },
  { run: moveBodies, after: [layoutTeam, steerBodies] },
  { run: refreshTargets, after: [moveBodies] },
  { run: tickSkillStates, after: [refreshTargets] },
  { run: animateCharacters, after: [moveBodies] },
  { run: animateEnemies, after: [moveBodies] },
  { run: moveProjectiles, after: [moveBodies] },
  { run: hitProjectiles, after: [moveProjectiles, refreshTargets] },
  { run: touchBodies, after: [refreshTargets, tickSkillStates] },
  { run: cullProjectiles, after: [hitProjectiles] },
  characterVisual,
  blinkTelegraphs,
  updateShards,
  animateBooms,
  driftDecor,
  { run: spinDecor, after: [driftDecor] },
  { run: expireFx, after: [animateBooms] },
  { run: worldTick, after: [moveBodies, touchBodies] },
])
