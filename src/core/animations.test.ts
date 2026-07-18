import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOSS, CAPTAINS, CHARACTERS, CHEST, COIN, ENEMY_SPECS } from './config'
import { emojiCodepoints } from './emoji'
import { packSvg, parseEmojiPack } from './emojipack'
import { ANIM_RECIPES, animRecipeOf, bakeAnimFrame, splitSvg } from './studio'

// 动画资源与真实素材的对账：validateAnimResource 只能查格式，
// 这里对着打包 SVG 查「部件下标是否越界」（bake 对越界静默输出空，必须显式测）
function loadPack(): ReturnType<typeof parseEmojiPack> {
  const index = JSON.parse(readFileSync('public/emoji/index.json', 'utf8')) as Parameters<
    typeof parseEmojiPack
  >[0]
  const text = readFileSync('public/emoji/pack.txt', 'utf8')
  return parseEmojiPack(index, text)
}

describe('实体动画覆盖', () => {
  it('全部实体（角色/队长/敌人/Boss/变形羊/弩塔）都有专属动画配方', () => {
    const entities = new Set<string>([
      ...Object.values(CHARACTERS).map((c) => c.emoji),
      ...Object.values(CAPTAINS).map((c) => c.emoji),
      ...ENEMY_SPECS.map((e) => e.emoji),
      BOSS.emoji,
      '🐑', // 仙子魔尘的变形替身
      '🏹', // 河狸的弩塔装置
    ])
    for (const emoji of entities) {
      expect(animRecipeOf(emoji), `${emoji} 缺少动画配方`).toBeDefined()
    }
    void COIN
    void CHEST
  })

  it('每条配方的部件下标都在真实 SVG 元素范围内，且多相位烘焙不炸', () => {
    const pack = loadPack()
    for (const recipe of ANIM_RECIPES) {
      const svg = packSvg(pack, emojiCodepoints(recipe.emoji))
      expect(svg, `${recipe.emoji} 不在打包资源中`).toBeTruthy()
      const n = splitSvg(svg!).els.length
      for (const part of recipe.parts) {
        for (const i of part.indices) {
          expect(i, `${recipe.emoji}「${recipe.name}」部件下标 ${i} 越界（共 ${n} 个元素）`).toBeLessThan(n)
        }
      }
      for (const t of [0, 0.33, 0.61, 0.99]) {
        const frame = bakeAnimFrame(svg!, recipe, t)
        expect(frame.startsWith('<svg'), `${recipe.emoji} 相位 ${t} 烘焙产物非法`).toBe(true)
        expect(frame.endsWith('</svg>')).toBe(true)
      }
    }
  })
})
