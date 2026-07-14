import { describe, expect, it } from 'vitest'
import { ZONES, XP } from './config'
import { inZone, nextZoneKind, ZONE_ROTATION, ZONE_SPECS, zoneKindForLevel } from './zones'

describe('领域类型轮换', () => {
  it('首次升级（2 级）为战意，之后按 战→愈→迟 循环', () => {
    expect(zoneKindForLevel(2)).toBe('war')
    expect(zoneKindForLevel(3)).toBe('heal')
    expect(zoneKindForLevel(4)).toBe('chill')
    expect(zoneKindForLevel(5)).toBe('war')
    expect(zoneKindForLevel(11)).toBe('war')
  })

  it('HUD 预告 = 下一级的类型', () => {
    expect(nextZoneKind(1)).toBe(zoneKindForLevel(2))
    expect(nextZoneKind(4)).toBe(zoneKindForLevel(5))
  })

  it('每种类型有 emoji/名字/说明/颜色', () => {
    for (const kind of ZONE_ROTATION) {
      const spec = ZONE_SPECS[kind]
      expect(spec.emoji.length).toBeGreaterThan(0)
      expect(spec.name.length).toBeGreaterThan(0)
      expect(spec.desc.length).toBeGreaterThan(0)
    }
  })
})

describe('领域判定', () => {
  it('圆内含边界，圆外不算', () => {
    expect(inZone(0, 0, 10, 6, 8)).toBe(true)
    expect(inZone(0, 0, 10, 10, 0)).toBe(true)
    expect(inZone(0, 0, 10, 8, 8)).toBe(false)
  })
})

describe('数值防线', () => {
  it('单次击杀经验低于任何升级门槛：一杀最多升一级（图腾不会同点叠放）', () => {
    // 若未来加大单杀经验或引入经验道具，此假设失效时需要给种图腾加散点逻辑
    expect(XP.base).toBeGreaterThan(3)
  })

  it('组合减速有保底：迟滞域 × 寒气光环不会把敌人钉死', () => {
    expect(ZONES.chill.speedMul * 0.5).toBeLessThan(ZONES.minSlowMul)
    expect(ZONES.minSlowMul).toBeGreaterThan(0)
  })
})
