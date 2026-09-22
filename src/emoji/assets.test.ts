import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from '../manifest'
import { ANIM_SETS } from './anim'

// 守卫：游戏引用的 emoji ID 必须都在 ordering.txt 里，缺失的在运行时只会渲染不出来
const ordering = new Set(
  readFileSync('src/assets/emoji/ordering.txt', 'utf8').split('\n').map((l) => l.trim()).filter(Boolean),
)

describe('emoji ID 完整性', () => {
  it('预载 / 描边 / 动画引用的每个 emoji ID 都在 ordering 全集中', () => {
    const ids = new Set<string>([
      ...PRELOAD_EMOJIS,
      ...Object.values(OUTLINED_EMOJIS).flat(),
      ...ANIM_SETS.map((s) => s.emoji),
    ])
    const missing = [...ids].filter((id) => !ordering.has(id)).sort()
    expect(missing, `以下 emoji ID 不在 ordering 中：${missing.join(' ')}`).toEqual([])
  })
})
