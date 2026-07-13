import { describe, expect, it } from 'vitest'
import { emojiCodepoints } from './emoji'

describe('emojiCodepoints', () => {
  it('单码点', () => {
    expect(emojiCodepoints('😎')).toBe('1f60e')
    expect(emojiCodepoints('⚡')).toBe('26a1')
  })

  it('不含 ZWJ 时去掉 FE0F', () => {
    expect(emojiCodepoints('⚔️')).toBe('2694')
    expect(emojiCodepoints('❤️')).toBe('2764')
  })

  it('含 ZWJ 的序列保留 FE0F', () => {
    expect(emojiCodepoints('🏳️‍🌈')).toBe('1f3f3-fe0f-200d-1f308')
  })
})
