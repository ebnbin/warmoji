import { hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'
import { ABILITIES } from '../../data/abilities'
import { Drop, FACTION } from '../components'
import { spawnCaptain } from '../entities/captain'
import { spawnDrop } from '../entities/drop'
import { makeWorld } from '../world'
import { equipAbility, NEUTRAL_AMP, unequipAbilities } from './ability'
import type { FrameIndex } from '../frames'
import type { Sim } from '../sim'

// 守卫：徒手能力放出的子实体 Owner 是施放者本人而非武器实体，持有者离场时只按武器扫会漏回收

const frames: FrameIndex = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }

describe('unequipAbilities', () => {
  it('持有者离场时，挂在它自己身上的能力所生成的子实体一并回收', () => {
    const world = makeWorld()
    const sim = { world, frames } as unknown as Sim
    const host = spawnCaptain(world, 0, 0, 0, 0)
    // dimensionStrike 无 held ⇒ 能力组件直接挂 host，坠物的 Owner 也就是 host
    expect(equipAbility(sim, host, ABILITIES.dimensionStrike, FACTION.team, 0, NEUTRAL_AMP)).toBe(host)
    const drop = spawnDrop(sim, host, {
      emoji: '1f4a5', x: 0, y: 0, size: 1, fromAbove: 4, delayMs: 0, dropMs: 300, target: 0,
    })
    expect(hasComponent(world, drop, Drop)).toBe(true)

    unequipAbilities(sim, host)
    expect(hasComponent(world, drop, Drop)).toBe(false)
  })
})
