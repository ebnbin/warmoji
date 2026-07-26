import { ANIM_DEF } from '../../emoji/anim'
import { Summon, Swarmer } from '../components'
import { spawnMinion } from '../entities/minion'
import { abilityArtEmoji } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import type { Sim } from '../sim'

/** 一只小蜂：出生在主人身上，相位错开好让一波蜂散得开 */
export function spawnBee(sim: Sim, e: number, index: number): void {
  const count = Summon.count[e]!
  spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: abilityArtEmoji[e]!,
    size: Summon.size[e]!,
    bornScale: 1,
    x: ownerX(e),
    y: ownerY(e),
    z: 12,
    lifeMs: Summon.lifeMs[e]!,
    phase: (index * Math.PI * 2) / count,
    cd: 0,
    animOffsetMs: (index * ANIM_DEF.durMs) / count,
  })
}
