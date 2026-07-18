import { describe, expect, it } from 'vitest'
import { ABILITIES, applyAbilities } from './abilities'
import { CHARACTERS } from '../config'
import type { CharacterId } from '../config'

const IDS = Object.keys(CHARACTERS) as CharacterId[]
const NONE = { a1: false, a2: false }
const T1 = { a1: true, a2: false }
const T2 = { a1: true, a2: true }

describe('特殊能力定义', () => {
  it('每个角色恰好两个能力（一阶/二阶卡），均有图标/名字/描述', () => {
    for (const id of IDS) {
      expect(ABILITIES[id]).toHaveLength(2)
      for (const a of ABILITIES[id]) {
        expect(a.icon.length).toBeGreaterThan(0)
        expect(a.name.length).toBeGreaterThan(0)
        expect(a.desc.length).toBeGreaterThan(0)
      }
    }
  })

})

describe('能力注入武器 spec', () => {
  it('未购能力卡不改动任何武器', () => {
    for (const id of IDS) {
      const out = applyAbilities(id, NONE, CHARACTERS[id].weapons)
      expect(out).toEqual([...CHARACTERS[id].weapons])
    }
  })

  it('每个角色一阶卡起武器 spec 发生实际变化', () => {
    for (const id of IDS) {
      const out = applyAbilities(id, T1, CHARACTERS[id].weapons)
      expect(out).not.toEqual([...CHARACTERS[id].weapons])
    }
  })

  it('杂耍演员：一阶齐射、二阶追加溅射', () => {
    const [w3] = applyAbilities('juggler', T1, CHARACTERS.juggler.weapons)
    if (w3?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w3.volley?.count).toBe(3)
    expect(w3.splash).toBeUndefined()
    const [w6] = applyAbilities('juggler', T2, CHARACTERS.juggler.weapons)
    if (w6?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w6.volley?.count).toBe(3)
    expect(w6.splash?.ratio).toBeCloseTo(0.6)
  })

  it('巨魔：一阶弧宽变整圈；牛仔双枪都获得贯穿', () => {
    const [sweep] = applyAbilities('troll', T1, CHARACTERS.troll.weapons)
    if (sweep?.kind !== 'sweep') throw new Error('kind 不变')
    expect(sweep.arcRad).toBeCloseTo(Math.PI * 2)
    const pistols = applyAbilities('cowboy', T1, CHARACTERS.cowboy.weapons)
    expect(pistols).toHaveLength(2)
    for (const p of pistols) {
      if (p.kind !== 'projectile') throw new Error('kind 不变')
      expect(p.pierce).toBe(2)
    }
  })

  it('袋鼠二阶：镖体与判定同步放大且带磁力', () => {
    const [b3] = applyAbilities('kangaroo', T1, CHARACTERS.kangaroo.weapons)
    const [b6] = applyAbilities('kangaroo', T2, CHARACTERS.kangaroo.weapons)
    if (b3?.kind !== 'boomerang' || b6?.kind !== 'boomerang') throw new Error('kind 不变')
    expect(b3.twin).toBe(true)
    expect(b3.coinMagnetRadius).toBeUndefined()
    expect(b6.hitRadius).toBeCloseTo(b3.hitRadius * 1.4)
    expect(b6.held.size).toBeCloseTo(b3.held.size * 1.4)
    expect(b6.coinMagnetRadius).toBeGreaterThan(0)
  })

  it('雪人：一阶冻伤 dps、二阶追加冰冻脉冲；机器人二阶 8 向扫射', () => {
    const [aura] = applyAbilities('snowman', T2, CHARACTERS.snowman.weapons)
    if (aura?.kind !== 'slowAura') throw new Error('kind 不变')
    expect(aura.dps).toBeGreaterThan(0)
    expect(aura.freeze?.durationMs).toBeGreaterThan(0)
    const [laser] = applyAbilities('robot', T2, CHARACTERS.robot.weapons)
    if (laser?.kind !== 'laser') throw new Error('kind 不变')
    expect(laser.radial?.beams).toBe(8)
  })
})
