import { describe, expect, it } from 'vitest'
import {
  fogAlphaAt as _fogAlphaAt,
  fogRadiusAt as _fogRadiusAt,
  hourAt as _hourAt,
  isDayAt,
  nightDepthAt,
  visionGridsAt as _visionGridsAt,
} from './daynight'
import { MAPS } from './registry'

// 昼夜设计参数取自地图数据（晨昏原野）；纯函数按此 cfg 求值
const cfg = MAPS.daynight.dayNight!
const hourAt = (s: number): number => _hourAt(s, cfg)
const visionGridsAt = (h: number): number => _visionGridsAt(h, cfg)
const fogRadiusAt = (h: number): number => _fogRadiusAt(h, cfg)
const fogAlphaAt = (h: number): number => _fogAlphaAt(h, cfg)

describe('昼夜时钟与视野', () => {
  it('主时钟：wave1 从黎明 06:00 起，48 秒回卷一整天', () => {
    expect(hourAt(0)).toBeCloseTo(6)
    expect(hourAt(12)).toBeCloseTo(12) // 12 秒 → 正午
    expect(hourAt(24)).toBeCloseTo(18) // 24 秒 → 黄昏
    expect(hourAt(36)).toBeCloseTo(0) // 36 秒 → 午夜（回卷到 0）
    expect(hourAt(48)).toBeCloseTo(6) // 一整周期后回到黎明
    // 跨波持久：累计秒继续累加，第二天正午同样是 30 视野
    expect(hourAt(48 + 12)).toBeCloseTo(12)
  })

  it('视野曲线：正午 30、黄昏/黎明 20、午夜 10，且平滑单峰', () => {
    expect(visionGridsAt(12)).toBeCloseTo(cfg.visionMax) // 30
    expect(visionGridsAt(6)).toBeCloseTo(cfg.visionMid) // 20
    expect(visionGridsAt(18)).toBeCloseTo(cfg.visionMid) // 20
    expect(visionGridsAt(0)).toBeCloseTo(cfg.visionMin) // 10
    expect(visionGridsAt(24)).toBeCloseTo(cfg.visionMin)
    // 上午单调升、下午单调降
    expect(visionGridsAt(9)).toBeGreaterThan(visionGridsAt(7))
    expect(visionGridsAt(15)).toBeGreaterThan(visionGridsAt(17))
  })

  it('昼夜划分：06:00–18:00 为白天', () => {
    expect(isDayAt(6)).toBe(true)
    expect(isDayAt(12)).toBe(true)
    expect(isDayAt(17.9)).toBe(true)
    expect(isDayAt(18)).toBe(false)
    expect(isDayAt(0)).toBe(false)
    expect(isDayAt(5.9)).toBe(false)
  })

  it('夜深与迷雾：白天无雾，午夜最紧最浓', () => {
    // 白天恒 0
    expect(nightDepthAt(12)).toBe(0)
    expect(fogAlphaAt(12)).toBe(0)
    // 黄昏/黎明临界：夜深 0、雾不挡
    expect(nightDepthAt(18)).toBeCloseTo(0)
    expect(nightDepthAt(6)).toBeCloseTo(0)
    expect(fogAlphaAt(18)).toBeCloseTo(0)
    // 午夜：夜深 1、迷雾最浓最小
    expect(nightDepthAt(0)).toBeCloseTo(1)
    expect(fogAlphaAt(0)).toBeCloseTo(cfg.fogAlphaMax)
    expect(fogRadiusAt(0)).toBeCloseTo(cfg.fogRadiusMidnight)
    expect(fogRadiusAt(18)).toBeCloseTo(cfg.fogRadiusDusk)
    // 越接近午夜，圈越小
    expect(fogRadiusAt(1)).toBeLessThan(fogRadiusAt(3))
  })
})
