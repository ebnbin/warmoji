import type Phaser from 'phaser'
import { circleBody } from './body'
import type { ArcadeBody, ImageObj } from './body'

// 敌人/子弹/金币等高频实体一律走池，不 create/destroy

/** 复位纹理/尺寸/碰撞体/速度/tween/tint/翻转；depth、rotation、velocity 由调用方设置 */
export function acquirePooled(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  x: number,
  y: number,
  textureKey: string,
  size: number,
  radius: number,
): ImageObj {
  let obj = group.getFirstDead(false) as ImageObj | null
  if (!obj) {
    obj = scene.add.image(x, y, textureKey)
    scene.physics.add.existing(obj)
    group.add(obj)
  }
  scene.tweens.killTweensOf(obj)
  obj
    .setTexture(textureKey)
    .setActive(true)
    .setVisible(true)
    .setPosition(x, y)
    .setRotation(0)
    .setAlpha(1)
    .setFlipX(false)
    .clearTint()
  obj.setDisplaySize(size, size)
  const body = obj.body as ArcadeBody
  body.enable = true
  body.reset(x, y)
  circleBody(obj, radius)
  return obj
}

export function releasePooled(obj: ImageObj): void {
  obj.scene.tweens.killTweensOf(obj)
  const body = obj.body as ArcadeBody | null
  if (body) {
    body.stop()
    body.enable = false
  }
  obj.setActive(false).setVisible(false)
}
