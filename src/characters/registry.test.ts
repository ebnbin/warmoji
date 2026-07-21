import { describe, expect, it } from 'vitest'
import { CHARACTERS, loadoutFor, baseLoadout, upgradeCardsFor } from './registry'
import type { CharacterId } from './registry'

const IDS = Object.keys(CHARACTERS) as CharacterId[]
const NONE = { u1: false, u2: false }
const T1 = { u1: true, u2: false }
const T2 = { u1: true, u2: true }

describe('花名册', () => {
  it('emoji 不重复，每人有名字、介绍且至少 1 个攻击来源', () => {
    const roster = Object.values(CHARACTERS)
    expect(new Set(roster.map((c) => c.emoji)).size).toBe(roster.length)
    for (const c of roster) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.desc.length).toBeGreaterThan(0)
      expect(c.carriers.length).toBeGreaterThan(0)
    }
  })

  it('覆盖全部攻击形态（含新机制型能力）', () => {
    const kinds = Object.values(CHARACTERS).flatMap((c) => baseLoadout(c).map((w) => w.kind))
    expect(new Set(kinds)).toEqual(
      new Set([
        'projectile',
        'thrust',
        'sweep',
        'areaBlast',
        'boomerang',
        'laser',
        'slowAura',
        'assassinate',
        'turret',
        'summon',
        'heal',
        'chainArc',
      ]),
    )
    // 双持：牛仔两件武器；军医 = 治疗 + 保底飞针（两个徒手载体）
    expect(CHARACTERS.cowboy.carriers.length).toBe(2)
    expect(baseLoadout(CHARACTERS.medic).map((w) => w.kind)).toEqual(['heal', 'projectile'])
    // 自体攻击（无持有物）：杂耍者与独角兽
    const jugglerBase = baseLoadout(CHARACTERS.juggler)[0]!
    expect('held' in jugglerBase && jugglerBase.held).toBeFalsy()
    // 仙子的魔尘弹自带变形载荷（新引擎能力的数据入口）
    const bolt = baseLoadout(CHARACTERS.fairy)[0]!
    if (bolt.kind !== 'projectile') throw new Error('kind 不变')
    const morph = bolt.onHit?.find((e) => e.kind === 'morph')
    if (morph?.kind !== 'morph') throw new Error('缺 morph 效果')
    expect(morph.morphEmoji).toBe('1f411')
  })
})

describe('升级卡换持档位行', () => {
  it('未购升级卡持基础行；每个角色都有两档且逐档配装实际变化', () => {
    for (const id of IDS) {
      const def = CHARACTERS[id]
      const base = baseLoadout(def)
      expect(loadoutFor(def, NONE)).toEqual(base)
      const cards = upgradeCardsFor(def)
      expect(cards).toHaveLength(2)
      for (const a of cards) {
        expect(a.icon.length).toBeGreaterThan(0)
        expect(a.name.length).toBeGreaterThan(0)
        expect(a.desc.length).toBeGreaterThan(0)
      }
      expect(loadoutFor(def, T1)).not.toEqual(base)
      expect(loadoutFor(def, T2)).not.toEqual(loadoutFor(def, T1))
      // 换持不增减载体数量
      expect(loadoutFor(def, T1)).toHaveLength(base.length)
      expect(loadoutFor(def, T2)).toHaveLength(base.length)
    }
  })

  it('杂耍演员：一阶齐射、二阶追加溅射', () => {
    const [w3] = loadoutFor(CHARACTERS.juggler, T1)
    if (w3?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w3.volley?.count).toBe(3)
    expect(w3.onHit).toBeUndefined()
    const [w6] = loadoutFor(CHARACTERS.juggler, T2)
    if (w6?.kind !== 'projectile') throw new Error('kind 不变')
    expect(w6.volley?.count).toBe(3)
    const blast = w6.onHit?.find((e) => e.kind === 'blast')
    if (blast?.kind !== 'blast') throw new Error('缺 blast 效果')
    expect(blast.ratio).toBeCloseTo(0.6)
  })

  it('巨魔：一阶弧宽变整圈；牛仔双枪都获得贯穿', () => {
    const [sweep] = loadoutFor(CHARACTERS.troll, T1)
    if (sweep?.kind !== 'sweep') throw new Error('kind 不变')
    expect(sweep.arcDeg).toBe(360)
    const pistols = loadoutFor(CHARACTERS.cowboy, T1)
    expect(pistols).toHaveLength(2)
    for (const p of pistols) {
      if (p.kind !== 'projectile') throw new Error('kind 不变')
      expect(p.pierce).toBe(2)
    }
  })

  it('袋鼠二阶：镖体与判定同步放大且带磁力', () => {
    const [b3] = loadoutFor(CHARACTERS.kangaroo, T1)
    const [b6] = loadoutFor(CHARACTERS.kangaroo, T2)
    if (b3?.kind !== 'boomerang' || b6?.kind !== 'boomerang') throw new Error('kind 不变')
    expect(b3.twin).toBe(true)
    expect(b3.coinMagnetRadius).toBeUndefined()
    expect(b6.hitRadius).toBeCloseTo(b3.hitRadius * 1.4)
    expect(b6.held.size).toBeCloseTo(b3.held.size * 1.4)
    expect(b6.coinMagnetRadius).toBeGreaterThan(0)
  })

  it('雪人：一阶冻伤 dps、二阶追加冰冻脉冲；机器人二阶 8 向扫射', () => {
    const [aura] = loadoutFor(CHARACTERS.snowman, T2)
    if (aura?.kind !== 'slowAura') throw new Error('kind 不变')
    expect(aura.dps).toBeGreaterThan(0)
    expect(aura.freeze?.durationMs).toBeGreaterThan(0)
    const [laser] = loadoutFor(CHARACTERS.robot, T2)
    if (laser?.kind !== 'laser') throw new Error('kind 不变')
    expect(laser.radial?.beams).toBe(8)
  })

  it('军医：档位只换治疗能力，飞针原样保留', () => {
    const [med2, dart2] = loadoutFor(CHARACTERS.medic, T2)
    if (med2?.kind !== 'heal') throw new Error('kind 不变')
    expect(med2.aoe?.ratio).toBeCloseTo(0.6)
    expect(med2.defib?.reviveCutMs).toBe(2000)
    // 飞针载体无升级：各档恒为基础行
    expect(dart2).toEqual(baseLoadout(CHARACTERS.medic)[1])
  })
})
