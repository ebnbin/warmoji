import Phaser from 'phaser'
import { loadEmojiTextures } from '../emoji/textures'
import { OUTLINED_EMOJIS, PRELOAD_EMOJIS } from './preload'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload')
  }

  create(): void {
    loadEmojiTextures(this, PRELOAD_EMOJIS, OUTLINED_EMOJIS)
      .catch((err) => console.error(`emoji 纹理加载失败: ${String(err)}`))
      .finally(() => this.scene.start('menu'))
  }
}
