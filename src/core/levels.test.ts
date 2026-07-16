import { describe, expect, it } from 'vitest'
import { CHARACTERS, MEMBER } from './config'
import type { CharacterId } from './config'
import { dimBumps, LEVEL_DIMS, levelEffects, memberMaxHp, nextLevelKind, statUpgradeLabel } from './levels'

const IDS = Object.keys(CHARACTERS) as CharacterId[]

describe('角色等级维度', () => {
  it('每个角色都有 A/B 两条成长轴，且各轴至少有一项效果与文案', () => {
    for (const id of IDS) {
      for (const dim of [LEVEL_DIMS[id].a, LEVEL_DIMS[id].b]) {
        expect(dim.label.length).toBeGreaterThan(0)
        expect(
          (dim.damageMul ?? 1) !== 1 ||
            (dim.cooldownMul ?? 1) !== 1 ||
            (dim.rangeMul ?? 1) !== 1 ||
            (dim.hpMul ?? 1) !== 1,
        ).toBe(true)
      }
    }
  })

  it('维度节奏：2 级 A、4 级 B、5 级双维；3/6 级（能力级）不加维度', () => {
    expect(dimBumps(1)).toEqual({ a: 0, b: 0 })
    expect(dimBumps(2)).toEqual({ a: 1, b: 0 })
    expect(dimBumps(3)).toEqual({ a: 1, b: 0 })
    expect(dimBumps(4)).toEqual({ a: 1, b: 1 })
    expect(dimBumps(5)).toEqual({ a: 2, b: 2 })
    expect(dimBumps(6)).toEqual({ a: 2, b: 2 })
  })

  it('累计效果叠乘：巨魔满级 伤害 ×1.3² · 生命 ×1.25²', () => {
    const fx = levelEffects('troll', 6)
    expect(fx.damageMul).toBeCloseTo(1.3 * 1.3)
    expect(fx.hpMul).toBeCloseTo(1.25 * 1.25)
    expect(fx.cooldownMul).toBe(1)
    // 1 级无任何加成
    const lv1 = levelEffects('troll', 1)
    expect(lv1.damageMul).toBe(1)
    expect(lv1.hpMul).toBe(1)
  })

  it('3 级相对 2 级无数值变化（能力级纯质变）', () => {
    for (const id of IDS) {
      expect(levelEffects(id, 3)).toEqual(levelEffects(id, 2))
      expect(levelEffects(id, 6)).toEqual(levelEffects(id, 5))
    }
  })

  it('生命上限 = 基础×维度 hpMul + 道具加成，带下限保护', () => {
    expect(memberMaxHp('juggler', 1, 0)).toBe(MEMBER.maxHp)
    expect(memberMaxHp('troll', 5, 25)).toBe(Math.round(MEMBER.maxHp * 1.25 * 1.25) + 25)
    expect(memberMaxHp('juggler', 1, -999)).toBe(10)
  })

  it('下一级类型与文案：3/6 能力级，2/4/5 数值级（5 级双维文案），满级 null', () => {
    expect(nextLevelKind(1)).toBe('stats')
    expect(nextLevelKind(2)).toBe('ability')
    expect(nextLevelKind(3)).toBe('stats')
    expect(nextLevelKind(4)).toBe('stats')
    expect(nextLevelKind(5)).toBe('ability')
    expect(nextLevelKind(6)).toBeNull()
    expect(statUpgradeLabel('troll', 2)).toBe(LEVEL_DIMS.troll.a.label)
    expect(statUpgradeLabel('troll', 4)).toBe(LEVEL_DIMS.troll.b.label)
    expect(statUpgradeLabel('troll', 5)).toContain(LEVEL_DIMS.troll.a.label)
    expect(statUpgradeLabel('troll', 5)).toContain(LEVEL_DIMS.troll.b.label)
  })
})
