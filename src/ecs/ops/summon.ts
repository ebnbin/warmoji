import { } from '../../util/units'
import { } from '../../data/abilities'
import type { SummonDef } from '../../types/abilityDefs'
import { ANIM_DEF } from '../../emoji/anim'
import { Swarmer } from '../components'
import { spawnMinion } from '../entities/minion'
import { ownerX, ownerY } from '../utils/amp'
import { } from '../utils/targets'
import type { } from '../utils/targets'
import type { } from '../utils/source'
import type { Sim } from '../sim'

/** 一只小蜂：出生在主人身上，相位错开好让一波蜂散得开 */
export function spawnBee(sim: Sim, e: number, def: SummonDef, index: number): void {
  spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: def.minion.emoji,
    size: def.minion.size,
    bornScale: 1,
    x: ownerX(e),
    y: ownerY(e),
    z: 12,
    lifeMs: def.lifeMs,
    phase: (index * Math.PI * 2) / def.count,
    cd: 0,
    animOffsetMs: (index * ANIM_DEF.durMs) / def.count,
  })
}
