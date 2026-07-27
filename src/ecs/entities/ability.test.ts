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

// 子实体回收守卫。
//
// 钉的是这样一个缺陷：**徒手能力挂在施放者自己身上，它放出的子实体（天罚坠物 /
// 跟随光环）记的 Owner 就是施放者本人，而不是某颗武器实体**。持有者离场时若只按
// 「他名下的武器」去扫子实体，这些就会被漏掉，活到 eid 被回收再分配之后——从此挂在
// 新住户名下，代表一个已经死了的敌人继续落下伤害。
//
// 不报错、不崩、画面上只是偶尔多掉一颗东西，跑一百局也未必看出来。而现有数据里
// croc / mecha / eclipse / blackhole 四只的天罚都是徒手能力，这条路径每局都在走。

const frames: FrameIndex = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }

describe('unequipAbilities', () => {
  it('持有者离场时，挂在它自己身上的能力所生成的子实体一并回收', () => {
    const world = makeWorld()
    const sim = { world, frames } as unknown as Sim
    const host = spawnCaptain(world, 0, 0, 0, 0) // 随便一个宿主实体，这里只当「能力挂在谁身上」用
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
