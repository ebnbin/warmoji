import { describe, expect, it } from 'vitest'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from './preload'
import { BOSSES, ENEMY_DEFS } from '../data/enemies'
import { CARDS } from '../data/cards'
import { FIELD_PICKUPS } from '../data/battlefield'
import { ITEMS } from '../data/items'

// emojiImage 只引用纹理键、不烘焙——内容 emoji 漏进预载清单即渲染成缺失贴图（绿框），
// 且 e2e 对未预载 emoji 不报控制台错误、逮不到。故此处按「渲染变体」守住各内容表：
// 无描边渲染的看 PRELOAD_EMOJIS，玩家侧描边渲染的看 OUTLINED_EMOJIS.player。
// （PRELOAD_EMOJIS 含全部 OUTLINED 展开，故描边项也天然有无描边变体供富文本/横幅用。）
describe('预载清单覆盖', () => {
  const preloaded = new Set(PRELOAD_EMOJIS)
  const playerOutlined = new Set(OUTLINED_EMOJIS.player)

  it('所有敌方亡语冷枪（onDeath spawnProjectile）的弹体 emoji 都在预载里', () => {
    const projectiles = new Set(OUTLINED_EMOJIS.enemyProjectile)
    for (const e of [...ENEMY_DEFS, ...BOSSES]) {
      for (const fx of e.onDeath ?? []) {
        if (fx.kind === 'spawnProjectile') {
          expect(projectiles.has(fx.projectile.emoji), `${e.name} 亡语弹 ${fx.projectile.emoji} 漏预载`).toBe(
            true,
          )
        }
      }
    }
  })

  it('团队升级卡图标全部预载（CardScene 无描边渲染）', () => {
    for (const c of Object.values(CARDS)) {
      expect(preloaded.has(c.emoji), `团队卡「${c.name}」图标 ${c.emoji} 漏预载`).toBe(true)
    }
  })

  it('战场拾取图标全部预载（地面/HUD 玩家侧描边渲染）', () => {
    for (const p of Object.values(FIELD_PICKUPS)) {
      expect(playerOutlined.has(p.emoji), `战场拾取「${p.name}」图标 ${p.emoji} 漏预载`).toBe(true)
    }
  })

  it('商店/开箱道具图标全部预载（无描边渲染）', () => {
    for (const [id, i] of Object.entries(ITEMS)) {
      expect(preloaded.has(i.emoji), `道具「${id}」图标 ${i.emoji} 漏预载`).toBe(true)
    }
  })
})
