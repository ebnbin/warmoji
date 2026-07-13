import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('格式化为 m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('小数向下取整、负数按 0 处理', () => {
    expect(formatTime(59.9)).toBe('0:59')
    expect(formatTime(-5)).toBe('0:00')
  })
})
