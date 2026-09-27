import Phaser from 'phaser'
import { heldEmojiKey } from '../emoji/hold'
import type { OutlineKind } from '../emoji/svg'
import { ensureEmoji } from '../emoji/textures'

/** 场景已预载的 emoji 图标 */
export class Icon extends Phaser.GameObjects.Image {
  private side: number

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, size: number, outline?: OutlineKind) {
    super(scene, x, y, heldEmojiKey(scene, id, outline))
    this.side = size
    scene.add.existing(this)
    this.setDisplaySize(size, size)
  }

  setEmoji(id: string, outline?: OutlineKind): this {
    this.setTexture(heldEmojiKey(this.scene, id, outline))
    return this.setDisplaySize(this.side, this.side)
  }

  setSide(size: number): this {
    this.side = size
    return this.setDisplaySize(size, size)
  }
}

/** 显示任意纹理的方形图；未就绪前隐藏，可异步加载未预载的 emoji */
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
    void ensureEmoji(this.scene, id)
      .then((key) => {
        if (ticket !== this.want || !this.active) return
        this.show(key, size)
      })
      .catch((err: unknown) => console.warn(`emoji 加载失败 ${id}: ${String(err)}`))
  }
}
