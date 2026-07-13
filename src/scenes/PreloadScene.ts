import Phaser from 'phaser'
import { preloadEmojis } from '../ui/emoji'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload')
  }

  preload(): void {
    // 打成 console.error 让 e2e 的无报错断言能捕获资源缺失
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`资源加载失败: ${file.key}`)
    })
    preloadEmojis(this)
  }

  create(): void {
    this.scene.start('menu')
  }
}
