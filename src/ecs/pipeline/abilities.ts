import { clearFrameRegisters } from '../systems/clearFrameRegisters'
import { followTeamCenter } from '../systems/followTeamCenter'
import { updateAbilityGates } from '../systems/updateAbilityGates'
import { tickCooldowns } from '../systems/tickCooldowns'

import { castAreaBlasts } from '../systems/castAreaBlasts'
import { castAssassinates } from '../systems/castAssassinates'
import { castBoomerangs } from '../systems/castBoomerangs'
import { castBuffs } from '../systems/castBuffs'
import { castChainArcs } from '../systems/castChainArcs'
import { castDances } from '../systems/castDances'
import { castHeals } from '../systems/castHeals'
import { castLasers } from '../systems/castLasers'
import { castNukes } from '../systems/castNukes'
import { castProjectiles } from '../systems/castProjectiles'
import { castRallies } from '../systems/castRallies'
import { castSlowAuras } from '../systems/castSlowAuras'
import { castStrikes } from '../systems/castStrikes'
import { castSummons } from '../systems/castSummons'
import { castSweeps } from '../systems/castSweeps'
import { castThrusts } from '../systems/castThrusts'
import { castTimeStops } from '../systems/castTimeStops'
import { castTurrets } from '../systems/castTurrets'

import { fireRadials } from '../systems/fireRadials'
import { placeAssassinBody } from '../systems/placeAssassinBody'
import { placeIdleBoomerangs } from '../systems/placeIdleBoomerangs'
import { placeLaserBody } from '../systems/placeLaserBody'
import { placeProjectileBody } from '../systems/placeProjectileBody'
import { placeSweepBody } from '../systems/placeSweepBody'
import { placeThrustBody } from '../systems/placeThrustBody'
import { tickCombos } from '../systems/tickCombos'
import { tickEchoes } from '../systems/tickEchoes'
import { tickStrikeStay } from '../systems/tickStrikeStay'
import { updateBees } from '../systems/updateBees'
import { updateDrops } from '../systems/updateDrops'
import { updateEmplacements } from '../systems/updateEmplacements'
import { updateFlyers } from '../systems/updateFlyers'

import type { Sim } from '../sim'

// 一帧的能力推进：清帧表 → 锚点 → 闸门 → 冷却 → 逐 kind 的那几步。
//
// **次序即语义，而次序此前只存在于源码行序里。** 把 turret 往上挪一行，弩塔的拉弓
// 动画就悄悄晚一帧；把 gates 挪到施放之后，死人还能再出一次手——两者都不报错、
// 不警告，跑起来也「看着差不多」。
// 所以这里不是一串裸调用，而是一张**声明了依赖的流水线**：每一步写清它必须排在谁
// 之后、为什么。run.test.ts 校验实际次序满足全部声明，并且不留悬空引用。
//
// 一种能力往往不止一步：**摆位 / 推进在途 / 出手是三个独立的 system**。它们从前藏在
// castXxx 的函数体开头（`castLasers` 头两行就是 placeLaserBody + fireRadials），
// 于是这一层的次序又缩回了源码行序里。现在它们与 cast 平级列在这里。
//
// 没有 after 的步 = 与其他步互不相干，怎么排都行。**宁可不声明也不要编一个理由**：
// 自我印证的依赖（「它排在前面所以它必须排在前面」）比没有依赖更糟，测试会一直绿。

export interface Step {
  /** 依赖引用用的名字 */
  readonly name: string
  run(sim: Sim): void
  /** 必须排在这些步之后；省略即无约束 */
  readonly after?: readonly string[]
  /** 为什么——写不出理由的依赖多半是想出来的 */
  readonly why?: string
}

/** 一种能力在出手之前要跑的一步 */
interface Before {
  readonly name: string
  readonly run: (sim: Sim) => void
  /** 与同 kind 其他前置步之间的真实先后；没有就别写 */
  readonly after?: readonly string[]
  readonly why?: string
}

/** 一种能力：出手前的那几步 + 出手本身 */
interface Kind {
  readonly name: string
  readonly cast: (sim: Sim) => void
  readonly before?: readonly Before[]
  /** 除 cooldown 与自己的 before 之外的额外约束 */
  readonly after?: readonly string[]
  readonly why?: string
}

/** 逐 kind：彼此独立，只共同要求排在冷却推进之后。
 * 每个 before 步都必须排在本 kind 的 cast 之前——这条由 stepsOf 结构性保证并写进
 * cast.after：摆位要在出手前摆好（出手当帧读的是这一帧的位姿），在途的要先推进完
 *（还欠一发 / 还没接住时这一轮不另起） */
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
    why: '弩塔自持 projectile 能力、由 castProjectiles 代为出手；它的拉弓动画读 Fired.at === fxMs，须同帧看到那一次出手',
  },
  { name: 'slowAura', cast: castSlowAuras },
]

/** 把一种能力摊成流水线的若干步：before 各步，然后是 cast */
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

export const PIPELINE: readonly Step[] = [
  {
    name: 'clearFrameRegisters',
    run: clearFrameRegisters,
    why: '本帧登记表的清零必须先于所有生产者，否则登记项逐帧堆积',
  },
  {
    name: 'followTeamCenter',
    run: followTeamCenter,
    after: ['clearFrameRegisters'],
    why: '队长实体的位姿即队伍中心，施放锚点读它，故须先于一切施放',
  },
  {
    name: 'gates',
    run: updateAbilityGates,
    after: ['followTeamCenter'],
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
  for (const step of PIPELINE) step.run(sim)
}
