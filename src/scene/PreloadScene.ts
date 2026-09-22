import Phaser from 'phaser'
import emojiOrderingUrl from '../assets/emoji/ordering.txt?url'
import emojiBundleUrl from '../assets/emoji/twemoji.txt?url'
import { loadEmojiTextures, primeEmojiPack } from '../emoji/textures'
import { FONT, UI_FONT } from '../util/fonts'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from '../manifest'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload')
  }

  preload(): void {
    this.load.text('emoji-ordering', emojiOrderingUrl)
    this.load.text('emoji-bundle', emojiBundleUrl)
  }

  create(): void {
    // Phaser loader 对单文件失败不中断（complete 照常触发），以缓存缺席为准
    const ordering = this.cache.text.get('emoji-ordering') as string | undefined
    const bundle = this.cache.text.get('emoji-bundle') as string | undefined
    if (ordering === undefined || bundle === undefined) {
      this.fail('资源加载失败，请检查网络后刷新')
      return
    }
    try {
      primeEmojiPack(ordering, bundle)
    } catch (err) {
      console.error(`emoji 包解析失败: ${String(err)}`)
      this.fail('资源解析失败，请刷新重试')
      return
    }
    // 单个纹理烘焙失败不拦：console.error 由 e2e 捕获
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
