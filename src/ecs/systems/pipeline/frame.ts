import { armEnemies } from '../armEnemies'
import { grantCoins } from '../grantCoins'
import { grantFlash } from '../grantFlash'
import { grantMods } from '../grantMods'
import { playPickupFx } from '../playPickupFx'
import { reapCollected } from '../reapCollected'
import { refreshCharacterTargets } from '../refreshCharacterTargets'
import { refreshEnemyTargets } from '../refreshEnemyTargets'
import { runDeathEffects } from '../runDeathEffects'
import { spawnStep } from '../spawnStep'
import { updateAnims } from '../updateAnims'
import { updatePickups } from '../updatePickups'
import { updateSpawners } from '../updateSpawners'
import { updateZones } from '../updateZones'
import { stepAbilities } from './abilities'
import { runPipeline } from './step'
import { stepSim } from '../../sim'
import type { Step } from './step'
import type { Sim } from '../../sim'

// 一帧的最外圈。SIM_PIPELINE 与 ABILITY_PIPELINE 各自是它的一步。
//
// 这一层从前只是 EcsBattleScene.update() 里的一串裸调用：每步都有个 why 注释说明
// 它为什么在这，但全是行序，没有一条被声明、被校验。而它承载的恰恰是跨子系统的
// 依赖——最难在别处发现的那种，破坏了也全是静默的：索敌快照晚一步，抛射物的命中
// 效果链用的就是上一帧位置；reapCollected 早一步，金币静静地不入账。

export const FRAME_PIPELINE: readonly Step[] = [
  { name: 'refreshEnemyTargets', run: refreshEnemyTargets },
  {
    name: 'stepSim',
    run: stepSim,
    after: ['refreshEnemyTargets'],
    why: 'stepSim 内的抛射物 onHit 效果链要用本帧位置；队伍 orbit 的威胁点也读这一份',
  },
  { name: 'refreshCharacterTargets', run: refreshCharacterTargets },
  { name: 'armEnemies', run: armEnemies },
  {
    name: 'stepAbilities',
    run: stepAbilities,
    after: ['stepSim', 'refreshCharacterTargets', 'armEnemies'],
    why:
      '队伍中心是 stepSim 里的 moveTeam 挪的，而施放锚点读它；' +
      '队员快照是敌方能力的索敌来源；魔尘复形的冷却缓冲在 armEnemies 里施加，晚了就是复形瞬间齐射',
  },
  { name: 'updateAnims', run: updateAnims },
  { name: 'runDeathEffects', run: runDeathEffects },
  { name: 'updateZones', run: updateZones },
  { name: 'updatePickups', run: updatePickups },
  // 到手给什么：每种给法一个系统，各取所需。四者互不相干，故彼此无序
  { name: 'grantCoins', run: grantCoins, after: ['updatePickups'] },
  { name: 'grantMods', run: grantMods, after: ['updatePickups'] },
  { name: 'grantFlash', run: grantFlash, after: ['updatePickups'] },
  { name: 'playPickupFx', run: playPickupFx, after: ['updatePickups'] },
  {
    name: 'reapCollected',
    run: reapCollected,
    after: ['grantCoins', 'grantMods', 'grantFlash', 'playPickupFx'],
    why: '到手的拾取物在这里离场——早一步，实体没了就什么都结算不到',
  },
  { name: 'updateSpawners', run: updateSpawners },
  { name: 'spawnStep', run: spawnStep },
]

/** 跑完一帧的仿真侧。Scene 只负责它前后的事：回填视口、排空视觉事件、过场判定 */
export function stepFrame(sim: Sim): void {
  runPipeline(FRAME_PIPELINE, sim)
}
