import { animateEnemies } from '../animateEnemies'
import { blinkTelegraphs } from '../blinkTelegraphs'
import { animateBooms } from '../animateBooms'
import { driftDecor } from '../driftDecor'
import { spinDecor } from '../spinDecor'
import { expireFx } from '../expireFx'
import { animateCharacters } from '../animateCharacters'
import { applyKnockback } from '../applyKnockback'
import { applySlowZones } from '../applySlowZones'
import { commitEnemySteps } from '../commitEnemySteps'
import { despawnExpired } from '../despawnExpired'
import { fadeEnemyFlash } from '../fadeEnemyFlash'
import { layoutTeam } from '../layoutTeam'
import { characterContact } from '../characterContact'
import { characterVisual } from '../characterVisual'
import { moveTeam } from '../moveTeam'
import { stepHandover } from '../shared/leader'
import { tickSkillCooldowns } from '../tickSkillCooldowns'
import { tickSkillStates } from '../tickSkillStates'
import { popInEnemies } from '../popInEnemies'
import { refoldBattleFx } from '../refoldBattleFx'
import { regenCharacters } from '../regenCharacters'
import { reviveCharacters } from '../reviveCharacters'
import { applyEnemySteps } from '../applyEnemySteps'
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
import { hitDirectProjectiles } from '../hitDirectProjectiles'
import { hitSweptProjectiles } from '../hitSweptProjectiles'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import { pipeline } from './step'

const STEERERS = [steerChase, steerRoam, steerFlee, steerStandoff, steerDetonate, steerBaseOrbit, steerCoinThief, steerDash]

// 时停期敌人移速与弹体位移都按 sim.wdtMs 积分，任何一步不得另乘时标
export const SIM_PIPELINE = pipeline([
  refoldBattleFx,
  updateDormancy,
  tickSkillCooldowns,
  stepHandover,
  { run: moveTeam, after: [stepHandover] },
  { run: tickSkillStates, after: [moveTeam] },
  { run: layoutTeam, after: [moveTeam, tickSkillStates] },
  { run: animateCharacters, after: [layoutTeam] },
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
  { run: applyEnemySteps, after: STEERERS },
  { run: applyKnockback, after: [applyEnemySteps] },
  { run: commitEnemySteps, after: [applyKnockback] },
  { run: animateEnemies, after: [commitEnemySteps] },
  { run: moveProjectiles, after: [commitEnemySteps] },
  { run: hitSweptProjectiles, after: [moveProjectiles] },
  { run: characterContact, after: [commitEnemySteps] },
  { run: hitDirectProjectiles, after: [characterContact, moveProjectiles] },
  { run: cullProjectiles, after: [hitSweptProjectiles, hitDirectProjectiles] },
  characterVisual,
  blinkTelegraphs,
  updateShards,
  animateBooms,
  driftDecor,
  { run: spinDecor, after: [driftDecor] },
  { run: expireFx, after: [animateBooms] },
  { run: worldTick, after: [commitEnemySteps, characterContact] },
])
