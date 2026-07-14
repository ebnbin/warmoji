import { describe, expect, it } from 'vitest'
import { LEVELS, MEMBER } from './config'
import { levelDamageMul, levelHpMul, memberMaxHp } from './levels'

describe('角色等级数值脊柱', () => {
  it('1 级无加成，逐级线性增长', () => {
    expect(levelDamageMul(1)).toBe(1)
    expect(levelHpMul(1)).toBe(1)
    expect(levelDamageMul(LEVELS.max)).toBeCloseTo(1 + LEVELS.damagePerLevel * (LEVELS.max - 1))
    expect(levelHpMul(LEVELS.max)).toBeCloseTo(1 + LEVELS.hpPerLevel * (LEVELS.max - 1))
  })

  it('生命上限 = 基础×等级倍率 + 道具加成，带下限保护', () => {
    expect(memberMaxHp(1, 0)).toBe(MEMBER.maxHp)
    expect(memberMaxHp(3, 25)).toBe(Math.round(MEMBER.maxHp * levelHpMul(3)) + 25)
    expect(memberMaxHp(1, -999)).toBe(10)
  })
})
