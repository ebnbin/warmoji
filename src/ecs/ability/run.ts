import { castAreaBlasts } from './kinds/areaBlast'
import { castAssassinates } from './kinds/assassinate'
import { castBoomerangs } from './kinds/boomerang'
import { castBuffs } from './kinds/buff'
import { castChainArcs } from './kinds/chainArc'
import { castDances } from './kinds/dance'
import { castHeals } from './kinds/heal'
import { castLasers } from './kinds/laser'
import { castNukes } from './kinds/nuke'
import { castProjectiles } from './kinds/projectile'
import { castRallies } from './kinds/rally'
import { castSlowAuras } from './kinds/slowAura'
import { castStrikes } from './kinds/strike'
import { castSummons } from './kinds/summon'
import { castSweeps } from './kinds/sweep'
import { castThrusts } from './kinds/thrust'
import { castTimeStops } from './kinds/timeStop'
import { castTurrets } from './kinds/turret'
import { tickCooldowns } from './systems/cooldown'
import { followTeamCenter, updateAbilityGates } from './systems/gates'
import type { Sim } from '../sim'

// 一帧的能力推进：清帧表 → 锚点 → 闸门 → 冷却 → 逐 kind 施放。
//
// **次序即语义，而次序此前只存在于源码行序里。** 把 turret 往上挪一行，弩塔的拉弓
// 动画就悄悄晚一帧；把 gates 挪到施放之后，死人还能再出一次手——两者都不报错、
// 不警告，跑起来也「看着差不多」。
// 所以这里不再是一串裸调用，而是一张**声明了依赖的流水线**：每一步写清它必须排在谁
// 之后、为什么。run.test.ts 校验实际次序满足全部声明，并且不留悬空引用。
//
// 没有 after 的步 = 与其他步互不相干，怎么排都行。

export interface Step {
  /** 依赖引用用的名字 */
  readonly name: string
  run(sim: Sim): void
  /** 必须排在这些步之后；省略即无约束 */
  readonly after?: readonly string[]
  /** 为什么——写不出理由的依赖多半是想出来的 */
  readonly why?: string
}

/** 本帧登记表清零：能力系统是唯一生产者，消费方（updatePickups）读最近一次。
 * 少了这一步登记项会逐帧堆积 */
function clearFrameRegisters(sim: Sim): void {
  sim.frameAttractors.length = 0
}

/** 逐 kind 的施放系统：彼此独立，只共同要求排在冷却推进之后 */
const CASTERS: readonly { name: string; run: (sim: Sim) => void }[] = [
  { name: 'rally', run: castRallies },
  { name: 'dance', run: castDances },
  { name: 'buff', run: castBuffs },
  { name: 'timeStop', run: castTimeStops },
  { name: 'nuke', run: castNukes },
  { name: 'heal', run: castHeals },
  { name: 'areaBlast', run: castAreaBlasts },
  { name: 'chainArc', run: castChainArcs },
  { name: 'thrust', run: castThrusts },
  { name: 'sweep', run: castSweeps },
  { name: 'strike', run: castStrikes },
  { name: 'assassinate', run: castAssassinates },
  { name: 'projectile', run: castProjectiles },
  { name: 'boomerang', run: castBoomerangs },
  { name: 'laser', run: castLasers },
  { name: 'summon', run: castSummons },
  { name: 'turret', run: castTurrets },
  { name: 'slowAura', run: castSlowAuras },
]

/** 逐 kind 之外、彼此有真实先后的那几步的额外约束 */
const EXTRA_AFTER: Readonly<Record<string, { after: readonly string[]; why: string }>> = {
  turret: {
    after: ['projectile'],
    why: '弩塔自持 projectile 能力、由 castProjectiles 代为出手；它的拉弓动画读 Fired.at === fxMs，须同帧看到那一次出手',
  },
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
  ...CASTERS.map((c) => ({
    ...c,
    after: ['cooldown', ...(EXTRA_AFTER[c.name]?.after ?? [])],
    why: EXTRA_AFTER[c.name]?.why,
  })),
]

export function stepAbilities(sim: Sim): void {
  for (const step of PIPELINE) step.run(sim)
}
