import { describe, expect, it } from 'vitest'
import { packTint } from './tint'

// 守卫：alpha 越界会在打包时绕回低 8 位，变成本意的反面

/** alpha 通道（0..255） */
const alphaOf = (packed: number): number => (packed >>> 24) & 0xff

describe('packTint', () => {
  it('越界的 alpha 钳住而不是绕回：负数=全透明，超过 1=全不透明', () => {
    expect(alphaOf(packTint(0xffffff, -0.1))).toBe(0)
    expect(alphaOf(packTint(0xffffff, 1.08))).toBe(255)
    expect(alphaOf(packTint(0xffffff, 0))).toBe(0)
    expect(alphaOf(packTint(0xffffff, 1))).toBe(255)
  })
})
