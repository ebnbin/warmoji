import Phaser from 'phaser'
import emojiIndexUrl from '../assets/emoji/index.json?url'
import emojiPackUrl from '../assets/emoji/pack.txt?url'
import { loadEmojiTextures, primeEmojiPack } from '../emoji/textures'
import type { EmojiIndex } from '../emoji/pack'
import { FONT, UI_FONT } from '../lib/fonts'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from './preload'

// 资源门禁：emoji 包（索引 + SVG 正文）是游戏的全部视觉素材，经 Phaser
// loader 预加载，拿不到或解析不了就停在本页——没有 emoji 数据游戏没有
// 开始的意义。包文件是带内容 hash 的构建资产，与代码同版本原子部署。
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload')
  }

  preload(): void {
    this.load.json('emoji-index', emojiIndexUrl)
    this.load.text('emoji-pack', emojiPackUrl)
  }

  create(): void {
    // Phaser loader 对单文件失败不中断（complete 照常触发），以缓存缺席为准
    const index = this.cache.json.get('emoji-index') as EmojiIndex | undefined
    const text = this.cache.text.get('emoji-pack') as string | undefined
    if (index === undefined || text === undefined) {
      this.fail('资源加载失败，请检查网络后刷新')
      return
    }
    try {
      primeEmojiPack(index, text)
    } catch (err) {
      console.error(`emoji 包解析失败: ${String(err)}`)
      this.fail('资源解析失败，请刷新重试')
      return
    }
    // 单个纹理烘焙失败保持宽容（console.error 让 e2e 捕获）；包已就位即放行
    loadEmojiTextures(this, PRELOAD_EMOJIS, OUTLINED_EMOJIS)
      .catch((err) => console.error(`emoji 纹理加载失败: ${String(err)}`))
      .finally(() => this.scene.start('menu'))
  }

  private fail(message: string): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        color: '#ffffff',
      })
      .setOrigin(0.5)
  }
}
