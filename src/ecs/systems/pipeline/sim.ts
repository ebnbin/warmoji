import { animateEnemies } from '../animateEnemies'
import { blinkTelegraphs } from '../blinkTelegraphs'
import { animateBooms } from '../animateBooms'
import { driftDecor } from '../driftDecor'
import { spinDecor } from '../spinDecor'
import { expireFx } from '../expireFx'
import { animateCharacters } from '../animateCharacters'
import { applySlowZones } from '../applySlowZones'
import { despawnExpired } from '../despawnExpired'
import { fadeEnemyFlash } from '../fadeEnemyFlash'
import { layoutTeam } from '../layoutTeam'
import { characterContact } from '../characterContact'
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
import { steerBaseOrbit } from '../steerBaseOrbit'
import { steerChase } from '../steerChase'
import { steerCoinThief } from '../steerCoinThief'
import { steerDash } from '../steerDash'
import { steerDetonate } from '../steerDetonate'
import { steerFlee } from '../steerFlee'
import { steerRoam } from '../steerRoam'
import { steerStandoff } from '../steerStandoff'
import { updateEnemyGates } from '../updateEnemyGates'
import { tickPoison } from '../tickPoison'
import { tintEnemies } from '../tintEnemies'
import { updateDormancy } from '../updateDormancy'
import { cullProjectiles } from '../cullProjectiles'
import { hitProjectiles } from '../hitProjectiles'
import { refreshTargets } from '../refreshTargets'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import { pipeline } from './step'

const STEERERS = [steerChase, steerRoam, steerFlee, steerStandoff, steerDetonate, steerBaseOrbit, steerCoinThief, steerDash]

// 时标是身体的属性（Clock）：驱动层只写期望速度，积分只在 moveBodies 一处
export const SIM_PIPELINE = pipeline([
  refoldBattleFx,
  updateDormancy,
  tickSkillCooldowns,
  stepHandover,
  { run: driveTeam, after: [stepHandover] },
  { run: layoutTeam, after: [driveTeam] },
  reviveCharacters,
  regenCharacters,
  tickPoison,
  { run: popInEnemies, after: [updateDormancy] },
  { run: despawnExpired, after: [updateDormancy] },
  { run: fadeEnemyFlash, after: [updateDormancy] },
  { run: applySlowZones, after: [updateDormancy] },
  { run: tintEnemies, after: [applySlowZones] },
  { run: updateEnemyGates, after: [applySlowZones] },
  ...STEERERS.map((run) => ({ run, after: [updateEnemyGates] })),
  { run: moveBodies, after: [layoutTeam, ...STEERERS] },
  { run: refreshTargets, after: [moveBodies] },
  { run: tickSkillStates, after: [refreshTargets] },
  { run: animateCharacters, after: [moveBodies] },
  { run: animateEnemies, after: [moveBodies] },
  { run: moveProjectiles, after: [moveBodies] },
  { run: hitProjectiles, after: [moveProjectiles, refreshTargets] },
  { run: characterContact, after: [refreshTargets, tickSkillStates] },
  { run: cullProjectiles, after: [hitProjectiles] },
  characterVisual,
  blinkTelegraphs,
  updateShards,
  animateBooms,
  driftDecor,
  { run: spinDecor, after: [driftDecor] },
  { run: expireFx, after: [animateBooms] },
  { run: worldTick, after: [moveBodies, characterContact] },
])
