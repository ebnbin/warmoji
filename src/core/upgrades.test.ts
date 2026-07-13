import { describe, expect, it } from 'vitest'
import { KNIFE, MEMBER, TEAM } from './config'
import { applyUpgrade, pickUpgrade } from './upgrades'
import type { PlayerStats } from './upgrades'

function baseStats(): PlayerStats {
  return { knives: 1, attackCooldownMs: KNIFE.cooldownMs, moveSpeed: TEAM.moveSpeed, maxHp: MEMBER.maxHp }
}

describe('upgrades', () => {
  it('升级按固定顺序轮转：飞刀→攻速→移速→回复→飞刀…', () => {
    const s = baseStats()
    expect(pickUpgrade(2, s)).toBe('knife')
    expect(pickUpgrade(3, s)).toBe('attackSpeed')
    expect(pickUpgrade(4, s)).toBe('moveSpeed')
    expect(pickUpgrade(5, s)).toBe('heal')
    expect(pickUpgrade(6, s)).toBe('knife')
  })

  it('飞刀满编后由攻速顶替', () => {
    const s = { ...baseStats(), knives: KNIFE.maxCount }
    expect(pickUpgrade(6, s)).toBe('attackSpeed')
  })

  it('各强化效果正确且不改动原对象', () => {
    const s = baseStats()
    expect(applyUpgrade(s, 'knife').knives).toBe(2)
    expect(applyUpgrade(s, 'attackSpeed').attackCooldownMs).toBe(Math.round(KNIFE.cooldownMs * 0.85))
    expect(applyUpgrade(s, 'moveSpeed').moveSpeed).toBe(Math.round(TEAM.moveSpeed * 1.08))
    expect(applyUpgrade(s, 'heal').maxHp).toBe(MEMBER.maxHp + 15)
    expect(s).toEqual(baseStats())
  })

  it('攻速冷却有下限', () => {
    let s = { ...baseStats(), attackCooldownMs: 320 }
    s = applyUpgrade(s, 'attackSpeed')
    expect(s.attackCooldownMs).toBe(300)
  })

  it('飞刀数量有上限', () => {
    const s = { ...baseStats(), knives: KNIFE.maxCount }
    expect(applyUpgrade(s, 'knife').knives).toBe(KNIFE.maxCount)
  })
})
