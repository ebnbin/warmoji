import { describe, expect, it } from 'vitest'
import { ENEMY_DEFS } from './registry'
import { enemyMixAt, fleeSteer, pickEnemy } from './registry'

const ZOMBIE = ENEMY_DEFS.find((e) => e.kind === 'zombie')!
const MUSHROOM = ENEMY_DEFS.find((e) => e.kind === 'mushroom')!
const BLOB = ENEMY_DEFS.find((e) => e.kind === 'blob')!
import { Rng } from '../core/rng'

describe('敌人规格', () => {
  it('每种敌人字段合法：血量/速度/经验为正，尺寸大于判定半径', () => {
    for (const e of ENEMY_DEFS) {
      expect(e.hp).toBeGreaterThan(0)
      // 原地怪（巢穴）速度恒零，其余必须有正移速
      if (e.locomotion.kind !== 'static') expect(e.speed).toBeGreaterThan(0)
      expect(e.xp).toBeGreaterThan(0)
      expect(e.damage).toBeGreaterThan(0)
      expect(e.size).toBeGreaterThan(e.radius)
      expect(e.emoji.length).toBeGreaterThan(0)
    }
  })

  it('特殊死亡配置：蘑菇留毒、泡泡分裂为迷你体且迷你体不再分裂', () => {
    const ground = MUSHROOM.onDeath!.find((d) => d.kind === 'ground')!
    if (ground.kind !== 'ground') throw new Error('蘑菇应有留毒（ground）效果')
    expect(ground.def.durationMs).toBeGreaterThan(0)
    const split = BLOB.onDeath!.find((d) => d.kind === 'split')!
    if (split.kind !== 'split') throw new Error('泡泡应有分裂效果')
    expect(split.count).toBe(2)
    expect(split.into.onDeath).toBeUndefined()
    expect(split.into.hp).toBeLessThan(BLOB.hp)
  })
})

describe('出场配比', () => {
  it('第 1 波只有僵尸+幽灵；新怪按波次渐入；第 5 波全员到齐', () => {
    expect(enemyMixAt(1).map((m) => m.def.kind).sort()).toEqual(['ghost', 'zombie'])
    expect(enemyMixAt(2).some((m) => m.def.kind === 'invader')).toBe(true)
    expect(enemyMixAt(2).some((m) => m.def.kind === 'boar')).toBe(false)
    expect(enemyMixAt(5).map((m) => m.def.kind).sort()).toEqual(
      ['blob', 'boar', 'ghost', 'invader', 'mushroom', 'rat', 'slime', 'snake', 'zombie'],
    )
  })

  it('僵尸始终是主体（权重最高且有下限）', () => {
    for (const wave of [1, 5, 10, 20, 40]) {
      const mix = enemyMixAt(wave)
      const zombie = mix.find((m) => m.def === ZOMBIE)!
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
      const got = (counts.get(m.def.kind) ?? 0) / 8000
      expect(Math.abs(got - m.weight / total)).toBeLessThan(0.03)
    }
  })
})

describe('逃离转向（fleeSteer）', () => {
  const W = 1600
  const H = 1600
  const M = 96

  it('地图中央：原样沿逃离方向', () => {
    const d = fleeSteer(800, 800, -1, 0, W, H, M)
    expect(d.x).toBeCloseTo(-1)
    expect(d.y).toBeCloseTo(0)
  })

  it('顶着左边缘逃：被折向内侧（不再向外顶）', () => {
    const d = fleeSteer(10, 800, -1, 0, W, H, M)
    expect(d.x).toBeGreaterThan(0)
  })

  it('斜向撞下边缘：竖直分量翻向内，水平分量保留（沿墙滑行）', () => {
    const d = fleeSteer(800, H - 10, 0.7071, 0.7071, W, H, M)
    expect(d.y).toBeLessThan(0)
    expect(d.x).toBeGreaterThan(0)
  })

  it('角落完全抵消时走切线，永不返回零向量', () => {
    const d = fleeSteer(0, 800, -2, 0, W, H, M)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1)
  })
})
