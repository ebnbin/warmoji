import { describe, expect, it } from 'vitest'
import { BLOB, ENEMY_SPECS, MUSHROOM, ZOMBIE } from './config'
import { enemyMixAt, pickEnemy } from './enemies'
import { Rng } from './rng'

describe('敌人规格', () => {
  it('每种敌人字段合法：血量/速度/经验为正，尺寸大于判定半径', () => {
    for (const e of ENEMY_SPECS) {
      expect(e.hp).toBeGreaterThan(0)
      expect(e.speed).toBeGreaterThan(0)
      expect(e.xp).toBeGreaterThan(0)
      expect(e.damage).toBeGreaterThan(0)
      expect(e.size).toBeGreaterThan(e.radius)
      expect(e.emoji.length).toBeGreaterThan(0)
    }
  })

  it('特殊死亡配置：蘑菇留毒、泡泡分裂为迷你体且迷你体不再分裂', () => {
    expect(MUSHROOM.poison!.durationMs).toBeGreaterThan(0)
    expect(BLOB.split!.count).toBe(2)
    expect(BLOB.split!.into.split).toBeUndefined()
    expect(BLOB.split!.into.hp).toBeLessThan(BLOB.hp)
  })
})

describe('出场配比', () => {
  it('第 1 波只有僵尸+幽灵；新怪按波次渐入；第 5 波全员到齐', () => {
    expect(enemyMixAt(1).map((m) => m.spec.kind).sort()).toEqual(['ghost', 'zombie'])
    expect(enemyMixAt(2).some((m) => m.spec.kind === 'invader')).toBe(true)
    expect(enemyMixAt(2).some((m) => m.spec.kind === 'boar')).toBe(false)
    expect(enemyMixAt(5).map((m) => m.spec.kind).sort()).toEqual(
      ['blob', 'boar', 'ghost', 'invader', 'mushroom', 'rat', 'snake', 'zombie'],
    )
  })

  it('僵尸始终是主体（权重最高且有下限）', () => {
    for (const wave of [1, 5, 10, 20, 40]) {
      const mix = enemyMixAt(wave)
      const zombie = mix.find((m) => m.spec === ZOMBIE)!
      for (const m of mix) expect(zombie.weight).toBeGreaterThanOrEqual(m.weight)
      expect(zombie.weight).toBeGreaterThanOrEqual(40)
    }
  })

  it('加权抽取覆盖全部在场种类且比例大致符合权重', () => {
    const mix = enemyMixAt(6)
    const rng = new Rng(42)
    const counts = new Map<string, number>()
    for (let i = 0; i < 8000; i++) {
      const s = pickEnemy(mix, () => rng.next())
      counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
    }
    expect(counts.size).toBe(mix.length)
    const total = mix.reduce((s, m) => s + m.weight, 0)
    for (const m of mix) {
      const got = (counts.get(m.spec.kind) ?? 0) / 8000
      expect(Math.abs(got - m.weight / total)).toBeLessThan(0.03)
    }
  })
})
