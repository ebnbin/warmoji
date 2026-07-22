import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import { BOSSES, ENEMY_DEFS } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { packSvg, parseEmojiPack } from './pack'
import { ANIM_SETS, animClipOf, animSetOf, bakeAnimFrame, splitSvg } from './studio'

// 动画资源与真实素材的对账：validateAnimResource 只能查格式，
// 这里对着打包 SVG 查「部件下标是否越界」（bake 对越界静默输出空，必须显式测）
function loadPack(): ReturnType<typeof parseEmojiPack> {
  const ordering = readFileSync('src/assets/emoji/ordering.txt', 'utf8')
  const twemoji = readFileSync('src/assets/emoji/twemoji.txt', 'utf8')
  return parseEmojiPack(ordering, twemoji)
}

describe('实体动画覆盖', () => {
  it('全部实体（角色/队长/敌人/Boss/变形羊/弩塔）都有专属动画', () => {
    const entities = new Set<string>([
      ...Object.values(CHARACTERS).map((c) => c.emoji),
      ...Object.values(CAPTAINS).map((c) => c.emoji),
      ...ENEMY_DEFS.map((e) => e.emoji),
      ...BOSSES.map((e) => e.emoji),
      '1f411', // 🐑 仙子魔尘的变形替身
      '1f3f9', // 🏹 河狸的弩塔装置
    ])
    for (const id of entities) {
      const set = animSetOf(id)
      expect(set, `${id} 缺少动画`).toBeDefined()
      expect(set!.clips.length, `${id} 没有任何 clip`).toBeGreaterThan(0)
      expect(set!.clips[0]!.id, `${id} 首个 clip 应为 idle（待机/代表作约定）`).toBe('idle')
    }
    void PICKUPS
  })

  it('弩塔有独立的 attack 周期 clip（攻速绑定的旗舰用例）', () => {
    const attack = animClipOf('1f3f9', 'attack')
    expect(attack).toBeDefined()
    expect(attack!.kind).toBe('cycle')
    expect(attack!.frames).toBeGreaterThanOrEqual(8)
  })

  it('每个 clip 的部件下标都在真实 SVG 元素范围内，且多相位烘焙不炸', () => {
    const pack = loadPack()
    for (const set of ANIM_SETS) {
      const svg = packSvg(pack, set.emoji)
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
