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
import { updateOrbit } from '../updateOrbit'
import { cullProjectiles } from '../cullProjectiles'
import { hitDirectProjectiles } from '../hitDirectProjectiles'
import { hitSweptProjectiles } from '../hitSweptProjectiles'
import { moveProjectiles } from '../moveProjectiles'
import { updateShards } from '../updateShards'
import { worldTick } from '../worldTick'
import { pipeline } from './step'

const STEERERS = [steerChase, steerRoam, steerFlee, steerStandoff, steerDetonate, steerBaseOrbit, steerCoinThief, steerDash]

export const SIM_PIPELINE = pipeline([
  refoldBattleFx,
  updateDormancy,
  updateOrbit,
  { run: moveTeam, after: [updateOrbit] },
  { run: layoutTeam, after: [moveTeam] },
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
