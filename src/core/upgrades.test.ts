import { describe, expect, it } from 'vitest'
import { MEMBER, TEAM } from './config'
import { applyUpgrade, pickUpgrade } from './upgrades'
import type { PlayerStats } from './upgrades'

function baseStats(): PlayerStats {
  return { damageMul: 1, cooldownMul: 1, moveSpeed: TEAM.moveSpeed, maxHp: MEMBER.maxHp }
}

describe('upgrades', () => {
  it('升级按固定顺序轮转：伤害→攻速→移速→回复→伤害…', () => {
    expect(pickUpgrade(2)).toBe('damage')
    expect(pickUpgrade(3)).toBe('attackSpeed')
    expect(pickUpgrade(4)).toBe('moveSpeed')
    expect(pickUpgrade(5)).toBe('heal')
    expect(pickUpgrade(6)).toBe('damage')
  })

  it('各强化效果正确且不改动原对象', () => {
    const s = baseStats()
    expect(applyUpgrade(s, 'damage').damageMul).toBeCloseTo(1.15)
    expect(applyUpgrade(s, 'attackSpeed').cooldownMul).toBeCloseTo(0.85)
    expect(applyUpgrade(s, 'moveSpeed').moveSpeed).toBe(Math.round(TEAM.moveSpeed * 1.08))
    expect(applyUpgrade(s, 'heal').maxHp).toBe(MEMBER.maxHp + 15)
    expect(s).toEqual(baseStats())
  })

  it('攻速冷却乘数有下限', () => {
    let s = { ...baseStats(), cooldownMul: 0.45 }
    s = applyUpgrade(s, 'attackSpeed')
    expect(s.cooldownMul).toBe(0.4)
  })
})
