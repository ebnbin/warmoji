import { describe, expect, it } from 'vitest'
import {
  BATTLE_FX_IDENTITY,
  FIELD_PICKUPS,
  FIELD_PICKUP_IDS,
  fieldPickupsFor,
  foldBattleEffects,
  rollWaveCarriers,
  waveCarrierBudget,
} from './battlefield'
import type { BattleEffects } from './battlefield'
import { MAP_IDS } from './maps'
import { Rng } from '../core/rng'

const FX_KEYS: (keyof BattleEffects)[] = [
  'moveSpeedMul',
  'teamDamageMul',
  'teamCooldownMul',
  'critAdd',
  'enemySlowMul',
]

describe('战场拾取定义', () => {
  it('每张拾取有 id/emoji/名字/介绍/正时长/极性/至少一条效果，id 全局唯一', () => {
    const ids = new Set<string>()
    for (const id of FIELD_PICKUP_IDS) {
      const d = FIELD_PICKUPS[id]!
      expect(d.id).toBe(id)
      expect(d.emoji.length).toBeGreaterThan(0)
      expect(d.name.length).toBeGreaterThan(0)
      expect(d.desc.length).toBeGreaterThan(0)
      expect(d.durationMs).toBeGreaterThan(0)
      expect(d.polarity === 'buff' || d.polarity === 'debuff').toBe(true)
      expect(Object.keys(d.fx).length).toBeGreaterThan(0)
      for (const k of Object.keys(d.fx)) expect(FX_KEYS).toContain(k as keyof BattleEffects)
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
  })

  it('每张地图池至少 1 增益 + 1 减益，且拾取归属本图', () => {
    for (const mapId of MAP_IDS) {
      const pool = fieldPickupsFor(mapId)
      expect(pool.filter((p) => p.polarity === 'buff').length).toBeGreaterThanOrEqual(1)
      expect(pool.filter((p) => p.polarity === 'debuff').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('增益卡有正向效果、减益卡有负向效果', () => {
    for (const id of FIELD_PICKUP_IDS) {
      const d = FIELD_PICKUPS[id]!
      const fx = foldBattleEffects([d.fx])
      // 队伍侧变强 = 移速/伤害>1、攻速<1、暴击>0、敌速<1；减益为其反向
      const helpful =
        fx.moveSpeedMul > 1 ||
        fx.teamDamageMul > 1 ||
        fx.teamCooldownMul < 1 ||
        fx.critAdd > 0 ||
        fx.enemySlowMul < 1
      const harmful =
        fx.moveSpeedMul < 1 ||
        fx.teamDamageMul < 1 ||
        fx.teamCooldownMul > 1 ||
        fx.enemySlowMul > 1
      if (d.polarity === 'buff') expect(helpful).toBe(true)
      else expect(harmful).toBe(true)
    }
  })
})

describe('foldBattleEffects 叠加', () => {
  it('空 = 单位元', () => {
    expect(foldBattleEffects([])).toEqual(BATTLE_FX_IDENTITY)
  })

  it('乘区相乘、crit 相加', () => {
    const fx = foldBattleEffects([
      { moveSpeedMul: 1.2 },
      { moveSpeedMul: 1.1 },
      { critAdd: 0.1 },
      { critAdd: 0.05 },
    ])
    expect(fx.moveSpeedMul).toBeCloseTo(1.32)
    expect(fx.critAdd).toBeCloseTo(0.15)
  })

  it('封顶/保底防叠飞：crit≤0.5、各乘区在区间内', () => {
    const fx = foldBattleEffects([
      { critAdd: 0.4 },
      { critAdd: 0.4 },
      { teamDamageMul: 5 },
      { moveSpeedMul: 0.01 },
      { teamCooldownMul: 10 },
      { enemySlowMul: 0.01 },
    ])
    expect(fx.critAdd).toBe(0.5)
    expect(fx.teamDamageMul).toBeLessThanOrEqual(2.5)
    expect(fx.moveSpeedMul).toBeGreaterThanOrEqual(0.35)
    expect(fx.teamCooldownMul).toBeLessThanOrEqual(2.2)
    expect(fx.enemySlowMul).toBeGreaterThanOrEqual(0.4)
  })
})

describe('waveCarrierBudget 波次预算', () => {
  it('前段 2/1、中段 2/2、后段 3/3、Boss 波 1/2', () => {
    expect(waveCarrierBudget(1, false)).toEqual({ buff: 2, debuff: 1 })
    expect(waveCarrierBudget(3, false)).toEqual({ buff: 2, debuff: 1 })
    expect(waveCarrierBudget(4, false)).toEqual({ buff: 2, debuff: 2 })
    expect(waveCarrierBudget(8, false)).toEqual({ buff: 2, debuff: 2 })
    expect(waveCarrierBudget(9, false)).toEqual({ buff: 3, debuff: 3 })
    expect(waveCarrierBudget(20, false)).toEqual({ buff: 3, debuff: 3 })
    // Boss 波优先走 Boss 预算（即便波数落在后段）
    expect(waveCarrierBudget(15, true)).toEqual({ buff: 1, debuff: 2 })
  })
})

describe('rollWaveCarriers 本波携带者', () => {
  it('数量 = 预算 buff+debuff，且每件归属本图、极性正确', () => {
    for (const mapId of MAP_IDS) {
      const rng = new Rng(1234)
      const budget = waveCarrierBudget(6, false)
      const carriers = rollWaveCarriers(mapId, 6, false, () => rng.next())
      expect(carriers).toHaveLength(budget.buff + budget.debuff)
      const pool = new Set(fieldPickupsFor(mapId).map((p) => p.id))
      const buffs = carriers.filter((c) => c.polarity === 'buff')
      const debuffs = carriers.filter((c) => c.polarity === 'debuff')
      expect(buffs).toHaveLength(budget.buff)
      expect(debuffs).toHaveLength(budget.debuff)
      for (const c of carriers) expect(pool.has(c.id)).toBe(true)
    }
  })

  it('Boss 波按 1/2 出携带者', () => {
    const rng = new Rng(99)
    const carriers = rollWaveCarriers('forest', 15, true, () => rng.next())
    expect(carriers.filter((c) => c.polarity === 'buff')).toHaveLength(1)
    expect(carriers.filter((c) => c.polarity === 'debuff')).toHaveLength(2)
  })
})
