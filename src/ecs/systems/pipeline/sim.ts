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
import type { Step } from './step'

export const SIM_PIPELINE: readonly Step[] = [
  refoldBattleFx,
  updateDormancy,
  updateOrbit,
  moveTeam,
  layoutTeam,
  animateCharacters,
  reviveCharacters,
  regenCharacters,
  tickPoison,
  popInEnemies,
  despawnExpired,
  fadeEnemyFlash,
  applySlowZones,
  tintEnemies,
  updateEnemyGates,
  steerChase,
  steerRoam,
  steerFlee,
  steerStandoff,
  steerDetonate,
  steerBaseOrbit,
  steerCoinThief,
  steerDash,
  applyEnemySteps,
  applyKnockback,
  commitEnemySteps,
  animateEnemies,
  moveProjectiles,
  hitSweptProjectiles,
  characterContact,
  hitDirectProjectiles,
  cullProjectiles,
  characterVisual,
  blinkTelegraphs,
  updateShards,
  animateBooms,
  driftDecor,
  spinDecor,
  expireFx,
  worldTick,
]
