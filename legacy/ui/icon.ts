import Phaser from 'phaser'
import { holdEmoji } from '../emoji/hold'
import type { OutlineKind } from '../emoji/outline'

/** emoji 图标：所在场景持有它的纹理到场景关掉；纹理还没载好时先空着，载好了自己换上 */
export class Icon extends Phaser.GameObjects.Image {
  private side: number
  private want = 0

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, size: number, outline?: OutlineKind) {
    super(scene, x, y, '__DEFAULT')
    this.side = size
    scene.add.existing(this)
    this.setEmoji(id, outline)
  }

  setEmoji(id: string, outline?: OutlineKind): this {
    const ticket = ++this.want
    const { key, ready } = holdEmoji(this.scene, { id, outline })
    if (!ready) return this.setTexture(key).setDisplaySize(this.side, this.side)
    void ready.then(() => {
      if (ticket === this.want && this.active && this.scene.textures.exists(key)) this.setTexture(key).setDisplaySize(this.side, this.side)
    })
    return this.setTexture('__DEFAULT').setDisplaySize(this.side, this.side)
  }

  setSide(size: number): this {
    this.side = size
    return this.setDisplaySize(size, size)
  }
}

/** 显示任意纹理的方形图；未就绪前隐藏，emoji 由所在场景持有、载好再显示 */
export class Picture extends Phaser.GameObjects.Image {
  private side: number
  private want = 0

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    super(scene, x, y, '__DEFAULT')
    this.side = size
    scene.add.existing(this)
    this.setVisible(false)
  }

  show(key: string, size = this.side): this {
    this.want++
    this.side = size
    return this.setTexture(key).setDisplaySize(size, size).setVisible(true)
  }

  hide(): this {
    this.want++
    return this.setVisible(false)
  }

  showEmoji(id: string, size = this.side): void {
    const ticket = ++this.want
    this.setVisible(false)
    const { key, ready } = holdEmoji(this.scene, { id })
    void (ready ?? Promise.resolve()).then(() => {
      if (ticket !== this.want || !this.active || !this.scene.textures.exists(key)) return
      this.show(key, size)
    })
  }
}
