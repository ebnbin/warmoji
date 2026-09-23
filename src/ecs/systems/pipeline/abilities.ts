import { clearFrameRegisters } from '../clearFrameRegisters'
import { updateAbilityGates } from '../updateAbilityGates'
import { tickCooldowns } from '../tickCooldowns'

import { castAreaBlasts } from '../castAreaBlasts'
import { castAssassinates } from '../castAssassinates'
import { castBoomerangs } from '../castBoomerangs'
import { castBuffs } from '../castBuffs'
import { castChainArcs } from '../castChainArcs'
import { castDances } from '../castDances'
import { castHeals } from '../castHeals'
import { castLasers } from '../castLasers'
import { castNukes } from '../castNukes'
import { castProjectiles } from '../castProjectiles'
import { castRallies } from '../castRallies'
import { castSlowAuras } from '../castSlowAuras'
import { castStrikes } from '../castStrikes'
import { castSummons } from '../castSummons'
import { castSweeps } from '../castSweeps'
import { castThrusts } from '../castThrusts'
import { castTimeStops } from '../castTimeStops'
import { castTurrets } from '../castTurrets'

import { fireRadials } from '../fireRadials'
import { placeAssassinBody } from '../placeAssassinBody'
import { placeIdleBoomerangs } from '../placeIdleBoomerangs'
import { placeLaserBody } from '../placeLaserBody'
import { placeProjectileBody } from '../placeProjectileBody'
import { placeSweepBody } from '../placeSweepBody'
import { placeThrustBody } from '../placeThrustBody'
import { tickCombos } from '../tickCombos'
import { tickEchoes } from '../tickEchoes'
import { tickStrikeStay } from '../tickStrikeStay'
import { updateBees } from '../updateBees'
import { updateDrops } from '../updateDrops'
import { updateEmplacements } from '../updateEmplacements'
import { updateFlyers } from '../updateFlyers'

import { runPipeline } from './step'
import type { Step } from './step'
import type { Sim } from '../../sim'

// 声明了依赖的流水线，order.test.ts 校验；没有真实依赖就不写 after

interface Before {
  readonly name: string
  readonly run: (sim: Sim) => void
  /** 没有真实先后就别写 */
  readonly after?: readonly string[]
  readonly why?: string
}

interface Kind {
  readonly name: string
  readonly cast: (sim: Sim) => void
  readonly before?: readonly Before[]
  /** 除 cooldown 与自己的 before 之外的额外约束 */
  readonly after?: readonly string[]
  readonly why?: string
}

/** 每个 before 步排在本 kind 的 cast 之前，由 stepsOf 保证 */
const KINDS: readonly Kind[] = [
  { name: 'rally', cast: castRallies },
  { name: 'dance', cast: castDances },
  { name: 'buff', cast: castBuffs },
  { name: 'timeStop', cast: castTimeStops },
  { name: 'nuke', cast: castNukes },
  { name: 'heal', cast: castHeals },
  { name: 'areaBlast', cast: castAreaBlasts, before: [{ name: 'tickEchoes', run: tickEchoes }] },
  { name: 'chainArc', cast: castChainArcs },
  {
    name: 'thrust',
    cast: castThrusts,
    before: [
      { name: 'placeThrustBody', run: placeThrustBody },
      { name: 'tickCombos', run: tickCombos },
    ],
  },
  { name: 'sweep', cast: castSweeps, before: [{ name: 'placeSweepBody', run: placeSweepBody }] },
  { name: 'strike', cast: castStrikes, before: [{ name: 'updateDrops', run: updateDrops }] },
  {
    name: 'assassinate',
    cast: castAssassinates,
    before: [
      { name: 'placeAssassinBody', run: placeAssassinBody },
      { name: 'tickStrikeStay', run: tickStrikeStay },
    ],
  },
  { name: 'projectile', cast: castProjectiles, before: [{ name: 'placeProjectileBody', run: placeProjectileBody }] },
  {
    name: 'boomerang',
    cast: castBoomerangs,
    before: [
      { name: 'updateFlyers', run: updateFlyers },
      {
        name: 'placeIdleBoomerangs',
        run: placeIdleBoomerangs,
        after: ['updateFlyers'],
        why: '摆的是「不在途的」镖；本帧接住的那一支要先被 updateFlyers 收回，否则它会在飞行落点上多停一帧',
      },
    ],
  },
  {
    name: 'laser',
    cast: castLasers,
    before: [
      { name: 'placeLaserBody', run: placeLaserBody },
      { name: 'fireRadials', run: fireRadials },
    ],
  },
  { name: 'summon', cast: castSummons, before: [{ name: 'updateBees', run: updateBees }] },
  {
    name: 'turret',
    cast: castTurrets,
    before: [
      {
        name: 'updateEmplacements',
        run: updateEmplacements,
        why: '超编拆最旧的一座要先于建新的，否则同帧会多出一座',
      },
    ],
    after: ['projectile'],
    why: '弩塔自持 projectile 能力、由 castProjectiles 代为出手；它的拉弓动画消费 Fired 出手标记，须同帧看到那一次出手',
  },
  { name: 'slowAura', cast: castSlowAuras },
]

function stepsOf(k: Kind): Step[] {
  const before = (k.before ?? []).map((b) => ({
    name: b.name,
    run: b.run,
    after: ['cooldown', ...(b.after ?? [])],
    why: b.why,
  }))
  return [
    ...before,
    {
      name: k.name,
      run: k.cast,
      after: ['cooldown', ...before.map((b) => b.name), ...(k.after ?? [])],
      why: k.why,
    },
  ]
}

export const ABILITY_PIPELINE: readonly Step[] = [
  {
    name: 'clearFrameRegisters',
    run: clearFrameRegisters,
    why: '本帧登记表的清零必须先于所有生产者，否则登记项逐帧堆积',
  },
  {
    name: 'gates',
    run: updateAbilityGates,
    why: 'Frozen/Disarmed 是本帧派生的闸门，晚一帧就是「死人还能出一次手」',
  },
  {
    name: 'cooldown',
    run: tickCooldowns,
    after: ['gates'],
    why: '冻结者连冷却都不推进，故须读到本帧的闸门',
  },
  ...KINDS.flatMap(stepsOf),
]

export function stepAbilities(sim: Sim): void {
  runPipeline(ABILITY_PIPELINE, sim)
}
