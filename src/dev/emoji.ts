import type Phaser from 'phaser'
import type { DevProvider } from '../devtools'
import { emojiHoldStats } from '../emoji/hold'
import { emojiPackStats, emojiTextureStats, evictUnpinnedEmoji } from '../emoji/textures'
import { emojiThumbStats } from '../emoji/thumbs'

function emojiText(game: Phaser.Game): string {
  const pack = emojiPackStats()
  const tex = emojiTextureStats(game.textures)
  const hold = emojiHoldStats(game)
  const thumbs = emojiThumbStats()
  return [
    pack ? `资源包 ${pack.ids} 个 emoji` : '资源包未加载',
    `纹理 ${tex.textures} 个 · LRU 跟踪 ${tex.tracked} / 上限 ${tex.limit} · 固定 ${tex.pinned} · 生成中 ${tex.inflight}`,
    `持有表 键 ${hold.table.keys} · 引用 ${hold.table.refs} · 生成中 ${hold.table.loading} · 待释放 ${hold.table.pendingRelease}`,
    `各 scene 持有：${hold.scenes.length > 0 ? hold.scenes.map((s) => `${s.key} ${s.holds}`).join(' · ') : '无'}`,
    `缩略图 就绪 ${thumbs.ready} · 生成中 ${thumbs.inflight} · 尺寸 ${thumbs.size}`,
  ].join('\n')
}

/** 游戏级：emoji 资源流水线的状态 */
export function emojiProvider(game: Phaser.Game): DevProvider {
  return {
    id: 'emoji',
    title: 'emoji',
    sections: [
      {
        id: 'emoji',
        title: 'emoji',
        items: () => [
          { kind: 'text', mono: true, read: () => emojiText(game) },
          {
            kind: 'buttons',
            buttons: [{ label: '释放未固定的 emoji 纹理', run: () => console.warn(`释放了 ${evictUnpinnedEmoji(game.textures)} 个 emoji 纹理`) }],
          },
        ],
      },
    ],
  }
}
