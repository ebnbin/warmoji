import type Phaser from 'phaser'
import { circleBody } from './arcade'
import type { ArcadeBody, ImageObj } from './arcade'

// 实体对象池（Phaser 原生 Group 空位复用）：敌人/子弹/金币等高频生灭实体不再
// create/destroy，而是从组内取「死」对象复用、回收时失活留组待用——消除逐帧
// GameObject+Body 的分配与 GC（移动端掉帧主因）。异构 emoji 靠复用时换纹理支持。

/** 从组内取一个失活对象复用（无则新建），并复位成「刚出生」状态：换纹理、
 * 定显示尺寸、重建圆形碰撞体、清速度/tween/tint/翻转、开体、激活可见。
 * depth / rotation / velocity 由调用方取得后自行设置。 */
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

/** 回收进池：停速度、关体、隐藏、失活（留在组内待复用）。 */
export function releasePooled(obj: ImageObj): void {
  obj.scene.tweens.killTweensOf(obj)
  const body = obj.body as ArcadeBody | null
  if (body) {
    body.stop()
    body.enable = false
  }
  obj.setActive(false).setVisible(false)
}
