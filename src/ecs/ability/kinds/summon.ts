import { UNIT } from '../../../util/units'
import { ACQUIRE } from '../../../data/abilities'
import type { SummonDef } from '../../../types/abilityDefs'
import { ANIM_DEF } from '../../../emoji/anim'
import { Poison, Swarmer } from '../../components'
import { spawnMinion } from '../../entities/minion'
import { ownerX, ownerY } from '../amp'
import { targetsOf } from '../targets'
import type { Target } from '../targets'
import type { Source } from '../source'
import type { Sim } from '../../sim'

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

/** 优先未中毒的最近敌人；没有未中毒者则退而求其次取最近的 */
export function pickTarget(sim: Sim, src: Source, bx: number, by: number): Target | null {
  const max = ACQUIRE.range * UNIT
  let bestFresh: Target | null = null
  let bestFreshD = max * max
  let bestAny: Target | null = null
  let bestAnyD = max * max
  for (const t of targetsOf(sim, src)) {
    const dx = t.x - bx
    const dy = t.y - by
    const d = dx * dx + dy * dy
    if (d < bestAnyD) {
      bestAnyD = d
      bestAny = t
    }
    if (Poison.until[t.eid]! <= sim.elapsedMs && d < bestFreshD) {
      bestFreshD = d
      bestFresh = t
    }
  }
  return bestFresh ?? bestAny
}
