import Phaser from 'phaser'
import emojiOrderingUrl from '../assets/emoji/ordering.txt?url'
import twemojiUrl from '../assets/emoji/twemoji.txt?url'
import notoUrl from '../assets/emoji/noto.txt?url'
import { loadEmojiTextures, primeEmojiPack } from '../emoji/textures'
import { EMOJI_VENDOR_ID } from '../emoji/vendor'
import type { EmojiVendorId } from '../emoji/vendors'
import { Label } from '../ui'
import { PRELOAD_EMOJIS } from '../manifest'
import { SceneKey } from './keys'

/** 各画风的资源，只下载这次启动用的那一份 */
const BUNDLE_URLS: Readonly<Record<EmojiVendorId, string>> = { twemoji: twemojiUrl, noto: notoUrl }

enum TextAsset {
  EmojiOrdering = 'emoji-ordering',
  EmojiBundle = 'emoji-bundle',
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload)
  }

  preload(): void {
    this.load.text(TextAsset.EmojiOrdering, emojiOrderingUrl)
    this.load.text(TextAsset.EmojiBundle, BUNDLE_URLS[EMOJI_VENDOR_ID])
  }

  create(): void {
    const ordering: unknown = this.cache.text.get(TextAsset.EmojiOrdering)
    const bundle: unknown = this.cache.text.get(TextAsset.EmojiBundle)
    if (typeof ordering !== 'string' || typeof bundle !== 'string') {
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
    loadEmojiTextures(this, PRELOAD_EMOJIS)
      .catch((err) => console.error(`emoji 纹理加载失败: ${String(err)}`))
      .finally(() => this.scene.start(SceneKey.Menu))
  }

  private fail(message: string): void {
    new Label(this, this.scale.width / 2, this.scale.height / 2, message, { kind: 'heading' }).setOrigin(0.5)
  }
}
