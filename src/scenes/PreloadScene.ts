import Phaser from 'phaser'
import { loadEmojiTextures } from '../ui/emoji'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload')
  }

  create(): void {
    loadEmojiTextures(this)
      .catch((err) => console.error(`emoji 纹理加载失败: ${String(err)}`))
      .finally(() => this.scene.start('menu'))
  }
}
