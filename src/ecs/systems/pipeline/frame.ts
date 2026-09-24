import { armEnemies } from '../armEnemies'
import { capCoins } from '../capCoins'
import { fireCarriers } from '../fireCarriers'
import { fireSurges } from '../fireSurges'
import { grantCoins } from '../grantCoins'
import { grantFlash } from '../grantFlash'
import { grantMods } from '../grantMods'
import { playPickupFx } from '../playPickupFx'
import { reapCollected } from '../reapCollected'
import { refreshCharacterTargets } from '../refreshCharacterTargets'
import { runDeathEffects } from '../runDeathEffects'
import { spawnStep } from '../spawnStep'
import { updateAnims } from '../updateAnims'
import { updatePickups } from '../updatePickups'
import { updateSpawners } from '../updateSpawners'
import { updateZones } from '../updateZones'
import { castRequests, stepAbilities } from './abilities'
import { runPipeline } from './step'
import { stepSim } from '../../sim'
import type { Step } from './step'
import type { Sim } from '../../sim'


export const FRAME_PIPELINE: readonly Step[] = [
  { name: 'castRequests', run: castRequests },
  {
    name: 'stepSim',
    run: stepSim,
    after: ['castRequests'],
    why: '队长技按按键时刻结算，须先于本帧的伤害；晚一帧就是「圣光复活了全队仍判负」',
  },
  { name: 'refreshCharacterTargets', run: refreshCharacterTargets },
  { name: 'armEnemies', run: armEnemies },
  {
    name: 'stepAbilities',
    run: stepAbilities,
    after: ['stepSim', 'refreshCharacterTargets', 'armEnemies'],
    why:
      '队伍中心是 stepSim 里的 moveTeam 挪的，而自动施放的锚点读它；' +
      '队员快照是敌方能力的索敌来源；魔尘复形的冷却缓冲在 armEnemies 里施加，晚了就是复形瞬间齐射',
  },
  { name: 'updateAnims', run: updateAnims },
  { name: 'runDeathEffects', run: runDeathEffects },
  { name: 'updateZones', run: updateZones },
  { name: 'updatePickups', run: updatePickups },
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
  {
    name: 'capCoins',
    run: capCoins,
    after: ['reapCollected'],
    why: '上限只数地上的金币，已拾取的须先离场',
  },
  { name: 'updateSpawners', run: updateSpawners },
  // 须先于 spawnStep：它按在场数 + 在途预告数判上限
  { name: 'fireSurges', run: fireSurges },
  { name: 'fireCarriers', run: fireCarriers },
  { name: 'spawnStep', run: spawnStep, after: ['fireSurges', 'fireCarriers'],
    why: '刷怪上限按「在场 + 在途预告」判，本帧排的预告要算进去' },
]

export function stepFrame(sim: Sim): void {
  runPipeline(FRAME_PIPELINE, sim)
}
