import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import { BOSS, ENEMY_DEFS } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { emojiCodepoints } from './codepoints'
import { packSvg, parseEmojiPack } from './pack'
import { ANIM_SETS, animClipOf, animSetOf, bakeAnimFrame, splitSvg } from './studio'

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
  it('全部实体（角色/队长/敌人/Boss/变形羊/弩塔）都有专属动画', () => {
    const entities = new Set<string>([
      ...Object.values(CHARACTERS).map((c) => c.emoji),
      ...Object.values(CAPTAINS).map((c) => c.emoji),
      ...ENEMY_DEFS.map((e) => e.emoji),
      BOSS.emoji,
      '🐑', // 仙子魔尘的变形替身
      '🏹', // 河狸的弩塔装置
    ])
    for (const emoji of entities) {
      const set = animSetOf(emoji)
      expect(set, `${emoji} 缺少动画`).toBeDefined()
      expect(set!.clips.length, `${emoji} 没有任何 clip`).toBeGreaterThan(0)
      expect(set!.clips[0]!.id, `${emoji} 首个 clip 应为 idle（待机/代表作约定）`).toBe('idle')
    }
    void PICKUPS
  })

  it('弩塔有独立的 attack 周期 clip（攻速绑定的旗舰用例）', () => {
    const attack = animClipOf('🏹', 'attack')
    expect(attack).toBeDefined()
    expect(attack!.kind).toBe('cycle')
    expect(attack!.frames).toBeGreaterThanOrEqual(8)
  })

  it('每个 clip 的部件下标都在真实 SVG 元素范围内，且多相位烘焙不炸', () => {
    const pack = loadPack()
    for (const set of ANIM_SETS) {
      const svg = packSvg(pack, emojiCodepoints(set.emoji))
      expect(svg, `${set.emoji} 不在打包资源中`).toBeTruthy()
      const n = splitSvg(svg!).els.length
      for (const clip of set.clips) {
        for (const part of clip.parts) {
          for (const i of part.indices) {
            expect(
              i,
              `${set.emoji}「${set.name}」clip=${clip.id} 部件下标 ${i} 越界（共 ${n} 个元素）`,
            ).toBeLessThan(n)
          }
        }
        for (const t of [0, 0.33, 0.61, 0.99]) {
          const frame = bakeAnimFrame(svg!, clip, t)
          expect(
            frame.startsWith('<svg'),
            `${set.emoji} clip=${clip.id} 相位 ${t} 烘焙产物非法`,
          ).toBe(true)
          expect(frame.endsWith('</svg>')).toBe(true)
        }
      }
    }
  })
})
