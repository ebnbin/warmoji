import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from '../boot/preload'
import { ANIM_SETS } from './studio'

// emoji 缺失守卫：游戏引用的每个 emoji ID 都必须在 ordering 全集里
//（ordering.txt 是唯一 SSOT）。PRELOAD_EMOJIS + OUTLINED_EMOJIS 已聚合全部
// 游戏内容 emoji（角色/队长/敌人/道具/地图/武器/拾取/UI 图标/Studio 图标 +
// 各阵营描边变体 + 变形替身 + 亡语弹体），动画集补上被动画的实体。
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
