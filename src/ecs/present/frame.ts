import { animateBees } from './animateBees'
import { animateBooms } from './animateBooms'
import { animateCharacters, finishCharacterPops } from './animateCharacters'
import { animateEnemies } from './animateEnemies'
import { animateShards } from './animateShards'
import { blinkTelegraphs, hideTelegraphs } from './blinkTelegraphs'
import { characterVisual } from './characterVisual'
import { fadeEnemyFlash } from './fadeEnemyFlash'
import { layerShots } from './layerShots'
import { finishEnemyPops, popInEnemies } from './popInEnemies'
import { showMounted } from './showMounted'
import { stepPickupVisuals } from './stepPickupVisuals'
import { tintEnemies } from './tintEnemies'
import { trackSight } from './trackSight'
import { updateAnims } from './updateAnims'
import type { Sim } from '../sim'

/** 每画一帧从战局算一遍外观；dtMs 是这一帧模拟走过的时长，模拟停住时为 0，外观也跟着停 */
export function presentFrame(sim: Sim, dtMs: number): void {
  popInEnemies(sim)
  fadeEnemyFlash(sim)
  tintEnemies(sim)
  trackSight(sim, dtMs)
  animateCharacters(sim, dtMs)
  animateEnemies(sim)
  animateBees(sim)
  layerShots(sim)
  characterVisual(sim)
  blinkTelegraphs(sim)
  animateShards(sim)
  animateBooms(sim)
  updateAnims(sim)
  showMounted(sim)
}

/** 打完以后的画面：还在进行的弹出与回弹直接收尾，预兆藏起，特效与碎片照画面时钟收完 */
export function presentFrozen(sim: Sim): void {
  animateShards(sim)
  animateBooms(sim)
  stepPickupVisuals(sim)
  characterVisual(sim)
  finishCharacterPops(sim)
  finishEnemyPops(sim)
  showMounted(sim)
  hideTelegraphs(sim)
}
