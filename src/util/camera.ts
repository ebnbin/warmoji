import type Phaser from 'phaser'

export function mainCameraOnly<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  obj.cameraFilter = ~obj.scene.cameras.main.id
  return obj
}
